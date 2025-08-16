package se.daan.flight.tools

import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest
import software.amazon.awssdk.services.dynamodb.model.ScanRequest

fun main() {
    val dynamoClient = DynamoDbClient
        .builder()
        .region(Region.EU_CENTRAL_1)
        .build()

    val prdItems = scan(dynamoClient, "flight-prd")
    val devItems = scan(dynamoClient, "flight-dev")

    println("dev: ${devItems.size}")
    println("prd: ${prdItems.size}")

    zip(devItems, prdItems)
        .forEach { (k, v) ->
            val (d, p) = v
            if(d != null && p == null) {
                println("Deleting ${k.first} ${k.second}")
                dynamoClient.deleteItem(
                    DeleteItemRequest.builder()
                        .tableName("flight-dev")
                        .key(mapOf("pk" to k.first, "sk" to k.second))
                        .build()
                )
            } else if(p != null && p != d) {
                println("Upserting ${k.first} ${k.second}")
                dynamoClient.putItem(
                    PutItemRequest.builder()
                        .tableName("flight-dev")
                        .item(p)
                        .build()
                )
            }
        }
}

private fun scan(dynamoClient: DynamoDbClient, table: String): Map<Pair<AttributeValue, AttributeValue>, Map<String, AttributeValue>> {
    val items = mutableListOf<Map<String, AttributeValue>>()
    var lastKeyEvaluated: Map<String, AttributeValue>? = null
    do {
        val result = dynamoClient.scan(
            ScanRequest.builder()
                .tableName(table)
                .exclusiveStartKey(lastKeyEvaluated)
                .build()
        )
        items.addAll(result.items())
        lastKeyEvaluated = result.lastEvaluatedKey()
    } while(lastKeyEvaluated?.isNotEmpty() == true)

    return items
        .associateBy { (it["pk"]!! to it["sk"]!!) }
}

private fun <K, A, B> zip(map1: Map<K, A>, map2: Map<K, B>): Map<K, Pair<A?, B?>> {
    return map1.keys.union(map2.keys)
        .associateWith { (map1[it] to map2[it]) }
}