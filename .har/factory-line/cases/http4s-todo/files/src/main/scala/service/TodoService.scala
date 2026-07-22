package service

import cats.effect.IO
import org.http4s.dsl.Http4sDsl
import org.http4s.HttpRoutes
import repository.TodoRepository

class TodoService(repository: TodoRepository) extends Http4sDsl[IO] {
  val routes = HttpRoutes.of[IO] {
    case GET -> Root / "todos" =>
      Ok()

    case GET -> Root / "todos" / LongVar(id) =>
      Ok()

    case req @ POST -> Root / "todos" =>
      Created()

    case req @ PUT -> Root / "todos" / LongVar(id) =>
      Ok()

    case DELETE -> Root / "todos" / LongVar(id) =>
      NoContent()
  }
}
