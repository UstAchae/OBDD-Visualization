import cats.effect.IO
import org.http4s._
import org.http4s.dsl.io._
import org.http4s.circe._
import io.circe.generic.auto._
import io.circe.syntax._
import io.circe.Json

object ApiRoutes {

  private implicit val reqDecoder: EntityDecoder[IO, TruthTableReq] =
    jsonOf[IO, TruthTableReq]

  private implicit val respEncoder: EntityEncoder[IO, TruthTableResp] =
    jsonEncoderOf[IO, TruthTableResp]

  private implicit val bddReqDecoder: EntityDecoder[IO, BddReq] =
    jsonOf[IO, BddReq]

  private implicit val bddRespEncoder: EntityEncoder[IO, BddResp] =
    jsonEncoderOf[IO, BddResp]

  val routes: HttpRoutes[IO] = HttpRoutes.of[IO] {

    case GET -> Root =>
      Ok("OK")

    case req@POST -> Root / "truth-table" =>
      (for {
        body <- req.as[TruthTableReq]

        expr <- IO.fromEither(
          TempParser.parse(body.expr).left.map(e => new IllegalArgumentException(e.toString))
        )

        table <- IO(BoolExpr.truthTable(expr, body.vars))
          .handleErrorWith {
            case e: IllegalArgumentException => IO.raiseError(e) // let outer handle map to 400
            case other => IO.raiseError(other)
          }

        rows = table.map { case (envMap, out) =>
          val envList = body.vars.map(v => envMap(v))
          TruthTableRow(envList, out)
        }

        resp = TruthTableResp(body.vars, rows)
        r <- Ok(resp.asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other => BadRequest(other.getMessage)
      }
    case req@POST -> Root / "bdd" =>
      (for {
        body <- req.as[BddReq]

        expr <- IO.fromEither(
          TempParser.parse(body.expr).left.map(e => new IllegalArgumentException(e.toString))
        )

        tt <- IO(BoolExpr.truthTable(expr, body.vars))
          .handleErrorWith {
            case e: IllegalArgumentException => IO.raiseError(e)
            case other => IO.raiseError(other)
          }

        rows = tt.map { case (envMap, out) =>
          BDDFromTruthTable.Row(
            body.vars.map(v => envMap(v)).toVector,
            out
          )
        }.toVector

        root = BDDFromTruthTable.build(body.vars.toVector, rows)
        elements = BDDExport.toCytoscape(root, body.vars.toVector)

        r <- Ok(BddResp(elements).asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other => BadRequest(other.getMessage)
      }

  }
}
