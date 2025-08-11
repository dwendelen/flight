
val buildAwsLibZip = tasks.register("buildAwsLibZip", Zip::class) {
    destinationDirectory = layout.buildDirectory.dir("layers")
    archiveFileName.set("flight-lib.zip")
    into("java/lib") {
        from(project(":backend").configurations.getByName("runtimeClasspath"))
    }
}

val buildAwsZip = tasks.register("buildAwsZip", Zip::class) {
    destinationDirectory = layout.buildDirectory.dir("layers")
    archiveFileName.set("flight.zip")
    into("lib") {
        from(project(":backend").tasks.getByName("jar"))
    }
}

fun registerTerraform(environment: String) {
    tasks.register("terraform-$environment", Exec::class) {
        group = "deploy"
        workingDir(projectDir.resolve("src/tf/$environment"))
        commandLine("terraform", "apply", "-refresh=false")
        standardInput = System.`in`
        dependsOn(buildAwsZip, buildAwsLibZip, project(":web").tasks.named("assemble"))
    }
}

registerTerraform("dev",)
//registerTerraform("tst")
//registerTerraform("prd")
