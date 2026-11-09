import java.util.Properties

/* SignalK server URL: kept out of git, set signalk.baseUrl in local.properties (or -Psignalk.baseUrl=...) */
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val signalkBaseUrl: String = (findProperty("signalk.baseUrl") as String?)
    ?: localProps.getProperty("signalk.baseUrl")
    ?: "https://signalk.example.org"

/* Client certificate for access from outside the LAN (mutual TLS), also kept out of git:
   signalk.clientCert = path to the device .p12, signalk.clientCertPassword = its password */
val signalkClientCert: String? = (findProperty("signalk.clientCert") as String?)
    ?: localProps.getProperty("signalk.clientCert")
val signalkClientCertPassword: String = (findProperty("signalk.clientCertPassword") as String?)
    ?: localProps.getProperty("signalk.clientCertPassword")
    ?: ""
val clientCertResDir: File = layout.buildDirectory.dir("generated/clientCert").get().asFile.apply {
    mkdirs()
    val target = File(this, "signalk-client.p12")
    if (signalkClientCert != null) file(signalkClientCert).copyTo(target, overwrite = true) else target.delete()
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "org.leslaborie.chatel.watch"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.leslaborie.chatel.watch"
        minSdk = 30
        targetSdk = 34
        versionCode = 12
        versionName = "2.1"
        buildConfigField("String", "DEFAULT_BASE_URL", "\"$signalkBaseUrl\"")
        buildConfigField("String", "SIGNALK_CLIENT_CERT_PASSWORD", "\"$signalkClientCertPassword\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    sourceSets["main"].resources.srcDir(clientCertResDir)

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.03")
    implementation(composeBom)

    // Compose for Wear OS
    implementation("androidx.wear.compose:compose-material:1.4.0")
    implementation("androidx.wear.compose:compose-foundation:1.4.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")

    // Wear OS Tiles
    implementation("androidx.wear.tiles:tiles:1.4.0")
    implementation("androidx.wear.protolayout:protolayout:1.2.0")

    // Complications de cadran (marée / vent)
    implementation("androidx.wear.watchface:watchface-complications-data-source-ktx:1.2.1")

    // Network
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Preferences
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Coroutines (guava bridge for TileService ListenableFuture)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-guava:1.8.1")
}
