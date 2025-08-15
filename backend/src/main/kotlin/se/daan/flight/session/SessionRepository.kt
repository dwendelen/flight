package se.daan.flight.session

import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest
import java.time.Instant
import java.time.temporal.ChronoUnit

class SessionRepository(
    private val dynamoClient: DynamoDbClient,
    private val tableName: String,
) {
    fun upsertSession(sessionId: String, userId: String?, googleId: String?, now: Instant) {
        val ttl = now.plus(1, ChronoUnit.DAYS)
        val item = mutableMapOf<String, AttributeValue>(
            "pk" to AttributeValue.fromS("session-$sessionId"),
            "sk" to AttributeValue.fromS(" "),
            "ttl" to AttributeValue.fromN((ttl.toEpochMilli() / 1000L).toString())
        )
        if(userId != null) {
            item += "user-id" to AttributeValue.fromS(userId)
        }
        if(googleId != null) {
            item += "google-id" to AttributeValue.fromS(googleId)
        }
        dynamoClient.putItem(PutItemRequest.builder()
            .tableName(tableName)
            .item(item)
            .conditionExpression("attribute_not_exists(pk)")
            .build())
    }

    fun getSession(sessionId: String, now: Instant): Session? {
        val response = dynamoClient.getItem(
            GetItemRequest.builder()
                .tableName(tableName)
                .key(
                    mapOf(
                        "pk" to AttributeValue.fromS("session-$sessionId"),
                        "sk" to AttributeValue.fromS(" "),
                    )
                )
                .build()
        )
        return if(response.hasItem()) {
            val nowEpoch = now.toEpochMilli() / 1000L
            val ttl = response.item()["ttl"]!!.n().toLong()
            if(nowEpoch > ttl) {
                null
            } else {
                val userId = response.item()["user-id"]?.s()
                val googleId = response.item()["google-id"]?.s()!!
                Session(userId, googleId)
            }
        } else {
            null
        }
    }
}