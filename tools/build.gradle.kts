plugins {
    alias(libs.plugins.kotlinJvm)
}

dependencies {
    api(project(":backend"))
    implementation(libs.aws.sso)
}

tasks.test {
    useJUnitPlatform()
}

repositories {
    mavenCentral()
}
