class MainPage implements Page, PageNavigator {
    page: Value<Page> = new Value(new EmptyPage())

    constructor(
        private baseUrl: string,
        private entityRepo: EntityRepo
    ) {
    }

    openTrips() {
        this.page.set(new TripsPage(this.baseUrl, this.entityRepo, this))
    }

    openManage() {
        this.page.set(new ManagePage(this.entityRepo))
    }

    openLogbook() {
        this.page.set(new LogbookPage(this.entityRepo))
    }

    getComponent(): Component {
        return mainPage(this)
    }

    open(page: Page) {
        this.page.set(page)
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
            sub(map(mainPage.page, (p: Page) => p.getComponent()))
        )
    ])
}

class EmptyPage implements Page {
    getComponent() {
        return arr([])
    }
}
