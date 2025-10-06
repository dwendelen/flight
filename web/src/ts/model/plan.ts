

interface TripPlan extends VersionedEntity {
    type: "plan"
    trip: TripId
    powerSetting: string | null
    ias: number | null
    tas: number | null
    fuelFlow: number | null
    variation: number | null // TODO input
    fuelContingencyFactor: number | null // TODO input
    finalReserve: Duration | null // TODO input // TODO to seconds
    takeoffTime: Duration | null // TODO input // TODO to seconds
    takeoffFuel: number | null // TODO input
    landingTime:  Duration | null // TODO input // TODO to seconds
    landingFuel: number | null // TODO input
    stops: Stop[]
    flightPlans: FlightPlan[]
}

interface Stop {
    aerodrome: AerodromeVersion
    refuel: boolean
}

interface FlightPlan {
    waypoints: Waypoint[]
    legs: Leg[]
}

type WaypointType =
    "take-off" |
    "simple" |
    "rate-one" |
    "landing"

interface Waypoint {
    name: string
    type: WaypointType
    altitude: number | null
    eta: number | null
}

interface Leg  {
    trueTrack: number | null
    distance: number | null
    windDirection: number | null
    windVelocity: number | null
    altitude: number | null
    msa: number | null
    notes: Note[]
}

interface Note {
    time: Duration | null
    note: string
    number: string
}


interface CalculatedTrip {
    powerSetting: string | null
    ias: number | null
    plans: CalculatedPlan[]
}

interface CalculatedPlan {
    waypoints: CalculatedWaypoint[]
    legs: CalculatedLeg[]
}

interface CalculatedWaypoint {
    name: string
    type: WaypointType | null
    alt: number | null
    fuel: number | null
    eta: Time | null
    blockFuel: number | null
    blockEta: Time | null
}

interface CalculatedLeg {
    leg: Leg
    mh: number | null
    mt: number | null
    gs: number | null
    alt: number | null
    msa: number | null
    fuel: number | null
    ete: Duration | null
    notes: Note[]
}

const RADIANS_PER_DEGREE = 2 * Math.PI / 360
const DEGREES_PER_RADIAN = 1 / RADIANS_PER_DEGREE

