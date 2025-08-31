
class TripPage implements Page {
    name: Value<string>
    powerSetting: Value<string | null>
    ias: Value<number | null>
    tas: Value<number | null>
    fuelFlow: Value<number | null>
    firstStop: Value<StopElement | null>
    aerodromes: Aerodrome[]

    private tripPlan: TripPlan | null

    constructor(
        private baseUrl: string,
        private entityRepo: EntityRepo,
        private trip: Trip | null
    ) {
        this.aerodromes = entityRepo.getAllOfType("aerodrome")

        if(trip == null) {
            this.name = new Value("New Trip")
            this.tripPlan = null
        } else {
            this.name = new Value(this.trip.name)
            let maybePlan = (this.entityRepo.getAllOfType("plan") as TripPlan[])
                .filter((tp: TripPlan) => tp.trip === trip.entity);

            if(maybePlan.length === 0) {
                this.tripPlan = null
            } else {
                this.tripPlan = maybePlan[0]
            }
        }

        let tripPlan = this.tripPlan
        if(this.tripPlan == null) {
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
            fuelContingencyFactor: 1.05, // TODO
            finalReserve: 1800, // TODO
            preTakeoffTime: 720, // TODO
            preTakeoffFuel: 2, // TODO
            postTakeoffTime: 60, // TODO
            preLandingTime: 240, // TODO
            postLandingTime: 360, // TODO
            postLandingFuel: 1, // TODO
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
        let calculated = calculatePlan(tripPlan)
        let pages = printTrip(calculated)
        draw(document.getElementById("test-canvas") as HTMLCanvasElement, pages);
    }

    generatePdf() {
        let tripPlan = this.toTripPlan(-1, -1, -1)
        let calculated = calculatePlan(tripPlan)
        let pages = printTrip(calculated)

        window.fetch(this.baseUrl + "/pdf", {
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

    getComponent(): Component {
        return trip(this)
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
            div(text("Pre-Take-off Time")), div(text("12:00")),
            div(text("Pre-Take-off Fuel")), div(text("2L")),
            div(text("Post-Take-off Time")), div(text("01:00")),
            div(text("Pre-Landing Time")), div(text("04:00")),
            div(text("Post-Landing Time")), div(text("06:00")),
            div(text("Post-Landing Fuel")), div(text("1L")),
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


