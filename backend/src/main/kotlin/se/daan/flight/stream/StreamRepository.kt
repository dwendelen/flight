package se.daan.flight.stream

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.*
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.*
import java.math.BigDecimal

class StreamRepository(
    private val dynamoClient: DynamoDbClient,
    private val tableName: String,
    private val objectMapper: ObjectMapper
) {
    fun fetchAll(userId: String, start: Int): ArrayNode {
        val items = dynamoClient.queryPaginator(
            QueryRequest.builder()
                .tableName(tableName)
                .keyConditionExpression("pk = :pk AND sk >= :sk")
                .expressionAttributeValues(
                    mapOf(
                        ":pk" to AttributeValue.fromS("stream-$userId"),
                        ":sk" to AttributeValue.fromS(sortableInt(start))
                    )
                )
                .limit(1)
                // We want consistent because if events are coming in quickly, it must not fail
                .consistentRead(true)
                .build()
        ).items().map { item ->
            val item2 = item.toMutableMap()
            val sk = item2["sk"]!!
            item2.remove("pk")
            item2.remove("sk")
            item2["version"] = AttributeValue.fromN(sk.s().drop(1))
            map(item2)
        }
        val arrayNode = objectMapper.createArrayNode()
        arrayNode.addAll(items)
        return arrayNode
    }

    fun fetchLastVersion(userId: String): Int? {
        val response = dynamoClient.query(
            QueryRequest.builder()
                .tableName(tableName)
                .keyConditionExpression("pk = :pk")
                .expressionAttributeValues(
                    mapOf(
                        ":pk" to AttributeValue.fromS("stream-$userId")
                    )
                )
                .scanIndexForward(false)
                .limit(1)
                // We want consistent because if events are coming in quickly, it must not fail
                .consistentRead(true)
                .build()
        )
        return response.items()
            .firstOrNull()?.let {
                it["sk"]!!.s().drop(1).toInt()
            }
    }

    fun save(userId: String, arrayNode: ArrayNode) {
        val items = arrayNode.map { obj ->
            val version = (obj as ObjectNode).get("version")
            val versionInt = (version as IntNode).intValue()

            TransactWriteItem.builder()
                .put(
                    Put.builder()
                        .tableName(tableName)
                        .item(map(obj) - "version" + ("pk" to AttributeValue.fromS("stream-$userId")) + ("sk" to AttributeValue.fromS(sortableInt(versionInt))))
                        .conditionExpression("attribute_not_exists(pk)")
                        .build()
                )
                .build()
        }
        dynamoClient.transactWriteItems(TransactWriteItemsRequest.builder()
            .transactItems(items)
            .build()
        )
    }

    private fun map(jsonNode: JsonNode): AttributeValue {
        return when(jsonNode) {
            is NullNode -> {
                AttributeValue.fromNul(true)
            }
            is BooleanNode -> {
                AttributeValue.fromBool(jsonNode.booleanValue())
            }
            is NumericNode -> {
                AttributeValue.fromN(jsonNode.numberValue().toString())
            }
            is TextNode -> {
                AttributeValue.fromS(jsonNode.textValue())
            }
            is ArrayNode -> {
                AttributeValue.fromL(jsonNode.map { map(it) })
            }
            is ObjectNode -> {
                AttributeValue.fromM(map(jsonNode))
            }
            else -> throw UnsupportedOperationException()
        }
    }

    private fun map(objectNode: ObjectNode): Map<String, AttributeValue> {
        return objectNode.properties().associate { (k, v) ->
            k to map(v)
        }
    }

    private fun map(attr: AttributeValue): JsonNode {
        return when(attr.type()) {
            AttributeValue.Type.NUL ->
                objectMapper.nullNode()
            AttributeValue.Type.BOOL ->
                if(attr.bool()) {
                    BooleanNode.TRUE
                } else {
                    BooleanNode.TRUE
                }
            AttributeValue.Type.N ->
                DecimalNode(BigDecimal(attr.n()))
            AttributeValue.Type.S ->
                TextNode(attr.s())
            AttributeValue.Type.L -> {
                val array = objectMapper.createArrayNode()
                val items = attr.l().map { map(it) }
                array.addAll(items)
                array
            }
            AttributeValue.Type.M ->
                map(attr.m())
            else -> throw UnsupportedOperationException()
        }
    }

    private fun map(objects: Map<String, AttributeValue>): ObjectNode {
        val objectNode = objectMapper.createObjectNode()
        val objects = objects.map { (k, v) ->
            k to map(v)
        }.toMap()
        objectNode.setAll<JsonNode>(objects)
        return objectNode
    }

    private fun sortableInt(int: Int): String {
        val asString = int.toString()
        val prefix = ('a'.code + asString.length).toChar()
        return prefix + asString
    }
}