
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

fun registerTerraform(environment: String, autoApprove: Boolean) {
    tasks.register("terraform-$environment", Exec::class) {
        group = "deploy"
        workingDir(projectDir.resolve("src/tf/$environment"))
        if(autoApprove) {
            commandLine("terraform", "apply", "-refresh=false", "--auto-approve")
        } else {
            commandLine("terraform", "apply", "-refresh=false")
        }
        standardInput = System.`in`
        dependsOn(buildAwsZip, buildAwsLibZip, project(":web").tasks.named("assemble"))
    }
    tasks.register("init-terraform-$environment", Exec::class) {
        group = "init"
        workingDir(projectDir.resolve("src/tf/$environment"))
        commandLine("terraform", "init")
        standardInput = System.`in`
    }
    tasks.register("refresh-terraform-$environment", Exec::class) {
        group = "deploy"
        workingDir(projectDir.resolve("src/tf/$environment"))
        commandLine("terraform", "refresh")
        standardInput = System.`in`
    }
}

registerTerraform("dev", true)
//registerTerraform("tst")
registerTerraform("prd", false)
