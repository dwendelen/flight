//tsc --target es2019 flight.ts

function main() {
    let localEngine = new IndexedDBEngine("test", () => {});
    let local = new BufferingVersionStream(localEngine)
    let entityRepo = new EntityRepo(local);
    let application = new Application(entityRepo);

    let body = document.getElementsByTagName("body").item(0);

    sub(application.page)(body)

    application.init()
}

class Application {
    page: Value<Component> = new Value(loading())

    constructor(private entityRepo: EntityRepo) {

    }

    init() {
        this.entityRepo.init(() => {
            this.page.set(mainPage(new MainPage(this.entityRepo)))
        })
    }
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
        return Math.max(-1, ...this.entities
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
}

function mainPage(mainPage: MainPage): Component {
    return arr([
        div(
            clazz("navigation-bar"),
            div(text("Trips"), onklick(() => mainPage.openTrips())),
            div(text("Manage"), onklick(() => mainPage.openManage()))
        ),
        div(
            sub(mainPage.page)
        )
    ])
}

function home(): Component {
    return arr([])
    // return h1(text("Home"))
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
                                return new WaypointElement(leg, new Value(waypoint.name), new Value(waypoint.altitude))
                            }

                            let mapLeg = (idx: number): LegElement => {
                                if(idx >= flight.legs.length) {
                                    return null
                                } else {
                                    let leg = flight.legs[idx]
                                    let waypoint = mapWaypoint(idx + 1)
                                    return new LegElement(
                                            waypoint,
                                            new Value(leg.trueTrack),
                                            new Value(leg.distance),
                                            new Value(leg.windDirection),
                                            new Value(leg.windVelocity),
                                            new Value(leg.altitude),
                                            new Value(leg.msa)
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
                            type: "simple",
                            altitude: waypoint.altitude.get()
                        })
                        visitLeg(waypoint.next)
                    }
                }
                let visitLeg = (leg: LegElement | null) => {
                    if (leg !== null) {
                        legs.push({
                            trueTrack: leg.trueTrack.get(),
                            distance: leg.distance.get(),
                            windDirection: leg.windDirection.get(),
                            windVelocity: leg.windVelocity.get(),
                            altitude: leg.altitude.get(),
                            msa: leg.msa.get()
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
            variation: null, // TODO
            type: "plan",
            entity: planEntity,
            version: tripPlanVersion,
            trip: tripEntity,
            stops: stops,
            flightPlans: flightPlans,
            powerSetting: this.powerSetting.get(),
            ias: this.ias.get(),
            tas: this.tas.get(),
            fuelFlow: this.fuelFlow.get()
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

    calculate() {
        let tripPlan = this.toTripPlan(-1, -1, -1)
        let calculated = calculate(tripPlan)
    }
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

    insertWaypointAfter(flightElement: FlightElement, waypointElement: WaypointElement | null) {
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

    deleteWaypoint(flightElement: FlightElement, waypointElement: WaypointElement) {
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

}

function newWaypointElement(next: LegElement | null): WaypointElement {
    return new WaypointElement(next, new Value("New Waypoint"), new Value(null))
}

function newLegElement(next: WaypointElement): LegElement {
    return new LegElement(
        next,
        new Value(null),
        new Value(null),
        new Value(null),
        new Value(null),
        new Value(null),
        new Value(null)
    )
}

class WaypointElement {
    constructor(
        public readonly next: LegElement | null,
        public readonly name: Value<string>,
        public readonly altitude: Value<number | null> //TODO number
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
        return new WaypointElement(newLeg, this.name, this.altitude)
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
                return new WaypointElement(newLeg, this.name, this.altitude)
            }
        }
    }
}

class LegElement {
    constructor(
        public readonly next: WaypointElement,
        public readonly trueTrack: Value<number | null>, // TODO number
        public readonly distance: Value<number | null>, // TODO number
        public readonly windDirection: Value<number | null>, // TODO number
        public readonly windVelocity: Value<number | null>, // TODO number
        public readonly altitude: Value<number | null>, // TODO number
        public readonly msa: Value<number | null>, // TODO number
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

    private withNext(next: WaypointElement): LegElement {
        return new LegElement(
            next,
            this.trueTrack,
            this.distance,
            this.windDirection,
            this.windVelocity,
            this.altitude,
            this.msa,
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
        div(clazz("calculate-button"), button(text("Calculate"), onklick(() => tripPage.calculate()))),
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
            div(clazz("tt-header"), text("TT")),
            div(clazz("dist-header"), text("Dist")),
            div(clazz("wind-header"), text("Wind")),
            div(clazz("alt-header"), text("Alt")),
            div(clazz("msa-header"), text("MSA")),
            div(clazz("action-header")),
            div(clazz("action"), button(text("Insert Waypoint"), onklick(() => { tripPage.insertWaypointAfter(flightElement, null) }))),
            ...renderWaypointElement(tripPage, flightElement, firstWaypoint)
        )
    }
}

function renderWaypointElement(
    tripPage: TripPage,
    flightElement: FlightElement,
    waypointElement: WaypointElement
): Component[] {
    return [
        div(clazz("wp-name"), textInput(value(waypointElement.name))),
        div(clazz("wp-alt"), numberInput(waypointElement.altitude)),
        div(clazz("wp-msa")),
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
            div(clazz("leg-tt"), numberInput(legElement.trueTrack, 0, 360)),
            div(clazz("leg-dist"), numberInput(legElement.distance, 0)),
            div(clazz("leg-wind-dir"), numberInput(legElement.windDirection, 0, 360)),
            div(clazz("leg-wind-vel"), numberInput(legElement.windVelocity, 0)),
            div(clazz("leg-alt"), numberInput(legElement.altitude)),
            div(clazz("leg-msa"), numberInput(legElement.msa)),
            div(clazz("leg-action"), button(text("Insert Waypoint"), onklick(() => { tripPage.insertWaypointAfter(flightElement, waypointElement) }))),
            ...renderWaypointElement(tripPage, flightElement, legElement.next)
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
    alt: number | null
    fuel: number | null
    eta: number | null
}

interface CalculatedLeg {
    mh: number | null
    mt: number | null
    gs: number | null
    alt: number | null
    msa: number | null
    fuel: number | null
    ete: number | null
}

const RADIANS_PER_DEGREE = 2 * Math.PI / 360
const DEGREES_PER_RADIAN = 1 / RADIANS_PER_DEGREE

function calculate(tripPlan: TripPlan): CalculatedTrip {
    let plans: CalculatedPlan[] = tripPlan.flightPlans.map(fp => {
        return {
            waypoints: fp.waypoints.map(wp => {
                return {
                    name: wp.name,
                    alt: wp.altitude,
                    fuel: null,
                    eta: null
                }
            }),
            legs: fp.legs.map(leg => {
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
                let ete: number | null
                if(gs != null && leg.distance != null) {
                    ete = leg.distance / gs
                } else {
                    ete = null
                }
                let fuel: number | null
                if(ete != null && tripPlan.fuelFlow != null) {
                    fuel = tripPlan.fuelFlow * ete
                } else {
                    fuel = null
                }

                return {
                    mh: mh,
                    mt: mt,
                    gs: gs,
                    alt: leg.altitude,
                    msa: leg.msa,
                    fuel: fuel,
                    ete: ete,
                }
            })
        }
    })

    return {
        powerSetting: tripPlan.powerSetting,
        ias: tripPlan.ias,
        plans: plans,
    }
}

function aerodromeInput(
    aerodromes: Aerodrome[],
    aerodrome: Value<Aerodrome | null>
): Component {
    return factory(() => {
        let val = aerodrome.get()
        let text = new Value(val === null? "" : val.code)

        let doOnBlur = () => {
            let txt = text.get();
            if(txt === "") {
                aerodrome.set(null)
            } else {
                let maybeAerodrome = aerodromes
                    .filter(a => a.code.toLowerCase() === txt.toLowerCase())
                if (maybeAerodrome.length > 0) {
                    let newAero = maybeAerodrome[0];
                    aerodrome.set(newAero)
                }
            }
            let val = aerodrome.get();
            text.set(val === null? "" : val.code)
        }

        return textInput(value(text), onBlur(doOnBlur))
    })
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

interface Aircraft extends VersionedEntity {
    type: "aircraft"
    registration: string
}

type AircraftId = number

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
    aircraft: AircraftId | null
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
}

interface Leg  {
    trueTrack: number | null
    distance: number | null
    windDirection: number | null
    windVelocity: number | null
    altitude: number | null
    msa: number | null
}

interface Tombstone extends VersionedEntity {
    type: "tombstone"
}

interface Date {
    y: number,
    m: number,
    d: number
}

interface Duration {
    h: number
    m: number
    s: number
}

interface Time {
    h: number
    m: number
    s: number
}

interface LogbookEntry extends VersionedEntity {
    type: "logbook-entry"
    page: number
    line: number
    date: Date | null
    from: number | null
    to: number | null
    departure: Time | null
    arrival: Time | null
    aircraft: number | null
    landings: number | null
    pic: Duration
    dual: Duration
    flight: number | null
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
    return factory(() => {
        let v = val.get()
        let text = new Value(v === null? "" : v.toString())

        let doOnBlur = () => {
            let txt = text.get();
            if(txt === "") {
                val.set(null)
            } else {
                let num = Number.parseFloat(txt);
                if(!isNaN(num) && !(min != null && num < min) && !(max != null && num > max)) {
                    val.set(num)
                }
            }
            let v = val.get();
            text.set(v === null? "" : v.toString())
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

function input(...mods: Component[]): Component {
    return tag("input", ...mods)
}

function type(type: string): Component {
    return (elem: HTMLInputElement) => {
        elem.type = type
        return () => {}
    }
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
        private name: string,
        private onError: (message: string) => void
    ) {
    }

    init() {
        this.database = new Promise<IDBDatabase>((resolve: (db: IDBDatabase) => void, reject: () => void) => {
            let openReq = indexedDB.open(this.name, 1);
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

main()

