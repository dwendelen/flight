package se.daan.flight.user

import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest

class UserRepository(
    private val dynamoClient: DynamoDbClient,
    private val tableName: String,
) {
    fun createUser(userId: String, googleId: String) {
        dynamoClient.putItem(PutItemRequest.builder()
            .tableName(tableName)
            .item(mapOf(
                "pk" to AttributeValue.fromS("google-$googleId"),
                "sk" to AttributeValue.fromS(" "),
                "user-id" to AttributeValue.fromS(userId)
            ))
            .conditionExpression("attribute_not_exists(pk)")
            .build())
    }

    fun getUserIdByGoogleId(googleId: String): String? {
        val response = dynamoClient.getItem(
            GetItemRequest.builder()
                .tableName(tableName)
                .key(
                    mapOf(
                        "pk" to AttributeValue.fromS("google-$googleId"),
                        "sk" to AttributeValue.fromS(" "),
                    )
                )
                .build()
        )
        return if(response.hasItem()) {
            response.item()["user-id"]!!.s()
        } else {
            null
        }
    }
}