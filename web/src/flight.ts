//tsc --target es2019 flight.ts

interface Config {
    baseUrl: string,
    googleClientId: string
}
declare var config: Config

declare interface CredentialResponse {
    credential: string // JWT
    select_by: any
}
declare var google: any

function main() {

    let entityRepoFactory = (userId: string, sessionId: string) => {
        let localEngine = new IndexedDBEngine(userId, () => {});
        let local = new BufferingVersionStream(localEngine)
        let remoteEngine = new RemoteEngine(config.baseUrl, userId, sessionId)
        let remote = new BufferingVersionStream(remoteEngine)
        let stream = new LocalRemoteVersionStream(local, remote);
        return new EntityRepo(stream)
    }
    let application = new Application(config.googleClientId, entityRepoFactory);

    let body = document.getElementsByTagName("body").item(0);

    sub(application.page)(body)

    application.init()
}

class Application {
    page: Value<Component> = new Value(loading())
    entityRepo: EntityRepo
    sessionId: string | null = null

    constructor(
        private clientId: string,
        private entityRepoFactory: (userId: string, sessionId: string) => EntityRepo
    ) {

    }

    init() {
        google.accounts.id.initialize({
            client_id: this.clientId,

            callback: (cred: CredentialResponse) =>
                this.onGoogleLogin(cred)
        });
        this.page.set(loginPage())
    }

    onGoogleLogin(cred: CredentialResponse) {
        this.page.set(loading())
        let googleLoginRequest: GoogleLoginRequest = {
            bearer: cred.credential
        }
        window.fetch(config.baseUrl + "/google-login", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify(googleLoginRequest)
        }).then( resp => {
            if(!resp.ok) {
                throw "Login failed"
            }
            return resp.json()
        }).then(json => {
            let loginResponse = json as LoginResponse;
            this.sessionId = loginResponse.sessionId
            if(loginResponse.userId == null) {
                this.page.set(createAccountPage(this))
            } else {
                this.loggedIn(loginResponse.userId);
            }
        })
    }

    createAccount() {
        window.fetch(config.baseUrl + "/users", {
            method: "POST",
            headers: {"authorization": "Bearer " + this.sessionId},
        }).then(resp => {
            if(!resp.ok) {
                throw "Create account failed"
            }
            return resp.json()
        }).then(json => {
            let createUserResponse = json as CreateUserResponse;
            this.loggedIn(createUserResponse.userId);
        })
        this.page.set(loading())
    }

    private loggedIn(userId: string) {
        this.entityRepo = this.entityRepoFactory(userId, this.sessionId)
        this.entityRepo.init(() => {
            this.page.set(mainPage(new MainPage(this.entityRepo)))
        })
    }
}

interface GoogleLoginRequest {
    bearer: string
}

interface LoginResponse {
    sessionId: string
    userId: string | null
}

interface CreateUserResponse {
    userId: string,
}

class EntityRepo {
    private versions: VersionedEntity[] = []
    private entities: VersionedEntity[] = []

    constructor(private versionStream: VersionStream) {
    }

    init(onComplete: () => void) {
        this.versionStream.init()
        this.versionStream.load(0, (e) => {
            this.versions.push(e)
            for (let i = 0; i < this.entities.length; i++) {
                if(this.entities[i].entity == e.entity) {
                    if(e.type === "tombstone") {
                        this.entities.splice(i, 1)
                    } else {
                        this.entities[i] = e
                    }
                    return
                }
            }
            if(e.type !== "tombstone") {
                this.entities.push(e)
            }
        }, onComplete)
    }

    save(entityVersions: VersionedEntity[]) {
        this.versionStream.save(entityVersions, () => {})
        entityVersions.forEach(entityVersion => {
            for (let i = 0; i < this.entities.length; i++) {
                if(this.entities[i].entity == entityVersion.entity) {
                    this.entities[i] = entityVersion
                    return
                }
            }
            this.entities.push(entityVersion)
        })
        this.versions.push(...entityVersions.sort(v => v.version))
    }

    getAllOfType<T extends VersionedEntity>(type: string): T[] {
        return this.entities.filter(e => e.type === type) as T[]
    }

    nextEntity() {
        return Math.max(-1, ...this.versions
            .map(e => e.entity)) + 1
    }

    nextVersion() {
        let len = this.versions.length;
        if(len === 0) {
            return 0
        } else {
            return this.versions[len - 1].version + 1
        }
    }

    getByVersion<T extends VersionedEntity>(version: number): T {
        return this.versions
            .filter(v => v.version === version)[0] as T
    }
}

function loading(): Component {
    return text("Loading ...")
}

function loginPage() {
    return div(googleButton())
}

function createAccountPage(application: Application) {
    return div(
        text("No account detected."),
        button(text("Create account"), onklick(() => application.createAccount()))
    )
}

class MainPage {
    page: Value<Component> = new Value(home())

    constructor(private entityRepo: EntityRepo) {
    }

    openTrips() {
        this.page.set(trips(new TripsPage(this.entityRepo)))
    }

    openManage() {
        this.page.set(manage(new ManagePage(this.entityRepo)))
    }

    openLogbook() {
        this.page.set(logbook(new LogbookPage(this.entityRepo)))
    }
}

function mainPage(mainPage: MainPage): Component {
    return arr([
        div(
            clazz("navigation-bar"),
            div(text("Trips"), onklick(() => mainPage.openTrips())),
            div(text("Logbook"), onklick(() => mainPage.openLogbook())),
            div(text("Manage"), onklick(() => mainPage.openManage()))
        ),
        div(
            sub(mainPage.page)
        )
    ])
}

function home(): Component {
    return arr([])
}

class TripsPage {
    page = new Value<Component>()
    trips: Trip[]

    constructor(private entityRepo: EntityRepo) {
        this.openHome()
    }

    openHome() {
        this.trips = this.entityRepo.getAllOfType<Trip>("trip")
        this.page.set(tripsList(this))
    }

    openCreatePage() {
        this.page.set(trip(new TripPage(this.entityRepo, this, null, null)))
    }

    open(trp: Trip) {
        let maybePlan = (this.entityRepo.getAllOfType("plan") as TripPlan[])
            .filter((tp: TripPlan) => tp.trip === trp.entity);
        let plan: TripPlan | null
        if(maybePlan.length === 0) {
            plan = null
        } else {
            plan = maybePlan[0]
        }
        this.page.set(trip(new TripPage(this.entityRepo, this, trp, plan)))
    }
}

function trips(tripsPage: TripsPage): Component {
    return sub(tripsPage.page)
}

function tripsList(tripsPage: TripsPage): Component {
    let trips = tripsPage.trips.map(t =>
        div(text(t.name), onklick(() => tripsPage.open(t)))
    );
    return arr([
        h1(text("Trips")),
        button(text("Create"), onklick(() => tripsPage.openCreatePage())),
        ...trips
    ])
}

class TripPage {
    name: Value<string>
    powerSetting: Value<string | null>
    ias: Value<number | null>
    tas: Value<number | null>
    fuelFlow: Value<number | null>
    firstStop: Value<StopElement | null>
    aerodromes: Aerodrome[]

    constructor(private entityRepo: EntityRepo, private tripsPage: TripsPage, private trip: Trip | null, private tripPlan: TripPlan | null) {
        this.aerodromes = entityRepo.getAllOfType("aerodrome")

        if(trip == null) {
            this.name = new Value( "New Trip")
        } else {
            this.name = new Value(this.trip.name)

        }
        if(tripPlan == null) {
            this.firstStop = new Value(null)
            this.powerSetting = new Value(null)
            this.ias = new Value(null)
            this.tas = new Value(null)
            this.fuelFlow = new Value(null)
        } else {
            if(tripPlan.stops.length === 0) {
                this.firstStop = new Value(null)
            } else {
                let mapStop = (idx: number): StopElement => {
                    let stop = tripPlan.stops[idx]
                    let flight = mapFlight(idx)
                    let aerodrome: Aerodrome = this.entityRepo.getByVersion(stop.aerodrome);
                    return new StopElement(flight, new Value(aerodrome))
                }
                let mapFlight = (idx: number) => {
                    if(idx >= tripPlan.flightPlans.length) {
                        return null
                    } else {
                        let flight = tripPlan.flightPlans[idx]
                        let stopElement = mapStop(idx + 1)

                        if(flight.waypoints.length === 0) {
                            return new FlightElement(stopElement, null)
                        } else {
                            let mapWaypoint = (idx: number): WaypointElement => {
                                let waypoint = flight.waypoints[idx]
                                let leg = mapLeg(idx)
                                return new WaypointElement(
                                    leg,
                                    new Value(waypoint.type),
                                    new Value(waypoint.name),
                                    new Value(waypoint.altitude),
                                    new Value(waypoint.eta)
                                )
                            }

                            let mapLeg = (idx: number): LegElement => {
                                if(idx >= flight.legs.length) {
                                    return null
                                } else {
                                    let leg = flight.legs[idx]

                                    let mapNote = (idx: number): NoteElement => {
                                        if(idx >= leg.notes.length) {
                                            return null
                                        } else {
                                            let note = leg.notes[idx];
                                            return new NoteElement(
                                                mapNote(idx + 1),
                                                new Value(note.time),
                                                new Value(note.note),
                                                new Value(note.number)
                                            )
                                        }
                                    }

                                    let waypoint = mapWaypoint(idx + 1)
                                    return new LegElement(
                                            waypoint,
                                            new Value(leg.trueTrack),
                                            new Value(leg.distance),
                                            new Value(leg.windDirection),
                                            new Value(leg.windVelocity),
                                            new Value(leg.altitude),
                                            new Value(leg.msa),
                                            new Value(leg.ete),
                                            mapNote(0)
                                        )
                                }
                            }

                            let waypointElement = mapWaypoint(0)
                            return new FlightElement(stopElement, waypointElement)
                        }
                    }
                }

                this.firstStop = new Value(mapStop(0))
            }
            this.powerSetting = new Value(tripPlan.powerSetting)
            this.ias = new Value(tripPlan.ias)
            this.tas = new Value(tripPlan.tas)
            this.fuelFlow = new Value(tripPlan.fuelFlow)
        }
    }

