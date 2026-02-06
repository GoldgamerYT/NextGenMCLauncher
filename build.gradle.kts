plugins {
    id("java")
    id("application")
}

group = "net.gamehost24"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
}

dependencies {
    implementation("dev.3-3:jmccc:3.1.4")
    implementation("dev.3-3:jmccc-mcdownloader:3.1.4")
    implementation("com.google.code.gson:gson:2.10.1")
    implementation("com.formdev:flatlaf:3.2.5")
    implementation("io.javalin:javalin:6.1.3")
    implementation("org.slf4j:slf4j-simple:2.0.7")
    
    // JavaFX
    implementation("org.openjfx:javafx-controls:17.0.9:win")
    implementation("org.openjfx:javafx-web:17.0.9:win")
    implementation("org.openjfx:javafx-swing:17.0.9:win")
    implementation("org.openjfx:javafx-graphics:17.0.9:win")
    implementation("org.openjfx:javafx-base:17.0.9:win")
    implementation("org.openjfx:javafx-media:17.0.9:win")
    
    testImplementation(platform("org.junit:junit-bom:5.10.0"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

application {
    mainClass.set("net.gamehost24.launcher.HeadlessServer")
    applicationDefaultJvmArgs = listOf(
        "--add-opens", "java.base/java.lang=ALL-UNNAMED",
        "--add-opens", "java.base/java.util=ALL-UNNAMED",
        "--add-opens", "java.base/java.lang.reflect=ALL-UNNAMED",
        "--add-opens", "java.base/java.net=ALL-UNNAMED",
        "--add-opens", "java.base/java.nio=ALL-UNNAMED",
        "--add-opens", "java.base/sun.nio.ch=ALL-UNNAMED",
        "--add-opens", "java.base/java.util.concurrent=ALL-UNNAMED"
    )
}

tasks.test {
    useJUnitPlatform()
}

tasks.jar {
    manifest {
        attributes["Main-Class"] = "net.gamehost24.launcher.HeadlessServer"
    }
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
    from(configurations.runtimeClasspath.get().map { if (it.isDirectory) it else zipTree(it) })
    exclude("META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA")
}