function calculatePlan(tripPlan: TripPlan): CalculatedTrip {
    let fuelFlow = mul(tripPlan.fuelFlow, tripPlan.fuelContingencyFactor)

    let plans: CalculatedPlan[] = tripPlan.flightPlans.map(fp => {
        let waypoints: CalculatedWaypoint[] = fp.waypoints.map(wp => {
            if(wp.type === "landing" || wp.type === "take-off") {
                return {
                    type: wp.type,
                    name: wp.name,
                    alt: wp.altitude,
                    fuel: null,
                    eta: null,
                    blockFuel: null,
                    blockEta: wp.eta
                }
            } else {
                return {
                    type: wp.type,
                    name: wp.name,
                    alt: wp.altitude,
                    fuel: null,
                    eta: wp.eta,
                    blockFuel: null,
                    blockEta: null
                }
            }
        });
        let legs = fp.legs.map(leg => {
            let mt = subt(leg.trueTrack, tripPlan.variation)

            let relative_wind_radians = mul(RADIANS_PER_DEGREE, subt(add(leg.windDirection, 180), leg.trueTrack));
            let cross = mul(leg.windVelocity, sin(relative_wind_radians))
            let tail = mul(leg.windVelocity, cos(relative_wind_radians))
            let drift_radians = asin(divi(cross, tripPlan.tas))
            let gs = add(mul(tripPlan.tas, cos(drift_radians)), tail)
            let th = subt(leg.trueTrack, mul(drift_radians, DEGREES_PER_RADIAN))

            let mh = subt(th, tripPlan.variation)

            let ete = hoursToDuration(divi(leg.distance, gs))

            let fuel = mul(fuelFlow, durationToHours(ete))

            return {
                leg: leg,
                mh: mh,
                mt: mt,
                gs: gs,
                alt: leg.altitude,
                msa: leg.msa,
                fuel: fuel,
                ete: ete,
                notes: leg.notes
            }
        });
        // Calculate ETA
        let nbFixedETAs = waypoints
            .filter(wp => wp.eta != null || wp.blockEta != null)
            .length
        if(nbFixedETAs == 1) {
            let idx = waypoints
                .findIndex(wp => wp.eta != null || wp.blockEta != null);
            let time: Time
            if(waypoints[idx].type === "landing") {
                waypoints[idx].eta = subt(waypoints[idx].blockEta, tripPlan.landingTime)
                time = waypoints[idx].blockEta
            } else if(waypoints[idx].type === "take-off") {
                waypoints[idx].eta = add(waypoints[idx].blockEta, tripPlan.takeoffTime)
                time = waypoints[idx].eta
            } else {
                time = waypoints[idx].eta
            }
            for (let i = idx + 1; i < waypoints.length; i++) {
                time = add(time, legs[i - 1].ete)

                if(waypoints[i].type === "take-off") {
                    waypoints[i].blockEta = time
                    time = add(time, tripPlan.takeoffTime)
                }

                waypoints[i].eta = time

                if(waypoints[i].type === "landing") {
                    time = add(time, tripPlan.landingTime)
                    waypoints[i].blockEta = time
                }
            }
            if(waypoints[idx].type === "take-off") {
                time = waypoints[idx].blockEta
            } else {
                time = waypoints[idx].eta
            }
            for (let i = idx - 1; i >= 0; i--) {
                time = subt(time, legs[i].ete)

                if(waypoints[i].type === "landing") {
                    waypoints[i].blockEta = time
                    time = subt(time, tripPlan.landingTime)
                }

                waypoints[i].eta = time

                if(waypoints[i].type === "take-off") {
                    time = subt(time, tripPlan.takeoffTime)
                    waypoints[i].blockEta = time
                }
            }
        }
        return {
            waypoints: waypoints,
            legs: legs
        }
    })

    let fuel = mul(fuelFlow, durationToHours(tripPlan.finalReserve))
    for (let i = plans.length - 1; i >= 0; i--) {
        let plan = plans[i]
        let waypoints = plan.waypoints;

        waypoints[waypoints.length - 1].fuel = fuel

        for (let j = plan.waypoints.length - 1; j >= 0; j--) {
            if(j < plan.legs.length) {
                fuel = add(fuel, plan.legs[j].fuel)
            }
            if(waypoints[j].type === "landing") {
                waypoints[j].blockFuel = fuel
                fuel = add(fuel, tripPlan.landingFuel)
            }

            waypoints[j].fuel = fuel

            if(waypoints[j].type === "take-off") {
                fuel = add(fuel, tripPlan.takeoffFuel)
                waypoints[j].blockFuel = fuel
            }
        }
    }

    return {
        powerSetting: tripPlan.powerSetting,
        ias: tripPlan.ias,
        plans: plans,
    }
}

function mul(a: number | null, b: number | null): number | null {
    if(a == null || b == null) {
        return null
    } else {
        return a * b
    }
}

function divi(a: number | null, b: number | null): number | null {
    if(a == null || b == null) {
        return null
    } else {
        return a / b
    }
}

function add(a: number | null, b: number | null): number | null {
    if(a == null || b == null) {
        return null
    } else {
        return a + b
    }
}

function subt(a: number | null, b: number | null): number | null {
    if(a == null || b == null) {
        return null
    } else {
        return a - b
    }
}

function cos(a: number | null): number | null {
    if(a === null) {
        return null
    } else {
        return Math.cos(a)
    }
}

function sin(a: number | null): number | null {
    if(a === null) {
        return null
    } else {
        return Math.sin(a)
    }
}

function asin(a: number | null): number | null {
    if(a === null) {
        return null
    } else {
        return Math.asin(a)
    }
}

function hoursToDuration(h: number | null): number | null {
    return mul(h, 3600)
}

function durationToHours(d: Duration | null): number | null {
    return divi(d, 3600)
}

