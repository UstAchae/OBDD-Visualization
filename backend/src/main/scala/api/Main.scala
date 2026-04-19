// backend/src/main/scala/api/Main.scala
import cats.effect._
import cats.syntax.all._
import com.comcast.ip4s._
import fs2.io.file.Path
import org.http4s._
import org.http4s.dsl.io._
import org.http4s.ember.server._
import org.http4s.server.Router
import org.http4s.server.staticcontent._

object Main extends IOApp.Simple {

  // Serve files from: <project-root>/frontend by default, or a custom path in deployment.
  private val frontendPath: String = sys.env.getOrElse("STATIC_DIR", "frontend")
  private val frontendDir: Path = Path(frontendPath)
  private val host: Host = Host.fromString(sys.env.getOrElse("HOST", "0.0.0.0")).getOrElse(ipv4"0.0.0.0")
  private val port: Port = Port.fromInt(
    sys.env.get("PORT").flatMap(_.toIntOption).getOrElse(8080)
  ).getOrElse(port"8080")

  // 1) GET / -> frontend/index.html
  private val indexRoute: HttpRoutes[IO] = HttpRoutes.of[IO] {
    case req @ GET -> Root =>
      StaticFile
        .fromPath(frontendDir / "index.html", Some(req))
        .getOrElseF(NotFound())
  }

  // 2) GET /styles.css, /app.js, etc.
  private val staticFiles: HttpRoutes[IO] =
    fileService[IO](FileService.Config(systemPath = frontendPath))

  // 3) API routes (http4s handlers in ApiRoutes)
  private val api: HttpRoutes[IO] = ApiRoutes.routes

  private val app: HttpApp[IO] =
    Router(
      "/" -> (indexRoute <+> staticFiles),
      "/api" -> api
    ).orNotFound

  override def run: IO[Unit] =
    EmberServerBuilder.default[IO]
      .withHost(host)
      .withPort(port)
      .withHttpApp(app)
      .build
      .useForever
}
