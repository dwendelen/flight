plugins {
    alias(libs.plugins.kotlinJvm)
}

group = "se.daan"
version = "1.0.0"

dependencies {
    implementation(platform(libs.aws.bom))
    implementation(libs.logback)
    implementation(libs.aws.dynamodb)
    implementation("com.amazonaws:aws-lambda-java-core:1.4.0")
    implementation("com.amazonaws:aws-lambda-java-events:3.16.1")
    implementation(libs.jackson.databind)
    implementation(libs.jackson.kotlin)
    implementation(libs.pdfbox)
    // TODO in libs
    implementation("com.google.api-client:google-api-client:2.9.0")


    testImplementation(libs.junit.jupiter)
    testImplementation(libs.assertj)
    testImplementation(libs.kotlin.test.junit)
    testImplementation(libs.testcontainers.core)
    testImplementation(libs.testcontainers.junit)
}

tasks.test {
    useJUnitPlatform()
}