    save() {
        let nextEntity = this.entityRepo.nextEntity();
        let tripEntity: number
        if(this.trip === null) {
            tripEntity = nextEntity
            nextEntity++
        } else {
            tripEntity = this.trip.entity
        }
        let planEntity: number
        if(this.tripPlan === null) {
            planEntity = nextEntity
            nextEntity++
        } else {
            planEntity = this.tripPlan.entity
        }

        let nextVersion = this.entityRepo.nextVersion();
        let tripVersion = nextVersion;
        let trip: Trip = {
            type: "trip",
            entity: tripEntity,
            version: tripVersion,
            name: this.name.get(),
            aircraft: null
        };

        let tripPlanVersion = nextVersion + 1;
        let tripPlan = this.toTripPlan(tripPlanVersion, planEntity, tripEntity);

        this.entityRepo.save([trip, tripPlan])
        this.tripsPage.openHome()
    }

    private toTripPlan(tripPlanVersion: number, planEntity: number, tripEntity: number): TripPlan {
        let stops: Stop[] = []
        let flightPlans: FlightPlan[] = []
        let visitStop = (stop: StopElement | null) => {
            if (stop !== null) {
                let aerodrome = stop.aerodrome.get();
                stops.push({
                    aerodrome: aerodrome === null ? null : aerodrome.version,
                    refuel: false
                })
                visitFlightPlans(stop.next)
            }
        }
        let visitFlightPlans = (flight: FlightElement | null) => {
            if (flight !== null) {
                let waypoints: Waypoint[] = []
                let legs: Leg[] = []

                let visitWaypoint = (waypoint: WaypointElement | null) => {
                    if (waypoint !== null) {
                        waypoints.push({
                            name: waypoint.name.get(),
                            type: waypoint.type.get(),
                            altitude: waypoint.altitude.get(),
                            eta: waypoint.eta.get()
                        })
                        visitLeg(waypoint.next)
                    }
                }
                let visitLeg = (leg: LegElement | null) => {
                    if (leg !== null) {
                        let notes: Note[] = []
                        let visitNote = (note: NoteElement | null) => {
                            if(note != null) {
                                notes.push({
                                    time: note.time.get(),
                                    note: note.note.get(),
                                    number: note.number.get()
                                })
                                visitNote(note.next)
                            }
                        }
                        visitNote(leg.firstNote)
                        legs.push({
                            trueTrack: leg.trueTrack.get(),
                            distance: leg.distance.get(),
                            windDirection: leg.windDirection.get(),
                            windVelocity: leg.windVelocity.get(),
                            altitude: leg.altitude.get(),
                            msa: leg.msa.get(),
                            ete: leg.ete.get(),
                            notes: notes
                        })
                        visitWaypoint(leg.next)
                    }
                }
                visitWaypoint(flight.firstWaypoint)

                flightPlans.push({
                    waypoints: waypoints,
                    legs: legs
                })
                visitStop(flight.next)
            }
        }
        visitStop(this.firstStop.get())

        return {
            variation: 2, // TODO
            type: "plan",
            entity: planEntity,
            version: tripPlanVersion,
            trip: tripEntity,
            stops: stops,
            flightPlans: flightPlans,
            powerSetting: this.powerSetting.get(),
            ias: this.ias.get(),
            tas: this.tas.get(),
            fuelFlow: this.fuelFlow.get(),
            fuelContingency: 0.05, // TODO
            finalReserve: 0.5, // TODO
            preTakeoffFuel: 2, // TODO
            postLandingFuel: 1, // TODO
            preTakeoffTime: 0.2, // TODO
            circuitTime: 4/60, // TODO
            postLandingTime: 0.1, // TODO
        };
    }

    insertStopAfter(stopElement: StopElement | null) {
        let firstStop: StopElement | null = this.firstStop.get();
        let newFirstStop: StopElement;
        if (stopElement === null) {
            let newFlight: FlightElement | null
            if(firstStop === null) {
                newFlight = null
            } else {
                newFlight = newFlightElement(firstStop)
            }
            newFirstStop = newStopElement(newFlight)
        } else {
            newFirstStop = firstStop!.insertStopAfter(stopElement)
        }
        this.firstStop.set(newFirstStop)
    }

    deleteStop(stopElement: StopElement) {
        let firstStop: StopElement | null = this.firstStop.get()
        let newFirstStop = firstStop!.deleteStop(stopElement)
        this.firstStop.set(newFirstStop)
    }

    insertWaypointAfter(flightElement: FlightElement, waypointElement: WaypointElement | null) {
        let firstStop: StopElement | null = this.firstStop.get()
        let newFirstStop = firstStop!.insertWaypointAfter(flightElement, waypointElement)
        this.firstStop.set(newFirstStop)
    }

    deleteWaypoint(flightElement: FlightElement, waypointElement: WaypointElement) {
        let firstStop: StopElement | null = this.firstStop.get()
        let newFirstStop = firstStop!.deleteWaypoint(flightElement, waypointElement)
        this.firstStop.set(newFirstStop)
    }

    insertNoteAfter(flightElement: FlightElement, legElement: LegElement, noteElement: NoteElement | null) {
        let firstStop: StopElement | null = this.firstStop.get()
        let newFirstStop = firstStop!.insertNoteAfter(flightElement, legElement, noteElement)
        this.firstStop.set(newFirstStop)
    }

    deleteNote(flightElement: FlightElement, legElement: LegElement, noteElement: NoteElement) {
        let firstStop: StopElement | null = this.firstStop.get()
        let newFirstStop = firstStop!.deleteNote(flightElement, legElement, noteElement)
        this.firstStop.set(newFirstStop)
    }

    generateFakePdf() {
        let tripPlan = this.toTripPlan(-1, -1, -1)
        let calculated = calculate(tripPlan)
        let pages = printTrip(calculated)
        draw(document.getElementById("test-canvas") as HTMLCanvasElement, pages);
    }

    generatePdf() {
        let tripPlan = this.toTripPlan(-1, -1, -1)
        let calculated = calculate(tripPlan)
        let pages = printTrip(calculated)

        window.fetch("https://api.dev.flight.daan.se/pdf", {
            method: 'POST',
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify(pages)
        }).then(resp => {
            if(resp.ok) {
                return resp.blob()
            } else {
                return Promise.reject(resp.status)
            }
        }).then(blob => {
            let url = window.URL.createObjectURL(blob)
            window.open(url)
        }) // TODO failure
    }
}

function printTrip(trip: CalculatedTrip): Page[] {
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

    let pages: Page[] = []
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
                    hor(y, 0, 8.5, 1, 0, 0)
                )
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

class StopElement {
    constructor(
        public readonly next: FlightElement | null,
        public readonly aerodrome: Value<Aerodrome | null>
    ) { }

    insertStopAfter(stopElement: StopElement): StopElement {
        let newFlight: FlightElement
        if(stopElement === this) {
            let newStop = newStopElement(this.next)
            newFlight = newFlightElement(newStop);
        } else {
            newFlight = this.next.insertStopAfter(stopElement);
        }
        return new StopElement(newFlight, this.aerodrome)
    }

    deleteStop(stopElement: StopElement): StopElement {
        if(stopElement === this) {
            if(this.next !== null) {
                return this.next.next
            } else {
                return null
            }
        } else {
            let newNext = this.next.deleteStop(stopElement)
            return new StopElement(newNext, this.aerodrome)
        }
    }

    deleteWaypoint(flightElement: FlightElement, waypointElement: WaypointElement): StopElement {
        return new StopElement(
            this.next.deleteWaypoint(flightElement, waypointElement),
            this.aerodrome
        )
    }

    insertWaypointAfter(flightElement: FlightElement, waypointElement: WaypointElement): StopElement {
        return new StopElement(
            this.next.insertWaypointAfter(flightElement, waypointElement),
            this.aerodrome
        )
    }

    insertNoteAfter(flightElement: FlightElement, legElement: LegElement, noteElement: NoteElement | null): StopElement {
        return new StopElement(
            this.next.insertNoteAfter(flightElement, legElement, noteElement),
            this.aerodrome
        )
    }

    deleteNote(flightElement: FlightElement, legElement: LegElement, noteElement: NoteElement): StopElement {
        return new StopElement(
            this.next.deleteNote(flightElement, legElement, noteElement),
            this.aerodrome
        )
    }
}

function newStopElement(next: FlightElement | null): StopElement {
    return new StopElement(next, new Value(null))
}

function newFlightElement(next: StopElement): FlightElement {
    return new FlightElement(next,null)
}

class FlightElement {
    constructor(
        public readonly next: StopElement,
        public readonly firstWaypoint: WaypointElement | null
    ) {  }

    insertStopAfter(stopElement: StopElement): FlightElement {
        let newStopElement = this.next.insertStopAfter(stopElement);
        return new FlightElement(newStopElement, this.firstWaypoint);
    }

    deleteStop(stopElement: StopElement) {
        let newNext = this.next.deleteStop(stopElement);
        if(newNext !== this.next) {
            if(newNext === null) {
                return null
            } else {
                return new FlightElement(newNext, this.firstWaypoint)
            }
        }
    }

