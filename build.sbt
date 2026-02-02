ThisBuild / scalaVersion := "3.3.3"

lazy val root = (project in file("."))
  .settings(
    name := "obdd-backend",
    Compile / unmanagedSourceDirectories += baseDirectory.value / "backend" / "src" / "main" / "scala",
    libraryDependencies ++= Seq(
      "org.http4s" %% "http4s-ember-server" % "0.23.30",
      "org.http4s" %% "http4s-dsl"          % "0.23.30",
      "org.http4s" %% "http4s-circe"        % "0.23.30",
      "io.circe"   %% "circe-core"          % "0.14.10",
      "io.circe"   %% "circe-generic"       % "0.14.10",
      "io.circe"   %% "circe-parser"        % "0.14.10"
    )
  )
Compile / run / fork := true
libraryDependencies += "ch.qos.logback" % "logback-classic" % "1.5.16"
