function googleButton(onLogin: (token: string) => void): Component {
    return (elem: HTMLDivElement) => {
        google.accounts.id.renderButton(elem, { theme: "outline", size: "large" })
        let sub = googleToken.subscribe(onLogin)
        return () => {
            sub()
        }
    }
}

declare var google: any
declare interface CredentialResponse {
    credential: string // JWT
    select_by: any
}

let googleToken: Value<string | null>

function initGoogle(clientId: string) {
    googleToken = new Value<string | null>(null)
    google.accounts.id.initialize({
        client_id: clientId,
        callback: (cred: CredentialResponse) =>
            googleToken.set(cred.credential)
    });
}
