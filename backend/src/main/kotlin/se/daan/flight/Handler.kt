package se.daan.flight

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.readValue
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.slf4j.LoggerFactory
import se.daan.flight.google.GoogleService
import se.daan.flight.pdf.api.Page
import se.daan.flight.pdf.generate
import se.daan.flight.session.SessionRepository
import se.daan.flight.stream.StreamRepository
import se.daan.flight.user.UserRepository

import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import java.time.Instant
import java.util.UUID
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

class Handler : RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {
    private val logger = LoggerFactory.getLogger(Handler::class.java)

    private val objectMapper: ObjectMapper
    private val streamRepository: StreamRepository
    private val userRepository: UserRepository
    private val sessionRepository: SessionRepository
    private val googleService: GoogleService

    init {
        val tableName = System.getenv("FLIGHT_TABLE_NAME")!!
        val googleClientId = System.getenv("FLIGHT_GOOGLE_CLIENT_ID")!!
        val dynamoClient = DynamoDbClient.create()

        objectMapper = ObjectMapper()
            .registerKotlinModule()
        streamRepository = StreamRepository(dynamoClient, tableName, objectMapper)
        userRepository = UserRepository(dynamoClient, tableName)
        sessionRepository = SessionRepository(dynamoClient, tableName)
        googleService = GoogleService(googleClientId)
    }

    @OptIn(ExperimentalEncodingApi::class)
    override fun handleRequest(input: APIGatewayV2HTTPEvent, context: Context): APIGatewayV2HTTPResponse {
        return when (input.routeKey) {
            "POST /ping" ->
                APIGatewayV2HTTPResponse(204, null, null, null, null, false)
            "POST /pdf" -> {
                APIGatewayV2HTTPResponse(204, null, null, null, null, false)
                if(input.isBase64Encoded) {
                    throw UnsupportedOperationException()
                }
                val pages = objectMapper.readValue<List<Page>>(input.body)
                val pdf = generate(pages)

                val base64Body = Base64.encode(pdf)
                val headers = mapOf(
                    "content-type" to "application/pdf"
                )
                APIGatewayV2HTTPResponse(200, headers, null, null, base64Body, true)
            }
            "POST /google-login" -> {
                val loginRequest = objectMapper.readValue<GoogleLoginRequest>(input.body)
                val googleLogin = googleService.googleLogin(loginRequest.bearer)
                if(googleLogin == null) {
                    return resp400()
                }
                val userId = userRepository.getUserIdByGoogleId(googleLogin)
                val sessionId = UUID.randomUUID().toString()
                sessionRepository.upsertSession(sessionId, userId, googleLogin, Instant.now())
                val respJson = objectMapper.writeValueAsString(LoginResponse(sessionId, userId))
                return APIGatewayV2HTTPResponse(200, null, null, null, respJson, false)
            }
            "POST /users" -> {
                logger.info("POST /users")
                logger.info("input.headers[\"Authorization\"] " + input.headers["Authorization"])
                logger.info("input.headers[\"authorization\"] " + input.headers["authorization"])
                val sessionId = getSessionId(input.headers["authorization"])
                if (sessionId == null) {
                    return resp400()
                }
                val session = sessionRepository.getSession(sessionId, Instant.now())
                logger.info("Got session $session")
                if(session == null) {
                    return resp400()
                }
                val userId = UUID.randomUUID().toString()
                userRepository.createUser(userId, session.googleId)
                sessionRepository.upsertSession(sessionId, userId, session.googleId, Instant.now())
                APIGatewayV2HTTPResponse(
                    200,
                    mapOf("content-type" to "application/json"),
                    null,
                    null,
                    objectMapper.writeValueAsString(CreateUserResponse(userId)),
                    false
                )
            }
            "GET /users/{user-id}/stream" -> {
                val start = input.queryStringParameters?.let{ it["start"]}?.toInt() ?: 0
                val userId = input.pathParameters?.get("user-id")!!
                if(!verify(input.headers["authorization"], userId)) {
                    return resp400()
                }
                val stream = streamRepository.fetchAll(userId, start)
                APIGatewayV2HTTPResponse(
                    200,
                    mapOf("content-type" to "application/json"),
                    null,
                    null,
                    objectMapper.writeValueAsString(stream),
                    false
                )
            }
            "POST /users/{user-id}/stream" -> {
                val userId = input.pathParameters?.get("user-id")!!
                if(!verify(input.headers["authorization"], userId)) {
                    return resp400()
                }
                if(input.isBase64Encoded) {
                    throw UnsupportedOperationException()
                }
                val readTree = objectMapper.readTree(input.body)
                if(readTree !is ArrayNode) {
                    return resp400()
                }
                if(readTree.size() == 0) {
                    return APIGatewayV2HTTPResponse(200, null, null, null, null, false)
                }

                val expectedVersion = (streamRepository.fetchLastVersion(userId)?:-1) + 1
                readTree.asSequence().zip(generateSequence(expectedVersion, Int::inc))
                    .forEach { (node, exp) ->
                        if(node !is ObjectNode) {
                            return resp400()
                        }
                        val version = node.get("version")
                        if(version !is IntNode) {
                            return resp400()
                        }
                        val versionInt = version.intValue()
                        if(versionInt != exp) {
                            return APIGatewayV2HTTPResponse(409, null, null, null, null, false)
                        }
                    }

                streamRepository.save(userId, readTree)
                APIGatewayV2HTTPResponse(200, null, null, null, null, false)
            }
            else -> if(input.requestContext.http.method == "OPTIONS") {
                return APIGatewayV2HTTPResponse(204, null, null, null, null, false)
            } else {
                throw IllegalArgumentException()
            }
        }
    }

    private fun resp400(): APIGatewayV2HTTPResponse = APIGatewayV2HTTPResponse(400, null, null, null, null, false)

    private fun verify(authenticationHeader: String?, userId: String): Boolean {
        val sessionId = getSessionId(authenticationHeader)
        if(sessionId == null) {
            return false
        }
        val session = sessionRepository.getSession(sessionId, Instant.now())

        return session?.userId == userId
    }

    private fun getSessionId(authenticationHeader: String?): String? {
        if(authenticationHeader == null || !authenticationHeader.startsWith("Bearer ")) {
            return null
        }
        return authenticationHeader.removePrefix("Bearer ")
    }
}