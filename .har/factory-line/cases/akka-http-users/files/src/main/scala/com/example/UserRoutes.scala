package com.example

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Route
import akka.actor.typed.ActorRef
import akka.actor.typed.ActorSystem

import scala.concurrent.Future

class UserRoutes(userRegistry: ActorRef[Any])(implicit val system: ActorSystem[_]) {
  def getUsers(): Future[String] = Future.successful("[]")
  def getUser(name: String): Future[String] = Future.successful(name)
  def createUser(user: String): Future[String] = Future.successful(user)
  def deleteUser(name: String): Future[String] = Future.successful(name)

  val userRoutes: Route =
    pathPrefix("users") {
      concat(
        pathEnd {
          concat(
            get {
              complete(getUsers())
            },
            post {
              entity(as[String]) { user =>
                onSuccess(createUser(user)) { performed =>
                  complete((StatusCodes.Created, performed))
                }
              }
            })
        },
        path(Segment) { name =>
          concat(
            get {
              onSuccess(getUser(name)) { response =>
                complete(response)
              }
            },
            delete {
              onSuccess(deleteUser(name)) { performed =>
                complete((StatusCodes.OK, performed))
              }
            })
        })
    }
}
