import org.gradle.kotlin.dsl.register

plugins {
    base
}

tasks.register<Exec>("typescript") {
    val inputFile = projectDir.resolve("src").resolve("flight.ts")
    commandLine(
        "tsc",
        "--target", "es2019",
        "--outDir", project.layout.buildDirectory.get(),
        inputFile.toString()
    )
    inputs.file(inputFile)
    outputs.file(project.layout.buildDirectory.file("flight.js"))
}

tasks.register<Copy>("static") {
    from(projectDir.resolve("src"))
    exclude("*.ts")
    into(project.layout.buildDirectory)
}

tasks.getByName("assemble")
    .dependsOn("typescript")
    .dependsOn("static")