interface Chunk {
    firstWaypoint: number
    waypoints: CalculatedWaypoint[]
    legs: CalculatedLeg[]
}

function splitIntoChunks(trip: CalculatedTrip): Chunk[] {
    let plans = trip.plans
        .filter(p => p.waypoints.length > 0)

    let chunks: Chunk[] = []
    let maxY = 26

    for (let plan of plans) {
        let firstWaypoint = 0
        let waypoints: CalculatedWaypoint[] = []
        let legs: CalculatedLeg[] = []

        let y = 0
        let l = 0

        if(plan.waypoints[l].type === "landing" || plan.waypoints[l].type === "take-off") {
            y += 2
        } else {
            y++
        }
        waypoints.push(plan.waypoints[l])

        while(l < plan.legs.length) {
            let leg = plan.legs[l]
            let nextY = y
            if(leg.notes.length > 0) {
                nextY += 2 + leg.notes.length
            } else {
                nextY += 1
            }
            let waypoint = plan.waypoints[l + 1]
            if(waypoint.type === "landing" || waypoint.type === "take-off") {
                nextY += 2
            } else {
                nextY++
            }
            if(nextY <= maxY) {
                legs.push(leg)
                waypoints.push(waypoint)
                y = nextY
                l++
            } else {
                chunks.push({
                    firstWaypoint: firstWaypoint,
                    waypoints: waypoints,
                    legs: legs
                })
                // TODO protect against infinite loop
                l--
                waypoints = []
                legs = []
                y = 0
                if(plan.waypoints[l].type === "landing" || plan.waypoints[l].type === "take-off") {
                    y += 2
                } else {
                    y++
                }
                waypoints.push(plan.waypoints[l])
                firstWaypoint = l
            }
        }

        if(legs.length > 0) {
            chunks.push({
                firstWaypoint: firstWaypoint,
                waypoints: waypoints,
                legs: legs
            })
        }
    }

    return chunks
}

