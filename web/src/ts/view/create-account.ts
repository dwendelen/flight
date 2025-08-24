class CreateAccountPage implements Page {
    constructor(
        private application: Application,
        private sessionId: string,
        private baseUrl: string
    ) {
    }

    createAccount() {
        window.fetch(this.baseUrl + "/users", {
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

interface CreateUserResponse {
    userId: string,
}
