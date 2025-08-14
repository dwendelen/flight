package se.daan.flight

data class GoogleLoginRequest(
    val bearer: String
)

data class LoginResponse(
    val sessionId: String
)

data class CreateUserResponse(
    val userId: String,
)