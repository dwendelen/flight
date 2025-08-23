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

    sub(map(application.page, (p: Page) => p.getComponent()))(body)

    application.init()
}

class Application {
    page: Value<Page> = new Value(new LoadingPage())
    entityRepo: EntityRepo

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
        this.page.set(new LoginPage())
    }

    onGoogleLogin(cred: CredentialResponse) {
        this.page.set(new LoadingPage())
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
            let sessionId = loginResponse.sessionId
            if(loginResponse.userId == null) {
                this.page.set(new CreateAccountPage(this, sessionId))
            } else {
                this.loggedIn(loginResponse.userId, sessionId);
            }
        })
    }

    openLoadingPage() {
        this.page.set(new LoadingPage())
    }

    loggedIn(userId: string, sessionId: string) {
        this.entityRepo = this.entityRepoFactory(userId, sessionId)
        this.entityRepo.init(() => {
            this.page.set(new MainPage(this.entityRepo))
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

class LoadingPage implements Page {
    getComponent(): Component {
        return text("Loading ...")
    }
}

class LoginPage implements Page {
    getComponent(): Component {
        return div(googleButton())
    }
}

class CreateAccountPage implements Page {
    constructor(
        private application: Application,
        private sessionId: string
    ) {
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
            this.application.loggedIn(createUserResponse.userId, this.sessionId);
        })
        this.application.openLoadingPage()
    }

    getComponent(): Component {
        return div(
            text("No account detected."),
            button(text("Create account"), onklick(() => this.createAccount()))
        )
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