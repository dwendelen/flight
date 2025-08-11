package se.daan.flight

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import se.daan.flight.pdf.api.Page
import se.daan.flight.pdf.generate

import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

class Handler : RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {
    private val objectMapper: ObjectMapper

    init {
        val tableName = System.getenv("FLIGHT_TABLE_NAME")!!
        val dynamoClient = DynamoDbClient.create()
        objectMapper = ObjectMapper()
            .registerKotlinModule()
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
                    "Content-Type" to "application/pdf"
                )
                APIGatewayV2HTTPResponse(200, headers, null, null, base64Body, true)
            }
            else -> throw IllegalArgumentException()
        }
    }
}