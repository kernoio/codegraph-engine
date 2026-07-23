lazy val akkaHttpVersion = "10.7.0"
lazy val akkaVersion = "2.10.0"

lazy val root = (project in file(".")).
  settings(
    name := "akka-http-users",
    scalaVersion := "3.3.7",
    libraryDependencies ++= Seq(
      "com.typesafe.akka" %% "akka-http" % akkaHttpVersion,
      "com.typesafe.akka" %% "akka-actor-typed" % akkaVersion,
      "com.typesafe.akka" %% "akka-stream" % akkaVersion
    )
  )
