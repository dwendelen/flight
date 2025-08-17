import org.gradle.kotlin.dsl.register

plugins {
    base
}

tasks.register<Exec>("typescript") {
    val inputDir = fileTree("src/ts")
    val outputFile = project.layout.buildDirectory.file("flight.js")

    commandLine(
        listOf(
            "tsc",
            "--target", "es2019",
            "--outFile", outputFile.get(),
        ) + inputDir.toList<File>()
    )

    inputs.dir(inputDir)
    outputs.file(outputFile)
}

tasks.register<Copy>("static") {
    from(projectDir.resolve("src").resolve("static"))
    into(project.layout.buildDirectory)
}

tasks.getByName("assemble")
    .dependsOn("typescript")
    .dependsOn("static")