    insertWaypointAfter(flightElement: FlightElement, waypointElement: WaypointElement | null): FlightElement {
        if(flightElement === this) {
            let newFirstWaypoint: WaypointElement;
            if (waypointElement === null) {
                let newLeg: LegElement | null
                if(this.firstWaypoint === null) {
                    newLeg = null
                } else {
                    newLeg = newLegElement(this.firstWaypoint)
                }
                newFirstWaypoint = newWaypointElement(newLeg)
            } else {
                newFirstWaypoint = this.firstWaypoint.insertWaypointAfter(waypointElement)
            }
            return new FlightElement(
                this.next,
                newFirstWaypoint
            )
        } else {
            return new FlightElement(
                this.next.insertWaypointAfter(flightElement, waypointElement),
                this.firstWaypoint
            )
        }
    }

    deleteWaypoint(flightElement: FlightElement, waypointElement: WaypointElement): FlightElement {
        if(flightElement === this) {
            let newFirstWaypoint = this.firstWaypoint.deleteWaypoint(waypointElement)
            return new FlightElement(this.next, newFirstWaypoint)
        } else {
            return new FlightElement(
                this.next.deleteWaypoint(flightElement, waypointElement),
                this.firstWaypoint
            )
        }
    }

    insertNoteAfter(flightElement: FlightElement, legElement: LegElement, noteElement: NoteElement | null): FlightElement {
        if(flightElement === this) {
            let newFirstWaypoint = this.firstWaypoint.insertNoteAfter(legElement, noteElement)
            return new FlightElement(this.next, newFirstWaypoint)
        } else {
            return new FlightElement(
                this.next.insertNoteAfter(flightElement, legElement, noteElement),
                this.firstWaypoint
            )
        }
    }

    deleteNote(flightElement: FlightElement, legElement: LegElement, noteElement: NoteElement): FlightElement {
        if(flightElement === this) {
            let newFirstWaypoint = this.firstWaypoint.deleteNote(legElement, noteElement)
            return new FlightElement(this.next, newFirstWaypoint)
        } else {
            return new FlightElement(
                this.next.deleteNote(flightElement, legElement, noteElement),
                this.firstWaypoint
            )
        }
    }
}

function newWaypointElement(next: LegElement | null): WaypointElement {
    return new WaypointElement(next, new Value("simple"), new Value("New Waypoint"), new Value(null), new Value(null))
}

function newLegElement(next: WaypointElement): LegElement {
    return new LegElement(
        next,
        new Value(null),
        new Value(null),
        new Value(null),
        new Value(null),
        new Value(null),
        new Value(null),
        new Value(null),
        null,
    )
}

class WaypointElement {
    constructor(
        public readonly next: LegElement | null,
        public readonly type: Value<WaypointType>,
        public readonly name: Value<string>,
        public readonly altitude: Value<number | null>,
        public readonly eta: Value<Time | null>
    ) {
    }

    insertWaypointAfter(waypointElement: WaypointElement): WaypointElement {
        let newLeg: LegElement
        if(waypointElement === this) {
            let newWaypoint = newWaypointElement(this.next)
            newLeg = newLegElement(newWaypoint);
        } else {
            newLeg = this.next.insertWaypointAfter(waypointElement);
        }
        return new WaypointElement(newLeg, this.type, this.name, this.altitude, this.eta)
    }

    deleteWaypoint(waypointElement: WaypointElement): WaypointElement {
        if(waypointElement === this) {
            if(this.next === null) {
                return null
            } else {
                return this.next.next
            }
        } else {
            if(this.next === null) {
                return this
            } else {
                let newLeg = this.next.deleteWaypoint(waypointElement)
                return new WaypointElement(newLeg, this.type, this.name, this.altitude, this.eta)
            }
        }
    }

    insertNoteAfter(legElement: LegElement, noteElement: NoteElement | null): WaypointElement {
        let newLeg = this.next.insertNoteAfter(legElement, noteElement);
        return new WaypointElement(newLeg, this.type, this.name, this.altitude, this.eta)
    }

    deleteNote(legElement: LegElement, noteElement: NoteElement): WaypointElement {
        let newLeg = this.next.deleteNote(legElement, noteElement);
        return new WaypointElement(newLeg, this.type, this.name, this.altitude, this.eta)
    }
}

class LegElement {
    constructor(
        public readonly next: WaypointElement,
        public readonly trueTrack: Value<number | null>,
        public readonly distance: Value<number | null>,
        public readonly windDirection: Value<number | null>,
        public readonly windVelocity: Value<number | null>,
        public readonly altitude: Value<number | null>,
        public readonly msa: Value<number | null>,
        public readonly ete: Value<Duration | null>,
        public readonly firstNote: NoteElement | null
    ) {
    }

    insertWaypointAfter(waypointElement: WaypointElement): LegElement {
        let newWaypoint = this.next.insertWaypointAfter(waypointElement);
        return this.withNext(newWaypoint);
    }

    deleteWaypoint(waypointElement: WaypointElement): LegElement {
        let newNext = this.next.deleteWaypoint(waypointElement);
        if(newNext != this.next) {
            if(newNext === null) {
                return null
            } else {
                return this.withNext(newNext)
            }
        }
    }

    insertNoteAfter(legElement: LegElement, noteElement: NoteElement | null): LegElement {
        if(legElement === this) {
            let newNote: NoteElement
            if(noteElement === null) {
                newNote = new NoteElement(
                    this.firstNote,
                    new Value(null),
                    new Value(""),
                    new Value(""),
                )
            } else {
                newNote = this.firstNote.insertNoteAfter(noteElement)
            }
            return this.withFirstNote(newNote)
        } else {
            let newNext = this.next.insertNoteAfter(legElement, noteElement)
            return this.withNext(newNext)
        }
    }

    deleteNote(legElement: LegElement, noteElement: NoteElement): LegElement {
        if(legElement === this) {
            let newNote = this.firstNote.deleteNote(noteElement)
            return this.withFirstNote(newNote)
        } else {
            let newNext = this.next.deleteNote(legElement, noteElement)
            return this.withNext(newNext)
        }
    }

    private withNext(next: WaypointElement): LegElement {
        return new LegElement(
            next,
            this.trueTrack,
            this.distance,
            this.windDirection,
            this.windVelocity,
            this.altitude,
            this.msa,
            this.ete,
            this.firstNote
        )
    }

    private withFirstNote(firstNote: NoteElement): LegElement {
        return new LegElement(
            this.next,
            this.trueTrack,
            this.distance,
            this.windDirection,
            this.windVelocity,
            this.altitude,
            this.msa,
            this.ete,
            firstNote
        )
    }
}

class NoteElement {
    constructor(
        public readonly next: NoteElement,
        public readonly time: Value<Duration | null>,
        public readonly note: Value<string | null>,
        public readonly number: Value<string | null>,
    ) {
    }

    insertNoteAfter(noteElement: NoteElement): NoteElement {
        if(noteElement === this) {
            let newNote = new NoteElement(
                this.next,
                new Value(null),
                new Value(""),
                new Value(""),
            )
            return this.withNext(newNote)
        } else {
            let newNote = this.next.insertNoteAfter(noteElement)
            return this.withNext(newNote)
        }
    }

    deleteNote(noteElement: NoteElement): NoteElement {
        if(noteElement === this) {
            return this.next
        } else {
            let newNext = this.next.deleteNote(noteElement)
            return this.withNext(newNext)
        }
    }

    private withNext(next: NoteElement): NoteElement {
        return new NoteElement(
            next,
            this.time,
            this.note,
            this.number,
        )
    }
}

function trip(tripPage: TripPage) {
    return arr([
        h1(text("Trip")),
        button(text("Save"), onklick(() => tripPage.save())),
        text("Name:"),
        textInput(value(tripPage.name)),
        h1(text("Plan")),
        div(
            clazz("parameters"),
            div(text("Contingency Fuel")), div(text("5%")),
            div(text("Final Reserve")), div(text("30:00")),
            div(text("Pre-Take-off Fuel")), div(text("2")),
            div(text("Post-Landing Fuel")), div(text("1")),
            div(text("Pre-Take-off Time")), div(text("12:00")),
            div(text("Circuit Time")), div(text("04:00")),
            div(text("Post-Landing Time")), div(text("06:00")),
        ),
        div(
            clazz("perfo"),
            div(text("Pwr")),
            div(text("IAS")),
            div(text("TAS")),
            div(text("Fuel")),
            div(textInput(value(tripPage.powerSetting))),
            div(numberInput(tripPage.ias)),
            div(numberInput(tripPage.tas)),
            div(numberInput(tripPage.fuelFlow)),
        ),
        div(sub(map(tripPage.firstStop, fs => arr(firstStopElement(tripPage, fs))))),
        div(clazz("print-info"),
            text("Screen: 27 inch"),br(),
            text("Map: 1:250 000")
        ),
        div(
            clazz("calculate-button"),
            button(text("Generate Fake Pdf"), onklick(() => tripPage.generateFakePdf())),
            button(text("Generate Pdf"), onklick(() => tripPage.generatePdf()))
        ),
        div(canvas(id("test-canvas"), width(0), height(0)))
    ])
}

function firstStopElement(tripPage: TripPage, stopElement: StopElement | null) {
    if(stopElement === null) {
        return [
            div(clazz("stop-line"), button(text("Insert Stop"), onklick(() => tripPage.insertStopAfter(null))))
        ]
    } else {
        return [
            div(clazz("stop-line"), button(text("Insert Stop"), onklick(() => { tripPage.insertStopAfter(null) }))),
            ...renderStopElement(tripPage, true, stopElement)
        ]
    }
}

