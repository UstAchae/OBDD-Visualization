// backend/src/main/scala/ApiRoutes.scala

import cats.effect.IO
import org.http4s._
import org.http4s.dsl.io._
import org.http4s.circe.CirceEntityCodec._
import io.circe.syntax._
import io.circe.generic.auto._

object ApiRoutes {

  val routes: HttpRoutes[IO] = HttpRoutes.of[IO] {

    case GET -> Root =>
      Ok("OK")

    case req @ POST -> Root / "truth-table" =>
      (for {
        body <- req.as[TruthTableReq]
        expr <- IO.fromEither(
          TempParser.parse(body.expr).left.map(e => new IllegalArgumentException(e.toString))
        )
        table <- IO(BoolExpr.truthTable(expr, body.vars))
        rows = table.map { case (envMap, out) =>
          TruthTableRow(body.vars.map(v => envMap(v)), out)
        }
        r <- Ok(TruthTableResp(body.vars, rows).asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }

    case req @ POST -> Root / "bdd" =>
      (for {
        body <- req.as[BddReq]
        expr <- IO.fromEither(
          TempParser.parse(body.expr).left.map(e => new IllegalArgumentException(e.toString))
        )

        tt <- IO(BoolExpr.truthTable(expr, body.vars))
        rows = tt.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector

        root0 = BDDFromTruthTable.build(body.vars.toVector, rows)

        // side-effect must be in IO
        _ <- IO.delay(ReduceSnap.assignFreshIds(root0))

        elements = BDDExport.toCytoscape(root0, body.vars.toVector)
        r <- Ok(BddResp(elements).asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }

    // Step 1: terminals
    case req @ POST -> Root / "bdd" / "reduce-terminals-trace" =>
      (for {
        body <- req.as[ReduceTraceReq]
        expr <- IO.fromEither(
          TempParser.parse(body.expr).left.map(e => new IllegalArgumentException(e.toString))
        )

        tt <- IO(BoolExpr.truthTable(expr, body.vars))
        rows = tt.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector

        root0 = BDDFromTruthTable.build(body.vars.toVector, rows)
        rootStart = ReduceSnap.applyAlreadyApplied(root0, body.applied)

        _ <- IO.delay(ReduceSnap.assignFreshIds(rootStart))

        initial = BDDExport.toCytoscape(rootStart, body.vars.toVector)
        steps = ReduceSnap.traceTerminals(rootStart, body.vars.toVector)

        r <- if (steps.isEmpty) NoContent()
        else Ok(ReduceSnapTraceResp(initial, steps).asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }

    // Step 2: redundant
    // Step 2: redundant
    case req @ POST -> Root / "bdd" / "reduce-redundant-trace" =>
      (for {
        body <- req.as[ReduceTraceReq]
        expr <- IO.fromEither(
          TempParser.parse(body.expr).left.map(e => new IllegalArgumentException(e.toString))
        )
        tt <- IO(BoolExpr.truthTable(expr, body.vars))

        rows = tt.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector

        root0 = BDDFromTruthTable.build(body.vars.toVector, rows)
        rootStart = ReduceSnap.applyAlreadyApplied(root0, body.applied)

        _ <- IO.delay(ReduceSnap.assignFreshIds(rootStart))

        initial = BDDExport.toCytoscape(rootStart, body.vars.toVector)
        steps   = ReduceSnap.traceRedundant(rootStart, body.vars.toVector)

        r <- if (steps.isEmpty) NoContent()
        else Ok(ReduceSnapTraceResp(initial, steps).asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other => BadRequest(Option(other.getMessage).getOrElse(other.toString))
      }

    // Step 3: merge
    case req @ POST -> Root / "bdd" / "reduce-merge-trace" =>
      (for {
        body <- req.as[ReduceTraceReq]
        expr <- IO.fromEither(
          TempParser.parse(body.expr).left.map(e => new IllegalArgumentException(e.toString))
        )

        tt <- IO(BoolExpr.truthTable(expr, body.vars))
        rows = tt.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector

        root0 = BDDFromTruthTable.build(body.vars.toVector, rows)
        rootStart = ReduceSnap.applyAlreadyApplied(root0, body.applied)

        _ <- IO.delay(ReduceSnap.assignFreshIds(rootStart))

        initial = BDDExport.toCytoscape(rootStart, body.vars.toVector)
        steps = ReduceSnap.traceMerge(rootStart, body.vars.toVector)

        r <- if (steps.isEmpty) NoContent()
        else Ok(ReduceSnapTraceResp(initial, steps).asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }
  }
}