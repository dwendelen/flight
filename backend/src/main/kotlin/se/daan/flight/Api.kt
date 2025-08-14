package se.daan.flight

data class GoogleLoginRequest(
    val bearer: String
)

data class LoginResponse(
    val sessionId: String
)