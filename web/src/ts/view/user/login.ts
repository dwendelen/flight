interface GoogleLoginRequest {
    bearer: string
}

interface LoginResponse {
    sessionId: string
    userId: string | null
}

class LoginPage implements Page {
    constructor(
        private application: Application,
        private baseUrl: string,
    ) {
    }
    private onGoogleLogin(token: string) {
        this.application.openLoadingPage()

        let googleLoginRequest: GoogleLoginRequest = {
            bearer: token
        }
        window.fetch(this.baseUrl + "/google-login", {
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
                this.application.openCreateAccountPage(sessionId)
            } else {
                this.application.loggedIn(loginResponse.userId, sessionId);
            }
        })
    }

    getComponent(): Component {
        return div(googleButton((token: string) => this.onGoogleLogin(token)))
    }
}
