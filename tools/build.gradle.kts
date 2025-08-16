plugins {
    alias(libs.plugins.kotlinJvm)
}

dependencies {
    implementation(project(":backend"))

    implementation(platform(libs.aws.bom))
    implementation(libs.aws.dynamodb)
    implementation(libs.aws.sso)
}

tasks.test {
    useJUnitPlatform()
}

repositories {
    mavenCentral()
}