function printTrip(trip: CalculatedTrip): PdfPage[] {
    // 96 pixels per inch
    let a4_landscape_width = 29.7 / 2.54 * 96
    let a4_landscape_height = 21.0 / 2.54 * 96
    let a5_height = 21 / 2.54 * 96
    let a5_width = 14.8 / 2.54 * 96

    let halfWidth = Math.floor(a4_landscape_width / 2)

    let gridHeight = 21
    let gridWidth = 42

    let margin = 50
    let leftMargin = Math.floor((halfWidth - 8.5 * gridWidth) / 2)

    let fontSize = 10 / 3 * 4
    let fontStartX = 5
    let fontStartY = 15

    let lightGrey = { r: 217/255, g: 217/255, b: 217/255 }
    let lightRed = { r: 249/255, g: 203/255, b: 156/255 }
    let lightGreen = { r: 182/255, g: 215/255, b: 168/255 }
    let lightYellow = { r: 255/255, g: 229/255, b: 153/255 }
    let lightBlue = { r: 159/255, g: 197/255, b: 232/255 }
    let wpColors = [
        lightRed,
        lightGreen,
        lightYellow,
        lightBlue,
    ]

    function formatFuel(num: number | null) {
        if (num == null) {
            return ""
        } else {
            let str = Math.round(num * 10).toString()
            if(str.length < 2) {
                str = "0" + str
            }
            return str.substring(0, str.length - 1) + "," + str.substring(str.length - 1)
        }
    }

    function formatInt(num: number | null) {
        if (num == null) {
            return ""
        } else {
            let str = Math.round(num).toString()
            if (str.length > 3) {
                return str.substring(0, str.length - 3) + " " + str.substring(str.length - 3)
            } else {
                return str
            }
        }
    }

   let chunks = splitIntoChunks(trip);

    let pages: PdfPage[] = []
    let nbPages = Math.ceil(chunks.length / 2)

    for(let p = 0; p < nbPages; p++) {
        let drawings = []

        printPlan(chunks[p], drawings, 0)
        let p2 = nbPages + p
        if(p2 < chunks.length) {
            drawings.push({
                type: "line",
                start: { y: margin, x: halfWidth },
                end: { y: Math.floor(a4_landscape_height - margin), x : halfWidth },
                lineWidth: 1,
                style: "dotted",
                dotDistance: 3
            })
            printPlan(chunks[p2], drawings, halfWidth)
        }

        pages.push({
            height: a4_landscape_height,
            width: a4_landscape_width,
            drawings: drawings
        })
    }

    function printPlan(chunk: Chunk, drawings: Drawing[], xOffset: number) {
        function colorBox(y: number, x: number, h: number, w: number, color: Color): ColorBox {
            return {
                type: "colorbox",
                topLeft: { y: margin + y * gridHeight, x: leftMargin + x * gridWidth + xOffset },
                size: { height: h * gridHeight, width: w * gridWidth },
                color: color
            }
        }

        function hor(y: number, x: number, w: number, width: number, lOffset: number, rOffset: number): SolidLine {
            return {
                type: "line",
                start: { y: margin + y * gridHeight, x: leftMargin + x * gridWidth + lOffset + xOffset },
                end: { y: margin + y * gridHeight, x: leftMargin + (x + w) * gridWidth + rOffset + xOffset },
                lineWidth: width,
                style: "solid",
            }
        }

        function dotted(y: number, x: number, w: number, width: number, lOffset: number, rOffset: number): DottedLine {
            return {
                type: "line",
                start: { y: margin + y * gridHeight, x: leftMargin + x * gridWidth + lOffset + xOffset },
                end: { y: margin + y * gridHeight, x: leftMargin + (x + w) * gridWidth + rOffset + xOffset },
                lineWidth: width,
                style: "dotted",
                dotDistance: 3
            }
        }

        function ver(y: number, x: number, h: number, width: number, tOffset: number, bOffset: number): SolidLine {
            return {
                type: "line",
                start: { y: margin + y * gridHeight + tOffset, x: leftMargin + x * gridWidth + xOffset },
                end: { y: margin + (y + h) * gridHeight + bOffset, x: leftMargin + x * gridWidth + xOffset },
                lineWidth: width,
                style: "solid",
            }
        }

        function ltext(y: number, x: number, text: string): Txt {
            return {
                type: "text",
                fontSize: fontSize,
                start: { y: margin + y * gridHeight + fontStartY, x: leftMargin + x * gridWidth + fontStartX + xOffset },
                text: text,
                align: "left",
            }
        }

        function rtext(y: number, x: number, text: string): Txt {
            return {
                type: "text",
                fontSize: fontSize,
                start: { y: margin + y * gridHeight + fontStartY, x: leftMargin + x * gridWidth - fontStartX + xOffset },
                text: text,
                align: "right",
            }
        }

        // Top part
        drawings.push(...[
            colorBox(0, 0, 1, 1, lightGrey),
            colorBox(0, 2, 1, 1, lightGrey),
            hor(0, 0, 4, 2, -1, 1),
            hor(1, 0, 4, 2, -1, 1),
            ver(0, 0, 1, 2, -1, 1),
            ver(0, 1, 1, 1, -1, 1),
            ver(0, 2, 1, 2, -1, 1),
            ver(0, 3, 1, 1, -1, 1),
            ver(0, 4, 1, 2, -1, 1),
            ltext(0, 0, "Pwr"),
            ltext(0, 1, trip.powerSetting),
            ltext(0, 2, "IAS"),
            rtext(0, 4, formatInt(trip.ias)),
        ]);

        // First the colors: Header
        drawings.push(
            colorBox(2, 0, 1, 8, lightGrey)
        )
        // First the colors: Waypoints
        let y = 3
        for (let i = 0; i < chunk.waypoints.length; i++) {
            drawings.push(
                colorBox(y, 0, 1, 8, wpColors[(chunk.firstWaypoint + i) % wpColors.length])
            )
            y++
            if(chunk.waypoints[i].type === "take-off" || chunk.waypoints[i].type === "landing") {
                drawings.push(
                    colorBox(y, 0, 1, 8, wpColors[(chunk.firstWaypoint + i) % wpColors.length])
                )
                y++
            }
            if (i < chunk.legs.length) {
                y += 1 + chunk.legs[i].notes.length
                if(chunk.legs[i].notes.length > 0) {
                    y++
                }
            }
        }

        // Header
        drawings.push(...[
            hor(2, 0, 8, 2, -1, 1),
            hor(3, 0, 8, 2, -1, 1),

            ver(2, 0, 1, 2, -1, 1),
            ver(2, 1, 1, 1, -1, 1),
            ver(2, 2, 1, 2, -1, 1),
            ver(2, 3, 1, 2, -1, 1),
            ver(2, 4, 1, 1, -1, 1),
            ver(2, 5, 1, 2, -1, 1),
            ver(2, 6, 1, 2, -1, 1),
            ver(2, 7, 1, 1, -1, 1),
            ver(2, 8, 1, 2, -1, 1),

            ltext(2, 0, "MH"),
            ltext(2, 1, "MT"),
            ltext(2, 2, "GS"),
            ltext(2, 3, "Alt"),
            ltext(2, 4, "MSA"),
            ltext(2, 5, "Fuel"),
            ltext(2, 6, "ET"),
            ltext(2, 7, "AT"),
        ]);

        y = 3
        for (let i = 0; i < chunk.waypoints.length; i++) {
            let last = i === chunk.waypoints.length - 1;

            // Waypoint
            let waypoint = chunk.waypoints[i]

            let bottomLineWidth = last? 2: 1
            let bottomLOffset = last? -1: 0
            let bottomROffset = last? 1: 0
            let bottomBOffset = last? 1: 0

            if(waypoint.type === "take-off") {
                let verLength = last? 2: 3
                drawings.push(...[
                    hor(y + 1, 0, 8, 1, 0, 0),
                    hor(y + 2, 0, 8, bottomLineWidth, bottomLOffset, bottomROffset),

                    ver(y, 0, verLength, 2, 0, bottomBOffset),
                    ver(y, 3, verLength, 2, 0, 0),
                    ver(y, 4, verLength, 1, 0, 0),
                    ver(y, 5, verLength, 2, 0, 0),
                    ver(y, 6, verLength, 2, 0, 0),
                    ver(y, 7, verLength, 1, 0, 0),
                    ver(y, 8, verLength, 2, 0, bottomBOffset),

                    ltext(y, 0, waypoint.name + " - Block"),
                    rtext(y, 4, formatInt(waypoint.alt)),
                    rtext(y, 6, formatFuel(waypoint.blockFuel)),
                    // ltext(y, 6, formatHHMMt(waypoint.blockEta)),

                    ltext(y + 1, 0, waypoint.name + " - Airborn"),
                    rtext(y + 1, 4, formatInt(waypoint.alt)),
                    rtext(y + 1, 6, formatFuel(waypoint.fuel)),
                    // ltext(y + 1, 6, formatHHMMt(waypoint.eta)),
                ])
                y += 2
            } else if(waypoint.type === "landing") {
                let verLength = last? 2: 3
                drawings.push(...[
                    hor(y + 1, 0, 8, 1, 0, 0),
                    hor(y + 2, 0, 8, bottomLineWidth, bottomLOffset, bottomROffset),

                    ver(y, 0, verLength, 2, 0, bottomBOffset),
                    ver(y, 3, verLength, 2, 0, 0),
                    ver(y, 4, verLength, 1, 0, 0),
                    ver(y, 5, verLength, 2, 0, 0),
                    ver(y, 6, verLength, 2, 0, 0),
                    ver(y, 7, verLength, 1, 0, 0),
                    ver(y, 8, verLength, 2, 0, bottomBOffset),

                    ltext(y, 0, waypoint.name + " - Circuit"),
                    rtext(y, 4, formatInt(waypoint.alt)),
                    rtext(y, 6, formatFuel(waypoint.fuel)),
                    // ltext(y, 6, formatHHMMt(waypoint.eta)),

                    ltext(y + 1, 0, waypoint.name + " - Block"),
                    rtext(y + 1, 4, formatInt(waypoint.alt)),
                    rtext(y + 1, 6, formatFuel(waypoint.blockFuel)),
                    // ltext(y + 1, 6, formatHHMMt(waypoint.blockEta)),
                ])
                y += 2
            } else {
                let verLength = last? 1: 2
                drawings.push(...[
                    hor(y + 1, 0, 8, bottomLineWidth, bottomLOffset, bottomROffset),

                    ver(y, 0, verLength, 2, 0, bottomBOffset),
                    ver(y, 3, verLength, 2, 0, 0),
                    ver(y, 4, verLength, 1, 0, 0),
                    ver(y, 5, verLength, 2, 0, 0),
                    ver(y, 6, verLength, 2, 0, 0),
                    ver(y, 7, verLength, 1, 0, 0),
                    ver(y, 8, verLength, 2, 0, bottomBOffset),

                    ltext(y, 0, waypoint.name),
                    rtext(y, 4, formatInt(waypoint.alt)),
                    rtext(y, 6, formatFuel(waypoint.fuel)),
                    // ltext(y, 6, formatHHMMt(waypoint.eta)),
                ])
                y++
            }
            if(!last) {
                // Leg
                let leg = chunk.legs[i]
                drawings.push(...[
                    hor(y + 1, 0, 8, 1, 0, 0),

                    ver(y, 1, 1, 1, 0, 0),
                    ver(y, 2, 1, 2, 0, 0),

                    rtext(y, 1, formatInt(leg.mh)),
                    rtext(y, 2, formatInt(leg.mt)),
                    rtext(y, 3, formatInt(leg.gs)),
                    rtext(y, 4, formatInt(leg.alt)),
                    rtext(y, 5, formatInt(leg.msa)),
                    rtext(y, 6, formatFuel(leg.fuel)),
                    rtext(y, 7, formatMMt(leg.ete))
                ])
                y++
                for (let n = 0; n < leg.notes.length; n++) {
                    let note = leg.notes[n]
                    drawings.push(
                        ver(y, 0, 2, 2, 0, 0),
                        ver(y, 8, 2, 2, 0, 0),

                        rtext(y, 2, formatMMSS(note.time)),
                        ltext(y, 2, note.note),
                        ltext(y, 6, note.number),
                    )
                    y++
                }
                if(leg.notes.length > 0) {
                    drawings.push(
                        hor(y, 0, 8, 1, 0, 0),
                        hor(y + 1, 0, 8, 1, 0, 0),

                        ver(y, 0, 1, 2, 0, 0),
                        ver(y, 1, 1, 1, 0, 0),
                        ver(y, 2, 1, 2, 0, 0),
                        ver(y, 3, 1, 2, 0, 0),
                        ver(y, 4, 1, 1, 0, 0),
                        ver(y, 5, 1, 2, 0, 0),
                        ver(y, 6, 1, 2, 0, 0),
                        ver(y, 7, 1, 1, 0, 0),
                        ver(y, 8, 1, 2, 0, 0),

                        rtext(y, 1, formatInt(leg.mh)),
                        rtext(y, 2, formatInt(leg.mt)),
                        rtext(y, 3, formatInt(leg.gs)),
                        rtext(y, 4, formatInt(leg.alt)),
                        rtext(y, 5, formatInt(leg.msa)),
                        rtext(y, 6, formatFuel(leg.fuel)),
                        rtext(y, 7, formatMMt(leg.ete))
                    )
                    y++
                }
            }
        }

        y++

        let firstLine = y + 1 + (y % 2)
        for (let i = firstLine; i <= 33; i += 2) {
            drawings.push(
                dotted(i, 0, 8, 1, 0, 0),
            )
        }
    }

    let longLine = 20
    let shortLine = 10

    const KM_PER_NM = 1.852
    const MAP_SCALE = 1/250000
    const PX_PER_CM = 96 / 2.54
    const CM_PER_KM = 100000

    function distance(leg: CalculatedLeg): number {
        return leg.leg.distance * KM_PER_NM * CM_PER_KM * PX_PER_CM * MAP_SCALE
    }

    function hor(y: number, x1: number, x2: number): SolidLine {
        return {
            type: "line",
            start: { y: y, x: x1 },
            end: { y: y, x: x2 },
            lineWidth: 1,
            style: "solid",
        }
    }

    function ver(y: number, x: number, h: number): SolidLine {
        return {
            type: "line",
            start: { y: y - 0.5, x: x },
            end: { y: y + h, x:x },
            lineWidth: 1,
            style: "solid",
        }
    }

    function ltext(y: number, x: number, text: string): Txt {
        return {
            type: "text",
            fontSize: fontSize,
            start: { y: y, x: x },
            text: text,
            align: "left",
        }
    }

    function ctext(y: number, x: number, text: string): Txt {
        return {
            type: "text",
            fontSize: fontSize,
            start: { y: y, x: x },
            text: text,
            align: "center",
        }
    }

    function rtext(y: number, x: number, text: string): Txt {
        return {
            type: "text",
            fontSize: fontSize,
            start: { y: y, x: x },
            text: text,
            align: "right",
        }
    }

    let drawings: Drawing[] = []
    let x = Math.floor(a4_landscape_width - margin)
    let y = margin
    let halfMaxTextWidth = 50
    let xLastText = Number.MAX_VALUE
    let start = true

    for (let plan of trip.plans) {
        for (let i = 0; i < plan.legs.length; i++) {
            let leg = plan.legs[i]
            if(leg.leg.distance === null || leg.leg.distance === 0) {
                // TODO could give weird results in the middle
                continue
            }
            let dist = distance(leg)
            let startX = x
            let endX = x - dist

            if(endX < margin) {
                x = Math.floor(a4_landscape_width - margin)
                y += 3 * longLine
                xLastText = Number.MAX_VALUE
                start = true
                startX = x
                endX = x - dist
            }

            drawings.push(
                hor(y, Math.round(startX), Math.round(endX))
            )
            if(start) {
                let wp = plan.waypoints[i]
                drawings.push(
                    ver(y, Math.round(startX), longLine),
                    rtext(y + longLine + fontStartY, Math.round(startX), wp.name)
                )
                xLastText = startX -  2 * halfMaxTextWidth
                start = false
            }
            drawings.push(
                ver(y, Math.round(endX), longLine)
            )
            if(endX - halfMaxTextWidth >= margin) {
                if(endX + halfMaxTextWidth <= xLastText) {
                    let wp = plan.waypoints[i + 1]
                    drawings.push(
                        ctext(y + longLine + fontStartY, Math.round(endX), wp.name)
                    )
                    xLastText = endX - halfMaxTextWidth
                }
            } else {
                if(endX + 2 * halfMaxTextWidth <= xLastText) {
                    let wp = plan.waypoints[i + 1]
                    drawings.push(
                        ltext(y + longLine + fontStartY, Math.round(endX), wp.name)
                    )
                    xLastText = endX
                }
            }

            if(leg.gs !== null) {
                let m = 2
                while(true) {
                    let tick = startX - leg.gs * m / 60 * KM_PER_NM * CM_PER_KM * PX_PER_CM * MAP_SCALE
                    if(tick > endX) {
                        drawings.push(
                            ver(y, Math.round(tick), shortLine),
                            ctext(y + shortLine + fontStartY, Math.round(tick), m.toString())
                        )
                        m += 2
                    } else {
                        break
                    }
                }
            }

            x = endX
        }
        x = Math.floor(a4_landscape_width - margin)
        y += 3 * gridHeight
        xLastText = Number.MAX_VALUE
        start = true
    }

    pages.push({
        height: a4_landscape_height,
        width: a4_landscape_width,
        drawings: drawings
    })

    return pages
}