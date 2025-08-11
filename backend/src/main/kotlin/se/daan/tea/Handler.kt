package se.daan.tea

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString

import software.amazon.awssdk.services.dynamodb.DynamoDbClient

class Handler : RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {

    init {
        val tableName = System.getenv("FLIGHT_TABLE_NAME")!!
        val dynamoClient = DynamoDbClient.create()
    }

    override fun handleRequest(input: APIGatewayV2HTTPEvent, context: Context): APIGatewayV2HTTPResponse {
        return when (input.routeKey) {
            "POST /ping" ->
                APIGatewayV2HTTPResponse(204, null, null, null, null, false)
            "POST /pdf" -> {
                APIGatewayV2HTTPResponse(204, null, null, null, null, false)
//                if(input.isBase64Encoded) {
//                    throw UnsupportedOperationException()
//                }
//                val entity = Json.decodeFromString<VersionedEntity>(input.body)
//                val expectedVersion = (repository.fetchLastVersion()?:-1) + 1
//                if(entity.version != expectedVersion) {
//                    APIGatewayV2HTTPResponse(409, null, null, null, null, false)
//                } else {
//                    repository.append(entity)
//                    APIGatewayV2HTTPResponse(204, null, null, null, null, false)
//                }
            }
            else -> throw IllegalArgumentException()
        }
    }
}