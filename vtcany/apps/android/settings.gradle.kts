pluginManagement {
    repositories {
        // Kho Maven local (build offline trên VM): ưu tiên trước.
        maven { url = uri("file:///home/hatch/workspace/maven-repo") }
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven { url = uri("file:///home/hatch/workspace/maven-repo") }
        google()
        mavenCentral()
    }
}
rootProject.name = "VTC ANY"
include(":app")
