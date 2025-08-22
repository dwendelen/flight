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












// HTML



function googleButton(): Component {
    return (elem: HTMLDivElement) => {
        google.accounts.id.renderButton(elem, { theme: "outline", size: "large" })
        return () => {}
    }
}


// Core


window.onload = () => {
    main()
}