function renderStopElement(
    tripPage: TripPage,
    noFlightPlanBefore: boolean,
    stopElement: StopElement
): Component[] {
    let deleteButton: Component[];
    if(noFlightPlanBefore && (stopElement.next === null || stopElement.next.firstWaypoint === null)) {
        deleteButton = [button(text("Delete"), onklick(() => tripPage.deleteStop(stopElement)))]
    } else {
        deleteButton = []
    }
    return [
        div(clazz("stop-line"), aerodromeInput(tripPage.aerodromes, stopElement.aerodrome), ...deleteButton),
        ...renderPostStopElement(tripPage, stopElement)
    ]
}

function renderPostStopElement(
    tripPage: TripPage,
    stopElement: StopElement
): Component[] {
    let flightElement: FlightElement | null = stopElement.next

    if(flightElement === null) {
        return [
            div(clazz("stop-line"), button(text("Insert Stop"), onklick(() => tripPage.insertStopAfter(stopElement))))
        ]
    } else {
        return [
            firstWaypointOrInsertStop(tripPage, stopElement, flightElement, flightElement.firstWaypoint),
            ...renderStopElement(tripPage, flightElement.firstWaypoint === null, flightElement.next)
        ]
    }
}

function firstWaypointOrInsertStop(
    tripPage: TripPage,
    previous: StopElement,
    flightElement: FlightElement,
    firstWaypoint: WaypointElement | null
): Component {
    if(firstWaypoint === null) {
        return div(
            clazz("action"),
            button(text("Insert Stop"), onklick(() => { tripPage.insertStopAfter(previous) })),
            button(text("Insert Flightplan"), onklick(() => { tripPage.insertWaypointAfter(flightElement, null) })),
        )
    } else {
        return div(clazz("flightplan"),
            div(clazz("type-header")),
            div(clazz("tt-header"), text("TT")),
            div(clazz("dist-header"), text("Dist")),
            div(clazz("wind-header"), text("Wind")),
            div(clazz("alt-header"), text("Alt")),
            div(clazz("msa-header"), text("MSA")),
            div(clazz("et-header"), text("ET")),
            div(clazz("action-header")),
            div(clazz("action"), button(text("Insert Waypoint"), onklick(() => { tripPage.insertWaypointAfter(flightElement, null) }))),
            div(clazz("wp-action")), // TODO new class
            ...renderWaypointElement(tripPage, flightElement, firstWaypoint)
        )
    }
}

function formatWaypointType(waypointType: WaypointType): string {
    switch (waypointType) {
        case "take-off":
            return "T-O"
        case "simple":
            return ""
        case "rate-one":
            return "R-1"
        case "landing":
            return "LND"
        default:
            throw "Unknown waypoint type " + waypointType
    }
}

function renderWaypointElement(
    tripPage: TripPage,
    flightElement: FlightElement,
    waypointElement: WaypointElement
): Component[] {
    return [
        div(clazz("wp-type"), dropdown<WaypointType>(waypointElement.type, ["simple", "rate-one", "take-off", "landing"], t => formatWaypointType(t))),
        div(clazz("wp-name"), textInput(value(waypointElement.name))),
        div(clazz("wp-alt"), numberInput(waypointElement.altitude)),
        div(clazz("wp-msa")),
        div(clazz("wp-et"), timeInputHHMM(waypointElement.eta)),
        div(clazz("wp-action"), button(text("Delete"), onklick(() => tripPage.deleteWaypoint(flightElement, waypointElement)))),
        ...renderPostWaypointElement(tripPage, flightElement, waypointElement)
    ]
}

function renderPostWaypointElement(
    tripPage: TripPage,
    flightElement: FlightElement,
    waypointElement: WaypointElement
): Component[] {
    let legElement: LegElement | null = waypointElement.next

    if(legElement === null) {
        return [
            div(clazz("action"), clazz("last"), button(text("Insert Waypoint"), onklick(() => tripPage.insertWaypointAfter(flightElement, waypointElement))))
        ]
    } else {
        return [
            div(clazz("leg-type")),
            div(clazz("leg-tt"), numberInput(legElement.trueTrack, 0, 360)),
            div(clazz("leg-dist"), numberInput(legElement.distance, 0)),
            div(clazz("leg-wind-dir"), numberInput(legElement.windDirection, 0, 360)),
            div(clazz("leg-wind-vel"), numberInput(legElement.windVelocity, 0)),
            div(clazz("leg-alt"), numberInput(legElement.altitude)),
            div(clazz("leg-msa"), numberInput(legElement.msa)),
            div(clazz("leg-et"), timeInputMMSS(legElement.ete)),
            div(clazz("leg-action"), button(text("Insert Waypoint"), onklick(() => { tripPage.insertWaypointAfter(flightElement, waypointElement) }))),
            div(clazz("note-pre")),
            div(clazz("note-insert"), button(text("Insert Note"), onklick(() => { tripPage.insertNoteAfter(flightElement, legElement, null) }))),
            div(clazz("note-action")),
            ...renderLegNotes(tripPage, flightElement, legElement, legElement.firstNote),
            ...renderWaypointElement(tripPage, flightElement, legElement.next)
        ]
    }
}

