//tsc --target es2019 flight.ts

interface Config {
    baseUrl: string,
    googleClientId: string
}
declare var config: Config

function main() {
    initGoogle(config.googleClientId)

    let entityRepoFactory = (userId: string, sessionId: string) => {
        let localEngine = new IndexedDBEngine(userId, () => {});
        let local = new BufferingVersionStream(localEngine)
        let remoteEngine = new RemoteEngine(config.baseUrl, userId, sessionId)
        let remote = new BufferingVersionStream(remoteEngine)
        let stream = new LocalRemoteVersionStream(local, remote);
        return new EntityRepo(stream)
    }
    let application = new Application(config.baseUrl, entityRepoFactory);

    let body = document.getElementsByTagName("body").item(0);

    sub(map(application.page, (p: Page) => p.getComponent()))(body)
}

class Application {
    page: Value<Page> = new Value(new LoginPage(this, config.baseUrl))
    entityRepo: EntityRepo

    constructor(
        private baseUrl: string,
        private entityRepoFactory: (userId: string, sessionId: string) => EntityRepo
    ) {

    }

    openLoadingPage() {
        this.page.set(new LoadingPage())
    }

    openCreateAccountPage(sessionId: string) {
        this.page.set(new CreateAccountPage(this, sessionId, this.baseUrl))
    }

    loggedIn(userId: string, sessionId: string) {
        this.entityRepo = this.entityRepoFactory(userId, sessionId)
        this.entityRepo.init(() => {
            this.page.set(new MainPage(this.baseUrl, this.entityRepo))
        })
    }
}

class LoadingPage implements Page {
    getComponent(): Component {
        return text("Loading ...")
    }
}



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

window.onload = () => {
    main()
}
