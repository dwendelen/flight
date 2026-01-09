class LogbookPage implements Page {
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
    landingsDay: Value<number | null>
    landingsNight: Value<number | null>
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
            this.landingsDay = new Value(null)
            this.landingsNight = new Value(null)
            this.pic = new Value(null)
            this.dual = new Value(null)
        } else {
            this.date = new Value(entry.date)
            this.from = new Value(entry.from === null? null: this.entityRepo.getByVersion<Aerodrome>(entry.from))
            this.to = new Value(entry.to === null? null: this.entityRepo.getByVersion<Aerodrome>(entry.to))
            this.departure = new Value(entry.departure)
            this.arrival = new Value(entry.arrival)
            this.aircraft = new Value(entry.aircraft === null? null: this.entityRepo.getByVersion<Aircraft>(entry.aircraft))
            this.landingsDay = new Value(entry.landings)
            this.landingsNight = new Value(entry.landingsNight)
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
            landings: this.landingsDay.get(),
            landingsNight: this.landingsNight.get(),
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

    landingsDayThisPage(currentPage: number): Duration {
        return this.pages[currentPage]
            .map(e => e == null? null: e.landings)
            .map(l => l === null? 0: l)
            .reduce((a, b) => a + b, 0)
    }

    landingsNightThisPage(currentPage: number): Duration {
        return this.pages[currentPage]
            .map(e => e == null? null: e.landingsNight)
            .map(l => l === null || typeof l === "undefined" ? 0: l)
            .reduce((a, b) => a + b, 0)
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

    landingsDayPreviousPage(currentPage: number): Duration {
        if(currentPage == 0) {
            return 0
        } else {
            return this.landingsDayGrandTotal(currentPage - 1)
        }
    }

    landingsNightPreviousPage(currentPage: number): Duration {
        if(currentPage == 0) {
            return 0
        } else {
            return this.landingsNightGrandTotal(currentPage - 1)
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

    landingsDayGrandTotal(currentPage: number): Duration {
        return this.landingsDayThisPage(currentPage)
            + this.landingsDayPreviousPage(currentPage)
    }

    landingsNightGrandTotal(currentPage: number): Duration {
        return this.landingsNightThisPage(currentPage)
            + this.landingsNightPreviousPage(currentPage)
    }

    picTimeGrandTotal(currentPage: number): Duration {
        return this.picTimeThisPage(currentPage)
            + this.picTimePreviousPage(currentPage)
    }

    dualTimeGrandTotal(currentPage: number): Duration {
        return this.dualTimeThisPage(currentPage)
            + this.dualTimePreviousPage(currentPage)
    }

    getComponent(): Component {
        return logbook(this)
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
                        div(clazz("landings-day"), numberInput(logbookPage.landingsDay)),
                        div(clazz("landings-night"), numberInput(logbookPage.landingsNight)),
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
                            div(clazz("landings-day")),
                            div(clazz("landings-night")),
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
                            div(clazz("landings-day"), text(entry.landings == null? "": entry.landings.toString())),
                            div(clazz("landings-night"), text(entry.landingsNight == null? "": entry.landingsNight.toString())),
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
                div(clazz("landings-day-header"), text("Day")),
                div(clazz("landings-night-header"), text("Night")),
                div(clazz("pic-time-header"), text("PIC")),
                div(clazz("dual-time-header"), text("Dual")),
                ...lines,
                div(clazz("total-this-blank")),
                div(clazz("total-this-header"), text("Total This Page")),
                div(clazz("total-this-total-time"), text(formatHHMM(logbookPage.totalTimeThisPage(currentPage)))),
                div(clazz("total-this-landings-day"), text(logbookPage.landingsDayThisPage(currentPage).toString())),
                div(clazz("total-this-landings-night"), text(logbookPage.landingsNightThisPage(currentPage).toString())),
                div(clazz("total-this-pic-time"), text(formatHHMM(logbookPage.picTimeThisPage(currentPage)))),
                div(clazz("total-this-dual-time"), text(formatHHMM(logbookPage.dualTimeThisPage(currentPage)))),
                div(clazz("action")),
                div(clazz("total-prev-blank")),
                div(clazz("total-prev-header"), text("Total From Previous Pages")),
                div(clazz("total-prev-total-time"), text(formatHHMM(logbookPage.totalTimePreviousPage(currentPage)))),
                div(clazz("total-prev-landings-day"), text(logbookPage.landingsDayPreviousPage(currentPage).toString())),
                div(clazz("total-prev-landings-night"), text(logbookPage.landingsNightPreviousPage(currentPage).toString())),
                div(clazz("total-prev-pic-time"), text(formatHHMM(logbookPage.picTimePreviousPage(currentPage)))),
                div(clazz("total-prev-dual-time"), text(formatHHMM(logbookPage.dualTimePreviousPage(currentPage)))),
                div(clazz("action")),
                div(clazz("total-grand-blank")),
                div(clazz("total-grand-header"), text("Total Time")),
                div(clazz("total-grand-total-time"), text(formatHHMM(logbookPage.totalTimeGrandTotal(currentPage)))),
                div(clazz("total-grand-landings-day"), text(logbookPage.landingsDayGrandTotal(currentPage).toString())),
                div(clazz("total-grand-landings-night"), text(logbookPage.landingsNightGrandTotal(currentPage).toString())),
                div(clazz("total-grand-pic-time"), text(formatHHMM(logbookPage.picTimeGrandTotal(currentPage)))),
                div(clazz("total-grand-dual-time"), text(formatHHMM(logbookPage.dualTimeGrandTotal(currentPage)))),
                div(clazz("action")),
            ),
            div(clazz("pages"), ...pages),
        ])
    }))
}