function renderLegNotes(
    tripPage: TripPage,
    flightElement: FlightElement,
    legElement: LegElement,
    noteElement: NoteElement | null
): Component[] {
    if(noteElement === null) {
        return []
    } else {
        return [
            div(clazz("note-pre")),
            div(clazz("note-time"), timeInputMMSS(noteElement.time)),
            div(clazz("note-note"), textInput(value(noteElement.note))),
            div(clazz("note-number"), textInput(value(noteElement.number))),
            div(clazz("note-post")),
            div(clazz("note-action"), button(text("Delete"), onklick(() => { tripPage.deleteNote(flightElement, legElement, noteElement) }))),
            div(clazz("note-pre")),
            div(clazz("note-insert"), button(text("Insert Note"), onklick(() => { tripPage.insertNoteAfter(flightElement, legElement, noteElement) }))),
            div(clazz("note-action")),
            ...renderLegNotes(tripPage, flightElement, legElement, noteElement.next)
        ]
    }
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
                fuel = fuelFlow * ete
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
                    extra += tripPlan.circuitTime + tripPlan.preTakeoffTime
                }
                if(waypoints[i].type === "landing") {
                    // TODO if null
                    extra += tripPlan.circuitTime + tripPlan.postLandingTime
                }
                if(legs[i - 1].ete != null) {
                    waypoints[i].eta = waypoints[i - 1].eta + legs[i - 1].ete + extra
                }
            }
            for (let i = idx - 1; i >= 0; i--) {
                let extra = 0
                if(waypoints[i].type === "take-off") {
                    // TODO if null
                    extra += tripPlan.circuitTime + tripPlan.preTakeoffTime
                }
                if(waypoints[i + 1].type === "landing") {
                    // TODO if null
                    extra += tripPlan.circuitTime + tripPlan.postLandingTime
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
    let fuel = fuelFlow * tripPlan.finalReserve
    for (let i = plans.length - 1; i >= 0; i--) {
        let plan = plans[i]
        let waypoints = plan.waypoints;

        waypoints[waypoints.length - 1].fuel = fuel

        for (let j = plan.waypoints.length - 2; j >= 0; j--) {
            let extra = 0
            if(waypoints[j].type === "take-off") {
                // TODO if null
                extra += fuelFlow * tripPlan.circuitTime + tripPlan.preTakeoffFuel
            }
            if(waypoints[j + 1].type === "landing") {
                // TODO if null
                extra += fuelFlow * tripPlan.circuitTime + tripPlan.postLandingFuel
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

interface Page {
    height: number,
    width: number,
    drawings: Drawing[]
}

type Drawing = Line | Txt | ColorBox

interface Coordinate {
    y: number // px
    x: number // px
}

interface Size {
    height: number // px
    width: number // px
}

interface Line {
    type: "line"
    start: Coordinate
    end: Coordinate
    lineWidth: number
    style: "solid" | "dotted"
}

interface SolidLine extends Line {
    style: "solid"
}

interface DottedLine extends Line {
    style: "dotted"
    dotDistance: number
}

interface Txt {
    type: "text"
    start: Coordinate
    fontSize: number // px
    text: string
    align: "left" | "center" | "right"
}

interface Color {
    r: number // 0.0 - 1.0
    g: number // 0.0 - 1.0
    b: number
}

interface ColorBox {
    type: "colorbox"
    topLeft: Coordinate
    size: Size
    color: Color
}

function draw(canvas: HTMLCanvasElement, pages: Page[]) {
    let pixels = Math.sqrt(window.screen.height * window.screen.height + window.screen.width * window.screen.width);
    // In HTML, there are 96 pixels per inch
    // TODO make configurable
    let scale = (pixels / 27) / 96

    let pageMargin = 20

    let width = 0
    let height = 0
    for (let page of pages) {
        if(width < page.width * scale) {
            width = page.width * scale
        }
        height += pageMargin + Math.ceil(page.height * scale);
    }
    width += 2 * pageMargin;
    height += pageMargin;

    canvas.width = width
    canvas.height = height

    let ctx = canvas.getContext("2d");
    ctx.fillStyle = "lightgrey"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    let xOffset = pageMargin
    let yOffset = pageMargin
    for (let page of pages) {
        drawPage(xOffset, yOffset, page)
        yOffset += pageMargin + Math.ceil(page.height * scale);
    }

    function drawPage(xOffset: number, yOffset: number, page: Page) {
        ctx.resetTransform()
        ctx.translate(xOffset, yOffset)
        // ctx.scale(scale, scale);

        ctx.fillStyle = "white"
        ctx.fillRect(0, 0, Math.ceil(scale*page.width), Math.ceil(scale * page.height))
        ctx.fillStyle = "black"

        page.drawings.forEach((drawing) => {
            if(drawing.type === "line") {
                ctx.beginPath()
                if(drawing.style == "solid") {
                    ctx.setLineDash([])
                } else if(drawing.style == "dotted") {
                    ctx.setLineDash([1, (drawing as DottedLine).dotDistance])
                } else {
                    throw "Unknown style"
                }

                if(drawing.start.y == drawing.end.y) {
                    // Horizontal line
                    let width = Math.round(scale * drawing.lineWidth)
                    let halfWidth = width / 2;
                    let x1 = Math.round(scale * drawing.start.x)
                    let x2 = Math.round(scale * drawing.end.x)
                    let y = Math.round(scale * drawing.start.y - halfWidth) + halfWidth
                    ctx.moveTo(x1, y)
                    ctx.lineTo(x2, y)
                    ctx.lineWidth = width
                } else if (drawing.start.x == drawing.end.x) {
                    // Vertical line
                    let width = Math.round(scale * drawing.lineWidth)
                    let halfWidth = width / 2;
                    let x = Math.round(scale * drawing.start.x - halfWidth) + halfWidth
                    let y1 = Math.round(scale * drawing.start.y)
                    let y2 = Math.round(scale * drawing.end.y)
                    ctx.moveTo(x, y1)
                    ctx.lineTo(x, y2)
                    ctx.lineWidth = width
                } else {
                    ctx.moveTo(drawing.start.x, drawing.start.y)
                    ctx.lineTo(drawing.end.x, drawing.end.y)
                    ctx.lineWidth = drawing.lineWidth
                }
                ctx.stroke()
            } else if(drawing.type === "text") {
                ctx.font = "normal " + scale * drawing.fontSize + "px Times New Roman"
                if(drawing.align == "left") {
                    ctx.textAlign = "left"
                } else if(drawing.align == "center") {
                    ctx.textAlign = "center"
                } else if(drawing.align == "right") {
                    ctx.textAlign = "right"
                } else {
                    throw "Unknown align"
                }
                ctx.fillText(drawing.text, scale * drawing.start.x, scale * drawing.start.y)
            } else if(drawing.type === "colorbox") {
                ctx.beginPath()
                ctx.fillStyle = colorToString(drawing.color)
                let x1 = Math.round(scale * drawing.topLeft.x)
                let y1 = Math.round(scale * drawing.topLeft.y)
                let x2 = Math.round(scale * (drawing.topLeft.x + drawing.size.width))
                let y2 = Math.round(scale * (drawing.topLeft.y + drawing.size.height))
                ctx.fillRect(x1, y1, (x2 - x1), (y2 - y1))
                ctx.fillStyle = "black"
            } else {
                throw "Unknown type"
            }
        })
    }
}

function colorToString(color: Color): string {
    return "#" +
        componentToString(color.r) +
        componentToString(color.g) +
        componentToString(color.b)
}

function componentToString(comp: number) {
    let num = Math.round(comp * 255)
    if(num < 0) {
        num = 0
    } else if(num > 255) {
        num = 255
    }
    let str = num.toString(16)
    if(str.length < 2) {
        str = "0" + str
    }
    return str
}

class LogbookPage {
    aerodromes: Aerodrome[]
    aircrafts: Aircraft[]

    pages: (LogbookEntry | null)[][] = []
    page: Value<number>
    editing: number | null

    // Edit fields
    date: Value<Date | null>
    from: Value<Aerodrome | null>
    to: Value<Aerodrome | null>
    departure: Value<Time | null>
    arrival: Value<Time | null>
    aircraft: Value<Aircraft | null>
    landings: Value<number | null>
    pic: Value<Duration | null>
    dual: Value<Duration | null>

    totalTime: Value<number | null>

    constructor(
        private entityRepo: EntityRepo
    ) {
        this.aerodromes = this.entityRepo.getAllOfType<Aerodrome>("aerodrome")
        this.aircrafts = this.entityRepo.getAllOfType<Aircraft>("aircraft")

        let entries = this.entityRepo.getAllOfType<LogbookEntry>("logbook-entry")
        for (let entry of entries) {
            for(let i = this.pages.length; i <= entry.page; i++) {
                this.pages.push([...Array(15).keys()].map(() => null))
            }
            this.pages[entry.page][entry.line] = entry
        }
        this.pages.push([...Array(15).keys()].map(() => null))

        this.page = new Value(this.pages.length == 1? 0: this.pages.length - 2)
    }

    openPage(page: number) {
        this.page.set(page)
    }

    edit(line: number) {
        let entry = this.pages[this.page.get()][line]
        if(entry === null) {
            this.date = new Value(null)
            this.from = new Value(null)
            this.to = new Value(null)
            this.departure = new Value(null)
            this.arrival = new Value(null)
            this.aircraft = new Value(null)
            this.landings = new Value(null)
            this.pic = new Value(null)
            this.dual = new Value(null)
        } else {
            this.date = new Value(entry.date)
            this.from = new Value(entry.from === null? null: this.entityRepo.getByVersion<Aerodrome>(entry.from))
            this.to = new Value(entry.to === null? null: this.entityRepo.getByVersion<Aerodrome>(entry.to))
            this.departure = new Value(entry.departure)
            this.arrival = new Value(entry.arrival)
            this.aircraft = new Value(entry.aircraft === null? null: this.entityRepo.getByVersion<Aircraft>(entry.aircraft))
            this.landings = new Value(entry.landings)
            this.pic = new Value(entry.pic)
            this.dual = new Value(entry.dual)
        }

        this.totalTime = new Value(null)
        let updateTotalTime = () => {
            let dep = this.departure.get();
            let arr = this.arrival.get();
            if(dep == null || arr == null) {
                this.totalTime.set(null)
            } else {
                this.totalTime.set(arr - dep)
            }
        }
        this.arrival.subscribe(updateTotalTime)
        this.departure.subscribe(updateTotalTime)
        updateTotalTime()

        this.editing = line
        this.page.set(this.page.get())
    }

    save() {
        let original = this.pages[this.page.get()][this.editing]
        let newEntry: LogbookEntry = {
            type: "logbook-entry",
            version: this.entityRepo.nextVersion(),
            entity: original === null? this.entityRepo.nextEntity(): original.entity,
            page: this.page.get(),
            line: this.editing,
            date: this.date.get(),
            from: this.from.get() == null? null: this.from.get().version,
            to: this.to.get() == null? null: this.to.get().version,
            departure: this.departure.get(),
            arrival: this.arrival.get(),
            aircraft: this.aircraft.get() == null? null: this.aircraft.get().version,
            landings: this.landings.get(),
            pic: this.pic.get(),
            dual: this.dual.get(),
            trip: null
        }
        this.entityRepo.save([newEntry])
        this.pages[this.page.get()][this.editing] = newEntry

        if(this.page.get() == this.pages.length - 1) {
            this.pages.push([...Array(15).keys()].map(() => null))
        }

        this.editing = null
        this.page.set(this.page.get())
    }

    delete() {
        let original = this.pages[this.page.get()][this.editing]

        if(original != null) {
            this.entityRepo.save([{
                type: "tombstone",
                entity: original.entity,
                version: this.entityRepo.nextVersion()
            }])
        }
        this.pages[this.page.get()][this.editing] = null

        this.editing = null
        this.page.set(this.page.get())
    }

    cancel() {
        this.editing = null
        this.page.set(this.page.get())
    }

    aerodromeCode(ver: AerodromeVersion): string {
        if(ver == null) {
            return ""
        } else {
            return this.entityRepo.getByVersion<Aerodrome>(ver).code
        }
    }

    aircraftRegistration(ver: AircraftVersion): string {
        if(ver == null) {
            return ""
        } else {
            return this.entityRepo.getByVersion<Aircraft>(ver).registration
        }
    }

    aircraftModel(ver: AircraftVersion): string {
        if(ver == null) {
            return ""
        } else {
            return this.entityRepo.getByVersion<Aircraft>(ver).model
        }
    }

    totalTimeOf(entry: LogbookEntry | null): number | null {
        if(entry == null || entry.departure == null || entry.arrival == null) {
            return null
        } else {
            return entry.arrival - entry.departure
        }
    }

    totalTimeThisPage(currentPage: number): Duration {
        return this.pages[currentPage]
            .map(e => this.totalTimeOf(e))
            .map(t => t === null? 0: t)
            .reduce((a, b) => a + b)
    }

    landingsThisPage(currentPage: number): Duration {
        return this.pages[currentPage]
            .map(e => e == null? null: e.landings)
            .map(l => l === null? 0: l)
            .reduce((a, b) => a + b)
    }

    picTimeThisPage(currentPage: number): Duration {
        return this.pages[currentPage]
            .map(e => e == null? null: e.pic)
            .map(t => t === null? 0: t)
            .reduce((a, b) => a + b)
    }

    dualTimeThisPage(currentPage: number): Duration {
        return this.pages[currentPage]
            .map(e => e == null? null: e.dual)
            .map(t => t === null? 0: t)
            .reduce((a, b) => a + b)
    }

    totalTimePreviousPage(currentPage: number): Duration {
        if(currentPage == 0) {
            return 0
        } else {
            return this.totalTimeGrandTotal(currentPage - 1)
        }
    }

    landingsPreviousPage(currentPage: number): Duration {
        if(currentPage == 0) {
            return 0
        } else {
            return this.landingsGrandTotal(currentPage - 1)
        }
    }

    picTimePreviousPage(currentPage: number): Duration {
        if(currentPage == 0) {
            return 0
        } else {
            return this.picTimeGrandTotal(currentPage - 1)
        }
    }

    dualTimePreviousPage(currentPage: number): Duration {
        if(currentPage == 0) {
            return 0
        } else {
            return this.dualTimeGrandTotal(currentPage - 1)
        }
    }

    totalTimeGrandTotal(currentPage: number): Duration {
        return this.totalTimeThisPage(currentPage)
            + this.totalTimePreviousPage(currentPage)
    }

    landingsGrandTotal(currentPage: number): Duration {
        return this.landingsThisPage(currentPage)
            + this.landingsPreviousPage(currentPage)
    }

    picTimeGrandTotal(currentPage: number): Duration {
        return this.picTimeThisPage(currentPage)
            + this.picTimePreviousPage(currentPage)
    }

    dualTimeGrandTotal(currentPage: number): Duration {
        return this.dualTimeThisPage(currentPage)
            + this.dualTimePreviousPage(currentPage)
    }
}

function logbook(logbookPage: LogbookPage): Component {
    return sub(map(logbookPage.page, currentPage => {
        let pages = [text("Page:"), ...[...logbookPage.pages.keys()].map(p => {
            let extraClazz = p == currentPage? [clazz("selected")]: []
            return span(clazz("page"), ...extraClazz, text((p + 1).toString()), onklick(() => logbookPage.openPage(p)))
        })]
        let lines = [...Array(15).keys()]
            .flatMap(idx => {
                if(idx === logbookPage.editing) {
                    return [
                        div(clazz("date"), dateInput(logbookPage.date)),
                        div(clazz("dep-place"), aerodromeInput(logbookPage.aerodromes, logbookPage.from)),
                        div(clazz("dep-time"), timeInputHHMM(logbookPage.departure)),
                        div(clazz("arr-place"), aerodromeInput(logbookPage.aerodromes, logbookPage.to)),
                        div(clazz("arr-time"), timeInputHHMM(logbookPage.arrival)),
                        div(clazz("model"), sub(map(logbookPage.aircraft, (a) => text(a === null? "": a.model)))),
                        div(clazz("registration"), aircraftInput(logbookPage.aircrafts, logbookPage.aircraft)),
                        div(clazz("total-time"), sub(map(logbookPage.totalTime, t => text(formatHHMM(t))))),
                        div(clazz("landings"), numberInput(logbookPage.landings)),
                        div(clazz("pic-time"), timeInputHHMM(logbookPage.pic)),
                        div(clazz("dual-time"), timeInputHHMM(logbookPage.dual)),
                        div(clazz("action"),
                            button(text("Save"), onklick(() => { logbookPage.save() })),
                            button(text("Cancel"), onklick(() => { logbookPage.cancel() })),
                            button(text("Delete"), onklick(() => { logbookPage.delete() }))
                        )
                    ]
                } else {
                    let editDiv: Component
                    if(logbookPage.editing == null) {
                        editDiv = div(clazz("action"), button(text("Edit"), onklick(() => { logbookPage.edit(idx) })))
                    } else {
                        editDiv = div(clazz("action"), text("\xa0"))
                    }

                    let entry = logbookPage.pages[currentPage][idx]

                    if (entry === null) {
                        return [
                            div(clazz("date")),
                            div(clazz("dep-place")),
                            div(clazz("dep-time")),
                            div(clazz("arr-place")),
                            div(clazz("arr-time")),
                            div(clazz("model")),
                            div(clazz("registration")),
                            div(clazz("total-time")),
                            div(clazz("landings")),
                            div(clazz("pic-time")),
                            div(clazz("dual-time")),
                            editDiv
                        ]
                    } else {
                        return [
                            div(clazz("date"), text(formatDate(entry.date))),
                            div(clazz("dep-place"), text(logbookPage.aerodromeCode(entry.from))),
                            div(clazz("dep-time"), text(formatHHMM(entry.departure))),
                            div(clazz("arr-place"), text(logbookPage.aerodromeCode(entry.to))),
                            div(clazz("arr-time"), text(formatHHMM(entry.arrival))),
                            div(clazz("model"), text(logbookPage.aircraftModel(entry.aircraft))),
                            div(clazz("registration"), text(logbookPage.aircraftRegistration(entry.aircraft))),
                            div(clazz("total-time"), text((entry.arrival == null || entry.departure == null)? "": formatHHMM(entry.arrival - entry.departure))),
                            div(clazz("landings"), text(entry.landings == null? "": entry.landings.toString())),
                            div(clazz("pic-time"), text(formatHHMM(entry.pic))),
                            div(clazz("dual-time"), text(formatHHMM(entry.dual))),
                            editDiv
                        ]
                    }
                }
            })
        return arr([
            div(clazz("pages"), ...pages),
            div(
                clazz("logbook"),
                div(clazz("date-header"), text("Date (dd/mm/yy)")),
                div(clazz("departure-header"), text("Departure")),
                div(clazz("arrival-header"), text("Arrival")),
                div(clazz("aircraft-header"), text("Aircraft")),
                div(clazz("total-time-header"), text("Total Time of Flight")),
                div(clazz("landings-header"), text("Landings")),
                div(clazz("function-time-header"), text("Pilot Function Time")),
                div(clazz("action-header")),
                div(clazz("dep-place-header"), text("Place")),
                div(clazz("dep-time-header"), text("Time")),
                div(clazz("arr-place-header"), text("Place")),
                div(clazz("arr-time-header"), text("Time")),
                div(clazz("model-header"), text("Model")),
                div(clazz("registration-header"), text("Registration")),
                div(clazz("pic-time-header"), text("PIC")),
                div(clazz("dual-time-header"), text("Dual")),
                ...lines,
                div(clazz("total-this-blank")),
                div(clazz("total-this-header"), text("Total This Page")),
                div(clazz("total-this-total-time"), text(formatHHMM(logbookPage.totalTimeThisPage(currentPage)))),
                div(clazz("total-this-landings"), text(logbookPage.landingsThisPage(currentPage).toString())),
                div(clazz("total-this-pic-time"), text(formatHHMM(logbookPage.picTimeThisPage(currentPage)))),
                div(clazz("total-this-dual-time"), text(formatHHMM(logbookPage.dualTimeThisPage(currentPage)))),
                div(clazz("action")),
                div(clazz("total-prev-blank")),
                div(clazz("total-prev-header"), text("Total From Previous Pages")),
                div(clazz("total-prev-total-time"), text(formatHHMM(logbookPage.totalTimePreviousPage(currentPage)))),
                div(clazz("total-prev-landings"), text(logbookPage.landingsPreviousPage(currentPage).toString())),
                div(clazz("total-prev-pic-time"), text(formatHHMM(logbookPage.picTimePreviousPage(currentPage)))),
                div(clazz("total-prev-dual-time"), text(formatHHMM(logbookPage.dualTimePreviousPage(currentPage)))),
                div(clazz("action")),
                div(clazz("total-grand-blank")),
                div(clazz("total-grand-header"), text("Total Time")),
                div(clazz("total-grand-total-time"), text(formatHHMM(logbookPage.totalTimeGrandTotal(currentPage)))),
                div(clazz("total-grand-landings"), text(logbookPage.landingsGrandTotal(currentPage).toString())),
                div(clazz("total-grand-pic-time"), text(formatHHMM(logbookPage.picTimeGrandTotal(currentPage)))),
                div(clazz("total-grand-dual-time"), text(formatHHMM(logbookPage.dualTimeGrandTotal(currentPage)))),
                div(clazz("action")),
            ),
            div(clazz("pages"), ...pages),
        ])
    }))
}

class ManagePage {
    page: Value<Component> = new Value(arr([]))
    descriptions = [
        aircraft,
        aerodrome
    ]

    constructor(private entityRepo: EntityRepo) {

    }

    open<T extends VersionedEntity>(description: EntityDescription<T>) {
        this.page.set(manageEntity(new ManageEntityPage<T>(this.entityRepo, description, this)))
    }

    showDetails<T extends VersionedEntity>(description: EntityDescription<T>, entity: T) {
        this.page.set(showDetails(new ShowDetailsPage<T>(entity, description)))
    }

    create<T extends VersionedEntity>(description: EntityDescription<T>) {
        this.page.set(createEntity(new CreatePage<T>(description, this.entityRepo, this)))
    }
}

function manage(managePage: ManagePage): Component {
    let titles = managePage.descriptions
        .map(e => div(text(e.name), onklick(() => managePage.open(e))),)

    return arr([
        div(
            clazz("navigation-bar"),
            ...titles
        ),
        div(
            sub(managePage.page)
        )
    ])
}

class ManageEntityPage<T extends VersionedEntity> {
    public entities: T[]
    constructor(
        repo: EntityRepo,
        private description: EntityDescription<T>,
        private managePage: ManagePage
    ) {
        this.entities = repo.getAllOfType(description.type)
    }

    name(entity: T): string {
        return entity[this.description.nameKey]
    }

    typeName(): string {
        return this.description.name
    }

    showDetails(entity: T) {
        this.managePage.showDetails(this.description, entity)
    }

    create() {
        this.managePage.create(this.description)
    }
}

function manageEntity<T extends VersionedEntity>(
    manageEntityPage: ManageEntityPage<T>
) {
    let items = manageEntityPage.entities.map(e =>
        div(
            onklick(() => manageEntityPage.showDetails(e)),
            text(manageEntityPage.name(e))
        )
    )
    return arr([
        h1(text(manageEntityPage.typeName())),
        ...items,
        button(text("Create"), onklick(() => manageEntityPage.create()))
    ])
}

class ShowDetailsPage<T extends VersionedEntity> {
    constructor(
        public entity: T,
        public description: EntityDescription<T>
    ) {
    }

    title(): string {
        return this.description.name + ": " + this.entity[this.description.nameKey]
    }
}

function showDetails<T extends VersionedEntity>(
    showDetailsPage: ShowDetailsPage<T>
): Component {
    let fields = showDetailsPage.description.fields.map(f =>
        div(
            clazz("key-val"),
            div(text(f.name)),
            div(text(showDetailsPage.entity[f.key]))
        )
    )
    return arr([
        h1(text(showDetailsPage.title())),
        ...fields
    ])
}

class CreatePage<T extends VersionedEntity> {
    public values: { [key: string]: Value<string> } = {}

    constructor(
        public description: EntityDescription<T>,
        private entityRepo: EntityRepo,
        private managePage: ManagePage
    ) {
        description.fields.forEach(f => {
            this.values[f.key] = new Value("")
        })
    }

    title(): string {
        return "Create " + this.description.name
    }

    create() {
        let obj: VersionedEntity = {
            type: this.description.type,
            entity: this.entityRepo.nextEntity(),
            version: this.entityRepo.nextVersion()
        }
        for (let key in this.values) {
            obj[key] = this.values[key].get()
        }
        this.entityRepo.save([obj])
        this.managePage.open(this.description)
    }
}

function createEntity<T extends VersionedEntity>(
    createPage: CreatePage<T>
): Component {
    let fields = createPage.description.fields.map(f =>
        div(
            clazz("key-val"),
            div(text(f.name)),
            div(textInput(value(createPage.values[f.key]))),
        )
    )
    return arr([
        h1(text(createPage.title())),
        ...fields,
        button(text("Create"), onklick(() => createPage.create()))
    ])
}

class EntityDescription<T extends VersionedEntity> {
    public fields: EntityField[] = []
    constructor(
        public name: string,
        public type: string,
        public nameKey: string
    ) {
    }

    field(key: string, name: string): EntityDescription<T> {
        this.fields.push(new EntityField(key, name))
        return this
    }
}

class EntityField {
    constructor(public key: string, public name: string) {
    }
}

const aircraft = new EntityDescription<Aircraft>(
    "Aircraft",
    "aircraft",
    "registration"
)
    .field("registration", "Registration")
    .field("model", "Model (ICAO)")

interface Aircraft extends VersionedEntity {
    type: "aircraft"
    registration: string
    model: string
}

type AircraftVersion = number

// interface AircraftPerformance extends VersionedEntity {
//     type: "performance"
//     aircraft: AircraftId
//     powerSettings: WeightPowerSetting[]
// }
//
// interface WeightPowerSetting {
//     weight: number
//     pressureAltitudes: PressureAltitudePowerSettings[]
// }
//
// interface PressureAltitudePowerSettings {
//     pressureAltitude: number
//     powerSettings: PowerSetting[]
// }
//
// interface PowerSetting {
//     powerSetting: number
//     ias: number
//     fuelFlow: number
// }

const aerodrome = new EntityDescription<Aerodrome>(
    "Aerodrome",
    "aerodrome",
    "code"
    )
    .field("code", "Code")

interface Aerodrome extends VersionedEntity {
    type: "aerodrome"
    code: string
}

type AerodromeId = number
type AerodromeVersion = number

interface Trip extends VersionedEntity {
    type: "trip"
    name: string
    aircraft: AircraftVersion | null
}

type TripId = number

interface Flight extends VersionedEntity {
    type: "flight"
    trip: TripId
    from: AerodromeId
    to: AerodromeId
}

interface TripPlan extends VersionedEntity {
    type: "plan"
    trip: TripId
    powerSetting: string | null
    ias: number | null
    tas: number | null
    fuelFlow: number | null
    variation: number | null // TODO input
    fuelContingency: number | null // TODO input
    finalReserve: Duration | null // TODO input
    preTakeoffFuel: number | null // TODO input
    postLandingFuel: number | null // TODO input
    preTakeoffTime: Duration | null // TODO input
    circuitTime:  Duration | null // TODO input
    postLandingTime:  Duration | null // TODO input
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

interface Tombstone extends VersionedEntity {
    type: "tombstone"
}

interface Date {
    y: number,
    m: number,
    d: number
}

type Duration = number
type Time = number

interface LogbookEntry extends VersionedEntity {
    type: "logbook-entry"
    page: number
    line: number
    date: Date | null
    from: AerodromeVersion | null
    to: AerodromeVersion | null
    departure: Time | null
    arrival: Time | null
    aircraft: AircraftVersion | null
    landings: number | null
    pic: Duration | null
    dual: Duration | null
    trip: TripId | null
}


function formatHHMM(seconds: number | null): string {
    if (seconds == null) {
        return ""
    } else {
        let mins = Math.round(seconds / 60)
        let h = Math.floor(mins / 60)
        let m = mins - h * 60

        let hh = h < 10 ? '0' + h : h
        let mm = m < 10 ? '0' + m : m

        return hh + ":" + mm
    }
}

function formatMMSS(seconds: number | null): string {
    if (seconds == null) {
        return ""
    } else {
        let secs = Math.round(seconds)
        let m = Math.floor(secs / 60)
        let s = secs - m * 60

        let mm = m < 10 ? '0' + m : m
        let ss = s < 10 ? '0' + s : s

        return mm + ":" + ss
    }
}

function formatDate(date: Date | null): string {
    if (date == null) {
        return ""
    } else {
        let dd = date.d < 10 ? '0' + date.d : date.d
        let mm = date.m < 10 ? '0' + date.m : date.m
        let yy = date.y < 10 ? '0' + date.y : date.y

        return dd + "/" + mm + "/" + yy
    }
}

type Component = (elem: HTMLElement) => Subscription

function sub(val: View<Component>): Component {
    return (elem) => {
        let elemSub = val.get()(elem)
        let valSub = val.subscribe(v => {
            elemSub()
            elemSub = v(elem)
        });
        return () => {
            elemSub()
            valSub()
        }
    }
}

function arr(components: Component[]): Component {
    return (elem) => {
        let subs = []
        for (let component of components) {
            subs.push(component(elem))
        }
        return () => {
            for (let sub of subs) {
                sub()
            }
        }
    }
}

function factory(fn: () => Component): Component {
    return (elem) => {
        let comp = fn()
        return comp(elem)
    }
}

function textInput(...mods: Component[]): Component {
    return input(type("text"), ...mods)
}

function numberInput(val: Value<number | null>, min: number | null = null, max: number | null = null): Component {
    return conversionInput(val, (n) => n.toString(), (txt) => {
        let num = Number.parseFloat(txt);
        if(!isNaN(num) && !(min != null && num < min) && !(max != null && num > max)) {
            return num
        } else {
            return null
        }
    })
}

function timeInputMMSS(val: Value<Duration | Time | null>): Component {
    return conversionInput(val, formatMMSS, (txt) => {
        let mm: number
        let ss: number
        if(txt.length == 4) {
            mm = parseInt(txt.substring(0, 2));
            ss = parseInt(txt.substring(2, 4));
        } else if(txt.length == 5 && txt[2] == ":") {
            mm = parseInt(txt.substring(0, 2));
            ss = parseInt(txt.substring(3, 5));
        } else {
            return null
        }
        if(!isNaN(mm) && !isNaN(ss)) {
            return mm * 60 + ss
        } else {
            return null
        }
    })
}

function timeInputHHMM(val: Value<Time | Duration | null>): Component {
    return conversionInput(val, formatHHMM, (txt) => {
        let hh: number
        let mm: number
        if(txt.length == 4) {
            hh = parseInt(txt.substring(0, 2));
            mm = parseInt(txt.substring(2, 4));
        } else if(txt.length == 5 && txt[2] == ":") {
            hh = parseInt(txt.substring(0, 2));
            mm = parseInt(txt.substring(3, 5));
        } else {
            return null
        }
        if(!isNaN(hh) && !isNaN(mm)) {
            return (hh * 60 + mm) * 60
        } else {
            return null
        }
    })
}

function dateInput(val: Value<Date | null>): Component {
    return conversionInput(val, formatDate, (txt) => {
        let dd: number
        let mm: number
        let yy: number
        if(txt.length == 6) {
            dd = parseInt(txt.substring(0, 2));
            mm = parseInt(txt.substring(2, 4));
            yy = parseInt(txt.substring(4, 6));
        } else if(txt.length == 8 && txt[2] == "/" && txt[5] == "/") {
            dd = parseInt(txt.substring(0, 2));
            mm = parseInt(txt.substring(3, 5));
            yy = parseInt(txt.substring(6, 8));
        } else {
            return null
        }
        if(!isNaN(dd) && !isNaN(mm) && !isNaN(yy)) {
            return { d: dd, m: mm, y: yy}
        } else {
            return null
        }
    })
}

function aerodromeInput(
    aerodromes: Aerodrome[],
    aerodrome: Value<Aerodrome | null>
): Component {
    return codeBasedInput(
        aerodromes,
        aerodrome,
        (a) => a.code
    )
}

function aircraftInput(
    aircrafts: Aircraft[],
    aircraft: Value<Aircraft | null>
): Component {
    return codeBasedInput(
        aircrafts,
        aircraft,
        (a) => a.registration
    )
}

function codeBasedInput<T>(
    items: T[],
    value: Value<T | null>,
    toCode: (item: T) => string
) {
    return conversionInput(value, toCode, (str: string) => {
        let maybeVal = items
            .filter(a => toCode(a).toLowerCase() === str.toLowerCase())
        if (maybeVal.length > 0) {
            return maybeVal[0];
        } else {
            return null
        }
    })
}

function conversionInput<T>(
    val: Value<T | null>,
    toString: (v: T) => string,
    fromString: (str: string) => T | null
) {
    return factory(() => {
        let v = val.get()
        let text = new Value(v === null? "" : toString(v))

        let doOnBlur = () => {
            let txt = text.get();
            if(txt === "") {
                val.set(null)
            } else {
                let newVal = fromString(txt)
                if(newVal !== null) {
                    val.set(newVal)
                }
            }
            let v = val.get();
            text.set(v === null? "" : toString(v))
        }

        return textInput(value(text), onBlur(doOnBlur))
    })
}

// HTML
function div(...mods: Component[]): Component {
    return tag("div", ...mods)
}

function button(...mods: Component[]): Component {
    return tag("button", ...mods)
}

function h1(...mods: Component[]): Component {
    return tag("h1", ...mods)
}

function span(...mods: Component[]): Component {
    return tag("span", ...mods)
}

function dropdown<T>(value: Value<T>, options: T[], toString: (option: T) => string): Component {
    let opts = options.map(o => {
        let selected = (elem: HTMLOptionElement) => {
            if(value.get() === o) {
                elem.selected = true
            }
            return () => {}
        }
        return tag("option", text(toString(o)), selected)
    })
    let onChange = (elem: HTMLSelectElement) => {
        elem.onchange = () => {
            value.set(options[elem.selectedIndex])
        }
        return () => {
            elem.onchange = null
        }
    }
    return tag("select", onChange, ...opts)
}

function input(...mods: Component[]): Component {
    return tag("input", ...mods)
}

function type(type: string): Component {
    return (elem: HTMLInputElement) => {
        elem.type = type
        return () => {}
    }
}

function canvas(...mods: Component[]): Component {
    return tag("canvas", ...mods)
}

function br(...mods: Component[]): Component {
    return tag("br", ...mods)
}

function tag(tag: string, ...mods: Component[]): Component {
    return (elem) => {
        let div = document.createElement(tag);
        let subs: Subscription[] = []
        mods.forEach(m => subs.push(m(div)))
        elem.append(div)
        return () => {
            subs.forEach(s => s())
            div.remove()
        }
    }
}

function id(id: string): Component {
    return (elem) => {
        elem.id = id
        return () => elem.id = ""
    }
}

function text(text: string): Component {
    return (elem) => {
        // // Remove text elements
        // let child = elem.firstChild
        // while(child != null) {
        //     let next = child.nextSibling
        //     if(child instanceof Text) {
        //         child.remove()
        //     }
        //     child = next
        // }

        let textNode = document.createTextNode(text);
        elem.append(textNode)
        return () => textNode.remove()
    }
}

function clazz(className: string): Component {
    return (elem) => {
        elem.classList.add(className)
        return () => {
            elem.classList.remove(className)
        }
    }
}

function onklick(fn: () => void): Component {
    return (elem) => {
        elem.onclick = fn
        return () => {
            elem.onclick = null
        }
    }
}

function width(width: number): Component {
    return (elem: HTMLCanvasElement) => {
        elem.width = width
        return () => {}
    }
}

function height(height: number): Component {
    return (elem: HTMLCanvasElement) => {
        elem.height = height
        return () => {}
    }
}

function value(val: Value<string>): Component {
    return (elem: HTMLInputElement) => {
        elem.value = val.get()
        let sub = val.subscribe((v) => {
            elem.value = v
        })
        elem.onchange = () => {
            val.set(elem.value)
        }
        return () => {
            sub()
            elem.onchange = null
        }
    }
}

function onBlur(fn: () => void): Component {
    return (elem: HTMLInputElement) => {
        elem.onblur = fn
        return () => {
            elem.onblur = null
        }
    }
}


function googleButton(): Component {
    return (elem: HTMLDivElement) => {
        google.accounts.id.renderButton(elem, { theme: "outline", size: "large" })
        return () => {}
    }
}


// Core
type Subscription = () => void
type Listener<T> = (val: T) => void

interface View<T> {
    get(): T
    subscribe(listener: Listener<T>): Subscription
}

class Value<T> implements View<T> {
    private listeners: Set<Listener<T>> = new Set()

    constructor(private value: T = null) {
    }

    get(): T {
        return this.value;
    }

    set(value: T) {
        this.value = value
        this.listeners.forEach((l: Listener<T>) => l(this.value))
    }

    subscribe(listener: (val: T) => void): Subscription {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }
}

function map<I, O>(view: View<I>, fn: (inp: I) => O): View<O> {
    return new class implements View<O> {
        get(): O {
            return fn(view.get());
        }

        subscribe(listener: Listener<O>): Subscription {
            return view.subscribe((e) => listener(fn(e)));
        }
    }
}

interface VersionedEntity {
    version: number
    type: string
    entity: number
}

interface VersionStreamEngine {
    init(): void
    load(first: number, onEntity: (entity: VersionedEntity) => void, onComplete: () => void): void
    save(entities: VersionedEntity[], onSaved: () => void): void
}

class IndexedDBEngine implements VersionStreamEngine {
    private database: Promise<IDBDatabase>

    constructor(
        private userId: string,
        private onError: (message: string) => void
    ) {
    }

    init() {
        this.database = new Promise<IDBDatabase>((resolve: (db: IDBDatabase) => void, reject: () => void) => {
            let openReq = indexedDB.open("user-" + this.userId, 1);
            openReq.onerror = (ev) => {
                this.onError(openReq.error.message)
            }
            openReq.onupgradeneeded = (ev) => {
                let database = openReq.result
                database.createObjectStore("stream", { keyPath: "version" })
            }
            openReq.onsuccess = (ev) => {
                let database = openReq.result
                database.onerror = (ev) => {
                    this.onError((ev.target as IDBTransaction).error.message)
                }
                database.onabort = (ev) => {
                    this.onError((ev.target as IDBTransaction).error.message)
                }
                resolve(database)
            }
        });
    }

    load(first: number, onEntity: (entity: VersionedEntity) => void, onComplete: () => void) {
        this.database
            .then((db) => {
                let trans = db.transaction("stream");
                let cursorRequest = trans.objectStore("stream")
                    .openCursor(IDBKeyRange.lowerBound(first));
                cursorRequest.onsuccess = () => {
                    let cursor = cursorRequest.result
                    if(cursor) {
                        cursor.continue()
                        onEntity(cursor.value)
                    } else {
                        trans.commit()
                        onComplete()
                    }
                }
            })
    }

    save(entities: VersionedEntity[], onSaved: () => void) {
        this.database
            .then((db) => {
                let trans = db.transaction("stream", "readwrite");
                let obj = trans.objectStore("stream");
                entities.forEach(entity => {
                    obj.add(entity)
                })
                trans.oncomplete = onSaved
                trans.commit()
            })
    }
}

class RemoteEngine implements VersionStreamEngine {
    constructor(
        private baseUrl: string,
        private userId: string,
        private sessionId: string,
    ) {
    }
    init(): void {
    }

    load(first: number, onEntity: (entity: VersionedEntity) => void, onComplete: () => void): void {
        window.fetch(this.baseUrl + "/users/" + this.userId + "/stream?start=" + first, {
            method: "GET",
            headers: {
                "authorization": "Bearer " + this.sessionId,
            },
        }).then( resp => {
            if(!resp.ok) {
                throw "Loading failed"
            }
            return resp.json()
            // TODO error handling in all window.fetch places
        }).then(json => {
            let entities = json as VersionedEntity[]
            entities.forEach(entity => {
                onEntity(entity)
            })
            onComplete()
        })
    }

    save(entities: VersionedEntity[], onSaved: () => void): void {
        window.fetch(this.baseUrl + "/users/" + this.userId + "/stream", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "authorization": "Bearer " + this.sessionId,
            },
            body: JSON.stringify(entities)
        }).then( resp => {
            if(!resp.ok) {
                throw "Saving failed"
            }
            onSaved()
            // TODO error handling in all window.fetch places
        })
    }
}

interface VersionStream {
    init(): void
    load(first: number, onEntity: (entity: VersionedEntity) => void, onComplete: () => void): void
    save(entities: VersionedEntity[], onSaved: () => void): void
}

class BufferingVersionStream implements VersionStream {
    private saving = false
    private buffer: { entities: VersionedEntity[], onSaved: () => void }[] = []

    constructor(
        private engine: VersionStreamEngine
    ) {
    }

    init() {
        this.engine.init()
    }

    load(first: number, onEntity: (entity: VersionedEntity) => void, onComplete: () => void) {
        this.engine.load(first, onEntity, onComplete)
    }

    save(entities: VersionedEntity[], onSaved: () => void) {
        this.buffer.push({ entities: entities, onSaved: onSaved })
        this.tick()
    }

    busy(): boolean {
        return this.saving
    }

    private tick() {
        let buf = this.buffer;
        if(!this.saving && buf.length != 0) {
            this.saving = true
            this.buffer = []
            let flattened = buf.flatMap(e => e.entities);
            this.engine.save(flattened, () => {
                this.saving = false
                this.tick()
                buf.forEach((p) => {
                    p.onSaved()
                });
            })
        }
    }
}

class ReadOnlyVersionStream implements VersionStream {
    constructor(
        private engine: VersionStreamEngine,
        private onError: (message: string) => void
    ) {
    }

    init(): void {
        this.engine.init()
    }

    load(first: number, onEntity: (entity: VersionedEntity) => void, onComplete: () => void): void {
        this.engine.load(first, onEntity, onComplete)
    }

    save(entities: VersionedEntity[], onSaved: () => void): void {
        this.onError("Can not save in read-only mode")
    }
}

class LocalRemoteVersionStream implements VersionStream {
    constructor(
        private local: VersionStream,
        private remote: VersionStream
    ) {
    }

    init(): void {
        this.local.init()
        this.remote.init()
    }

    /**
     * It will first load locally, and then load the rest remotely.
     */
    load(first: number, onEntity: (entity: VersionedEntity) => void, onComplete: () => void) {
        let nextId = first
        this.local.load(first, (entity) => {
            nextId = entity.entity + 1
            onEntity(entity)
        }, () => {
            this.remote.load(nextId, (entity) => {
                this.local.save([entity], () => {})
                onEntity(entity)
            }, () => {
                onComplete()
            })
        })
    }

    save(entities: VersionedEntity[], onSaved: () => void) {
        this.remote.save(entities, () => {
            this.local.save(entities, () => {})
            onSaved()
        })
    }
}

window.onload = () => {
    main()
}