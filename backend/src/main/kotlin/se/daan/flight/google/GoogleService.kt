package se.daan.flight.google

import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory

class GoogleService(
    private val googleClientId: String
) {
    fun googleLogin(bearer: String): String? {
        val verifier = GoogleIdTokenVerifier.Builder(NetHttpTransport(), GsonFactory())
            .setAudience(listOf(googleClientId))
            .build()

        val verify = verifier.verify(bearer) ?: return null
        val googleId = verify.payload.subject
        return googleId
    }
}