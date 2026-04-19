// backend/src/main/scala/api/ApiRoutes.scala

import cats.effect.IO
import org.http4s._
import org.http4s.dsl.io._
import org.http4s.circe.CirceEntityCodec._
import io.circe.syntax._
import io.circe.generic.auto._

object ApiRoutes {

  private def handleReduceTrace(
    body: ReduceTraceReq,
    traceFn: (BDDCore.BDDNode, Vector[String]) => List[TraceSnapStep]
  ): IO[Response[IO]] = {
    (for {
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
      steps = traceFn(rootStart, body.vars.toVector)
      r <- if (steps.isEmpty) NoContent() else Ok(ReduceSnapTraceResp(initial, steps).asJson)
    } yield r).handleErrorWith {
      case e: IllegalArgumentException => BadRequest(e.getMessage)
      case other => BadRequest(Option(other.getMessage).getOrElse(other.toString))
    }
  }

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

    case req @ POST -> Root / "format-expr" =>
      (for {
        body <- req.as[FormatExprReq]
        expr <- IO.fromEither(
          TempParser.parse(body.expr).left.map(e => new IllegalArgumentException(e.toString))
        )
        r <- Ok(FormatExprResp(BoolExpr.pretty(expr)).asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }

    case req @ POST -> Root / "analyze-line" =>
      (for {
        body <- req.as[AnalyzeLineReq]
        _ <- if (body.idx >= 0 && body.idx < body.expressions.length) IO.unit
        else IO.raiseError(new IllegalArgumentException("analyze-line idx out of range"))
        result <- IO(LineAnalyzer.analyze(body.expressions, body.idx))
        r <- Ok(result.asJson)
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

    case req @ POST -> Root / "bdd" / "apply" =>
      (for {
        body <- req.as[ApplyReq]
        op <- BDDCore.parseOperator(body.op) match {
          case Some(op) => IO.pure(op)
          case None =>
            IO.raiseError(new IllegalArgumentException(s"Unsupported operator: ${body.op}"))
        }
        expr1 <- IO.fromEither(
          TempParser.parse(body.expr1).left.map(e => new IllegalArgumentException(e.toString))
        )
        expr2 <- IO.fromEither(
          TempParser.parse(body.expr2).left.map(e => new IllegalArgumentException(e.toString))
        )
        tt1 <- IO(BoolExpr.truthTable(expr1, body.vars))
        tt2 <- IO(BoolExpr.truthTable(expr2, body.vars))
        rows1 = tt1.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector
        rows2 = tt2.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector
        root1 = BDDFromTruthTable.build(body.vars.toVector, rows1)
        root2 = BDDFromTruthTable.build(body.vars.toVector, rows2)
        applied <- IO.delay(BDDCore.Apply(root1, root2, op, body.vars.length))
        _ <- IO.delay(ReduceSnap.assignFreshIds(applied))
        elements = BDDExport.toCytoscape(applied, body.vars.toVector)
        r <- Ok(BddResp(elements).asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }

    case req @ POST -> Root / "bdd" / "apply-trace" =>
      (for {
        body <- req.as[ApplyTraceReq]
        op <- BDDCore.parseOperator(body.op) match {
          case Some(op) => IO.pure(op)
          case None =>
            IO.raiseError(new IllegalArgumentException(s"Unsupported operator: ${body.op}"))
        }
        expr1 <- IO.fromEither(
          TempParser.parse(body.expr1).left.map(e => new IllegalArgumentException(e.toString))
        )
        expr2 <- IO.fromEither(
          TempParser.parse(body.expr2).left.map(e => new IllegalArgumentException(e.toString))
        )
        tt1 <- IO(BoolExpr.truthTable(expr1, body.vars))
        tt2 <- IO(BoolExpr.truthTable(expr2, body.vars))
        rows1 = tt1.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector
        rows2 = tt2.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector
        root1 = BDDCore.Reduce(BDDFromTruthTable.build(body.vars.toVector, rows1), body.vars.length)
        root2 = BDDCore.Reduce(BDDFromTruthTable.build(body.vars.toVector, rows2), body.vars.length)
        resp = ApplySnap.interactiveScene(
          root1,
          root2,
          op,
          body.vars.toVector,
          body.revealed.toSet,
          body.resolved.toSet,
          body.expanded.toSet,
          body.appliedReductions,
          body.resultState,
          body.advancePath,
          body.advancePhase
        )
        r <- Ok(resp.asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }

    case req @ POST -> Root / "bdd" / "apply-reduce-trace" =>
      (for {
        body <- req.as[ApplyReduceTraceReq]
        op <- BDDCore.parseOperator(body.op) match {
          case Some(op) => IO.pure(op)
          case None =>
            IO.raiseError(new IllegalArgumentException(s"Unsupported operator: ${body.op}"))
        }
        expr1 <- IO.fromEither(
          TempParser.parse(body.expr1).left.map(e => new IllegalArgumentException(e.toString))
        )
        expr2 <- IO.fromEither(
          TempParser.parse(body.expr2).left.map(e => new IllegalArgumentException(e.toString))
        )
        tt1 <- IO(BoolExpr.truthTable(expr1, body.vars))
        tt2 <- IO(BoolExpr.truthTable(expr2, body.vars))
        rows1 = tt1.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector
        rows2 = tt2.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector
        root1 = BDDCore.Reduce(BDDFromTruthTable.build(body.vars.toVector, rows1), body.vars.length)
        root2 = BDDCore.Reduce(BDDFromTruthTable.build(body.vars.toVector, rows2), body.vars.length)
        trace = ApplySnap.reduceInteractiveScene(
          root1,
          root2,
          op,
          body.vars.toVector,
          body.revealed.toSet,
          body.resolved.toSet,
          body.expanded.toSet,
          body.appliedReductions,
          body.kind,
          body.resultState,
          body.visibleResultNodeIds.toSet
        )
        r <- if (trace.steps.isEmpty) NoContent() else Ok(trace.asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }

    case req @ POST -> Root / "bdd" / "reduce-full" =>
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
        reduced <- IO.delay(BDDCore.Reduce(root0, body.vars.length))
        _ <- IO.delay(ReduceSnap.assignFreshIds(reduced))
        elements = BDDExport.toCytoscape(reduced, body.vars.toVector)
        r <- Ok(BddResp(elements).asJson)
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }

    case req @ POST -> Root / "bdd" / "reduce-terminals-trace" =>
      req.as[ReduceTraceReq].flatMap(body => handleReduceTrace(body, ReduceSnap.traceTerminals))

    case req @ POST -> Root / "bdd" / "reduce-redundant-trace" =>
      req.as[ReduceTraceReq].flatMap(body => handleReduceTrace(body, ReduceSnap.traceRedundant))

    case req @ POST -> Root / "bdd" / "reduce-merge-trace" =>
      req.as[ReduceTraceReq].flatMap(body => handleReduceTrace(body, ReduceSnap.traceMerge))

    case req @ POST -> Root / "bdd" / "restrict-trace" =>
      (for {
        body <- req.as[RestrictTraceReq]
        _ <- if (body.bit == 0 || body.bit == 1) IO.unit
        else IO.raiseError(new IllegalArgumentException("restrict bit must be 0 or 1"))
        expr <- IO.fromEither(
          TempParser.parse(body.expr).left.map(e => new IllegalArgumentException(e.toString))
        )
        varsV = body.vars.toVector
        atomIndex = varsV.indexOf(body.atom) + 1
        _ <- if (atomIndex >= 1) IO.unit
        else IO.raiseError(new IllegalArgumentException(s"Unknown atom for restrict: ${body.atom}"))
        tt <- IO(BoolExpr.truthTable(expr, body.vars))
        rows = tt.map { case (envMap, out) =>
          BDDFromTruthTable.Row(body.vars.map(v => envMap(v)).toVector, out)
        }.toVector
        root0 = BDDFromTruthTable.build(varsV, rows)
        rootStart = BDDCore.Reduce(root0, varsV.length)
        initial = BDDExport.toCytoscape(rootStart, varsV)
        steps = RestrictSnap.traceRestrict(rootStart, atomIndex, body.bit == 1, varsV)
        r <- if (steps.isEmpty) NoContent() else Ok(
          ReduceSnapTraceResp(
            initial = initial,
            steps = steps,
            initialResultState = Some(GraphStateCodec.encode(rootStart))
          ).asJson
        )
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }

    case req @ POST -> Root / "bdd" / "reduce-state-trace" =>
      (for {
        body <- req.as[StateReduceTraceReq]
        root <- IO.fromOption(
          GraphStateCodec.decode(body.resultState)
        )(new IllegalArgumentException("Invalid reduce state"))
        snapshotOf = (r: BDDCore.BDDNode) => BDDExport.toCytoscape(r, body.vars.toVector)
        stateOf = (r: BDDCore.BDDNode) => Some(GraphStateCodec.encode(r))
        initial = snapshotOf(root)
        steps = body.kind match {
          case "terminals" => ReduceSnap.traceTerminalsWithSnapshot(root, snapshotOf, Set.empty, stateOf)
          case "redundant" => ReduceSnap.traceRedundantWithSnapshot(root, snapshotOf, Set.empty, stateOf)
          case "merge"     => ReduceSnap.traceMergeWithSnapshot(root, snapshotOf, Set.empty, stateOf)
          case other       => throw new IllegalArgumentException(s"Unsupported reduce kind: $other")
        }
        r <- if (steps.isEmpty) NoContent() else Ok(
          ReduceSnapTraceResp(
            initial = initial,
            steps = steps,
            initialResultState = Some(body.resultState)
          ).asJson
        )
      } yield r).handleErrorWith {
        case e: IllegalArgumentException => BadRequest(e.getMessage)
        case other =>
          BadRequest(s"${other.getClass.getName}: ${Option(other.getMessage).getOrElse("")}")
      }
      
  }
}