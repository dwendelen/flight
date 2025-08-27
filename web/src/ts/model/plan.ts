

interface TripPlan extends VersionedEntity {
    type: "plan"
    trip: TripId
    powerSetting: string | null
    ias: number | null
    tas: number | null
    fuelFlow: number | null
    variation: number | null // TODO input
    fuelContingency: number | null // TODO input
    finalReserve: Duration | null // TODO input // TODO to seconds
    preTakeoffTime: Duration | null // TODO input // TODO to seconds
    preTakeoffFuel: number | null // TODO input
    postTakeoffTime: Duration | null // TODO input // TODO to seconds
    preLandingTime:  Duration | null // TODO input // TODO to seconds
    postLandingTime:  Duration | null // TODO input // TODO to seconds
    postLandingFuel: number | null // TODO input
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
    ete: number | null
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

function calculate(tripPlan: TripPlan): CalculatedTrip {
    let fuelFlow: number | null
    if(tripPlan.fuelFlow != null && tripPlan.fuelContingency != null) {
        fuelFlow = tripPlan.fuelFlow * (1 + tripPlan.fuelContingency)
    } else {
        fuelFlow = null
    }

    let plans: CalculatedPlan[] = tripPlan.flightPlans.map(fp => {
        let waypoints = fp.waypoints.map(wp => {
            return {
                type: wp.type,
                name: wp.name,
                alt: wp.altitude,
                fuel: null,
                eta: wp.eta
            }
        });
        let legs = fp.legs.map(leg => {
            let mt: number | null
            if(tripPlan.variation != null && leg.trueTrack != null) {
                mt = leg.trueTrack - tripPlan.variation;
            } else {
                mt = null
            }

            let th: number | null
            let gs: number | null
            if(leg.trueTrack != null && tripPlan.tas != null && leg.windDirection != null && leg.windVelocity != null) {
                let relative_wind_radians = RADIANS_PER_DEGREE * (leg.windDirection + 180 - leg.trueTrack);
                let cross = leg.windVelocity * Math.sin(relative_wind_radians)
                let tail = leg.windVelocity * Math.cos(relative_wind_radians)
                let drift_radians = Math.asin(cross/tripPlan.tas)
                gs = tripPlan.tas * Math.cos(drift_radians) + tail
                th = leg.trueTrack - (drift_radians * DEGREES_PER_RADIAN)
            } else {
                gs = null
                th = null
            }

            let mh: number | null
            if(tripPlan.variation != null && th != null) {
                mh = th - tripPlan.variation
            } else {
                mh = null
            }

            let ete: Duration | null
            if(leg.ete == null) {
                if (gs != null && leg.distance != null) {
                    ete = leg.distance / gs * 3600
                } else {
                    ete = null
                }
            } else {
                ete = leg.ete
            }

            let fuel: number | null
            if(ete != null && fuelFlow != null) {
                fuel = fuelFlow * ete / 3600
            } else {
                fuel = null
            }

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
            .filter(wp => wp.eta != null)
            .length
        if(nbFixedETAs == 1) {
            let idx = waypoints
                .findIndex(wp => wp.eta != null);
            for (let i = idx + 1; i < waypoints.length; i++) {
                let extra = 0
                if(waypoints[i - 1].type === "take-off") {
                    // TODO if null
                    extra += tripPlan.postTakeoffTime + tripPlan.preTakeoffTime
                }
                if(waypoints[i].type === "landing") {
                    // TODO if null
                    extra += tripPlan.preLandingTime + tripPlan.postLandingTime
                }
                if(legs[i - 1].ete != null) {
                    waypoints[i].eta = waypoints[i - 1].eta + legs[i - 1].ete + extra
                }
            }
            for (let i = idx - 1; i >= 0; i--) {
                let extra = 0
                if(waypoints[i].type === "take-off") {
                    // TODO if null
                    extra += tripPlan.postTakeoffTime + tripPlan.preTakeoffTime
                }
                if(waypoints[i + 1].type === "landing") {
                    // TODO if null
                    extra += tripPlan.preLandingTime + tripPlan.postLandingTime
                }
                if(legs[i].ete != null) {
                    waypoints[i].eta = waypoints[i + 1].eta - legs[i].ete - extra
                }
            }
        }
        return {
            waypoints: waypoints,
            legs: legs
        }
    })

    // TODO null-checks
    let fuel = fuelFlow * tripPlan.finalReserve / 3600
    for (let i = plans.length - 1; i >= 0; i--) {
        let plan = plans[i]
        let waypoints = plan.waypoints;

        waypoints[waypoints.length - 1].fuel = fuel

        for (let j = plan.waypoints.length - 2; j >= 0; j--) {
            let extra = 0
            if(waypoints[j].type === "take-off") {
                // TODO if null
                extra += fuelFlow * tripPlan.postTakeoffTime / 3600 + tripPlan.preTakeoffFuel
            }
            if(waypoints[j + 1].type === "landing") {
                // TODO if null
                extra += fuelFlow * tripPlan.preLandingTime / 3600 + tripPlan.postLandingFuel
            }
            fuel = fuel + plan.legs[j].fuel + extra
            waypoints[j].fuel = fuel
        }
    }

    return {
        powerSetting: tripPlan.powerSetting,
        ias: tripPlan.ias,
        plans: plans,
    }
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

    let plans = trip.plans
        .filter(p => p.waypoints.length > 0)

    let pages: PdfPage[] = []
    let nbPages = Math.ceil(plans.length / 2)

    for(let p = 0; p < nbPages; p++) {
        let drawings = []

        printPlan(plans[p], drawings, 0)
        let p2 = nbPages + p
        if(p2 < plans.length) {
            drawings.push({
                type: "line",
                start: { y: margin, x: halfWidth },
                end: { y: Math.floor(a4_landscape_height - margin), x : halfWidth },
                lineWidth: 1,
                style: "dotted",
                dotDistance: 3
            })
            printPlan(plans[p2], drawings, halfWidth)
        }

        pages.push({
            height: a4_landscape_height,
            width: a4_landscape_width,
            drawings: drawings
        })
    }

    function printPlan(plan: CalculatedPlan, drawings: Drawing[], xOffset: number) {
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
            colorBox(2, 0, 1, 8.5, lightGrey)
        )
        // First the colors: Waypoints
        let y = 3
        for (let i = 0; i < plan.waypoints.length; i++) {
            drawings.push(
                colorBox(y, 0, 1, 8.5, wpColors[i % wpColors.length])
            )
            if (i < plan.legs.length) {
                y += 2 + plan.legs[i].notes.length
                if(plan.legs[i].notes.length > 0) {
                    y++
                }
            }
        }

        // Header
        drawings.push(...[
            hor(2, 0, 8.5, 2, -1, 1),
            hor(3, 0, 8.5, 2, -1, 1),

            ver(2, 0, 1, 2, -1, 1),
            ver(2, 1, 1, 1, -1, 1),
            ver(2, 2, 1, 2, -1, 1),
            ver(2, 3, 1, 2, -1, 1),
            ver(2, 4, 1, 1, -1, 1),
            ver(2, 5, 1, 2, -1, 1),
            ver(2, 6, 1, 2, -1, 1),
            ver(2, 7.5, 1, 1, -1, 1),
            ver(2, 8.5, 1, 2, -1, 1),

            ltext(2, 0, "MH"),
            ltext(2, 1, "MT"),
            ltext(2, 2, "GS"),
            ltext(2, 3, "Alt"),
            ltext(2, 4, "MSA"),
            ltext(2, 5, "Fuel"),
            ltext(2, 6, "ET"),
            ltext(2, 7.5, "AT"),
        ]);


        y = 3
        for (let i = 0; i < plan.legs.length; i++) {
            let waypoint = plan.waypoints[i]
            let leg = plan.legs[i]
            drawings.push(...[
                hor(y + 1, 0, 8.5, 1, 0, 0),
                hor(y + 2, 0, 8.5, 1, 0, 0),

                ver(y, 0, 2, 2, 0, 0),
                ver(y + 1, 1, 1, 1, 0, 0),
                ver(y + 1, 2, 1, 2, 0, 0),
                ver(y, 3, 2, 2, 0, 0),
                ver(y, 4, 2, 1, 0, 0),
                ver(y, 5, 2, 2, 0, 0),
                ver(y, 6, 2, 2, 0, 0),
                ver(y, 7.5, 2, 1, 0, 0),
                ver(y, 8.5, 2, 2, 0, 0),

                ltext(y, 0, waypoint.name),
                rtext(y, 4, formatInt(waypoint.alt)),
                rtext(y, 6, formatFuel(waypoint.fuel)),
                ltext(y, 6, formatHHMM(waypoint.eta)),

                rtext(y + 1, 1, formatInt(leg.mh)),
                rtext(y + 1, 2, formatInt(leg.mt)),
                rtext(y + 1, 3, formatInt(leg.gs)),
                rtext(y + 1, 4, formatInt(leg.alt)),
                rtext(y + 1, 5, formatInt(leg.msa)),
                rtext(y + 1, 6, formatFuel(leg.fuel)),
                rtext(y + 1, 7.5, formatMMSS(leg.ete))
            ])
            y += 2
            for (let n = 0; n < leg.notes.length; n++) {
                let note = leg.notes[n]
                drawings.push(
                    ver(y, 0, 2, 2, 0, 0),
                    ver(y, 8.5, 2, 2, 0, 0),

                    rtext(y, 2, formatMMSS(note.time)),
                    ltext(y, 2, note.note),
                    ltext(y, 6, note.number),
                )
                y++
            }
            if(leg.notes.length > 0) {
                drawings.push(
                    hor(y, 0, 8.5, 1, 0, 0),
                    hor(y + 1, 0, 8.5, 1, 0, 0),

                    ver(y, 0, 1, 2, 0, 0),
                    ver(y, 1, 1, 1, 0, 0),
                    ver(y, 2, 1, 2, 0, 0),
                    ver(y, 3, 1, 2, 0, 0),
                    ver(y, 4, 1, 1, 0, 0),
                    ver(y, 5, 1, 2, 0, 0),
                    ver(y, 6, 1, 2, 0, 0),
                    ver(y, 7.5, 1, 1, 0, 0),
                    ver(y, 8.5, 1, 2, 0, 0),

                    rtext(y, 1, formatInt(leg.mh)),
                    rtext(y, 2, formatInt(leg.mt)),
                    rtext(y, 3, formatInt(leg.gs)),
                    rtext(y, 4, formatInt(leg.alt)),
                    rtext(y, 5, formatInt(leg.msa)),
                    rtext(y, 6, formatFuel(leg.fuel)),
                    rtext(y, 7.5, formatMMSS(leg.ete))
                )
                y++
            }
        }

        let lastWpIdx = plan.legs.length;
        let lastWaypoint = plan.waypoints[lastWpIdx]
        drawings.push(...[
            hor(y + 1, 0, 8.5, 2, -1, 1),

            ver(y, 0, 1, 2, 0, 1),
            ver(y, 3, 1, 2, 0, 0),
            ver(y, 4, 1, 1, 0, 0),
            ver(y, 5, 1, 2, 0, 0),
            ver(y, 6, 1, 2, 0, 0),
            ver(y, 7.5, 1, 1, 0, 0),
            ver(y, 8.5, 1, 2, 0, 1),

            ltext(y, 0, lastWaypoint.name),
            rtext(y, 4, formatInt(lastWaypoint.alt)),
            rtext(y, 6, formatFuel(lastWaypoint.fuel)),
            ltext(y, 6, formatHHMM(lastWaypoint.eta)),
        ])
        y+= 2

        let firstLine = y + 1 + (y % 2)
        for (let i = firstLine; i <= 33; i += 2) {
            drawings.push(
                dotted(i, 0, 8.5, 1, 0, 0),
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