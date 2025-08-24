class TripsPage implements Page {
    trips: Trip[]

    constructor(
        private baseUrl: string,
        private entityRepo: EntityRepo,
        private navigator: PageNavigator
    ) {
        this.trips = this.entityRepo.getAllOfType<Trip>("trip")
    }

    openCreatePage() {
        this.navigator.open(new TripPage(this.baseUrl, this.entityRepo, null))
    }

    open(trp: Trip) {
        this.navigator.open(new TripPage(this.baseUrl, this.entityRepo, trp))
    }

    getComponent(): Component {
        return tripsList(this)
    }
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