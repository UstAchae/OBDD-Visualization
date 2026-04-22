import scala.util.matching.Regex

object LineAnalyzer {
  import BoolExpr._

  private val BaseNameSrc = "[A-Za-z_][A-Za-z0-9_]*"
  private val RestrictSuffixSrc = s"\\[[01]\\/$BaseNameSrc\\]"
  private val DerivedNameSrc = s"$BaseNameSrc(?:$RestrictSuffixSrc)*"
  private val DerivedNameRe: Regex = s"^$DerivedNameSrc$$".r
  private val RestrictAliasRe: Regex = "\\[".r
  private val RestrictSuffixRe: Regex = s"\\[([01])/($BaseNameSrc)\\]".r

  private final case class DefSlot(name: String, rhs: String)
  private final case class ApplyCall(op: String, leftName: String, rightName: String)
  private final case class RestrictCall(bit: Int, atomName: String, bddName: String)
  private def parseRestrictAliasName(name: String): Option[(String, List[(Int, String)])] = {
    val t = Option(name).getOrElse("").trim
    val base = t.takeWhile(_ != '[')
    if (base.isEmpty || !base.matches(s"^$BaseNameSrc$$")) None
    else {
      val suffixPart = t.drop(base.length)
      val chunks = RestrictSuffixRe.findAllMatchIn(suffixPart).toList
      if (chunks.isEmpty) None
      else if (chunks.map(_.matched).mkString != suffixPart) None
      else Some(base -> chunks.map(m => (m.group(1).toInt, m.group(2))))
    }
  }

  private def missingDefinitionFrom(err: String): Option[String] = {
    val Prefix = "Missing definition: "
    if (err.startsWith(Prefix)) Some(err.substring(Prefix.length).trim).filter(_.nonEmpty) else None
  }

  private def missingRestrictAtomFrom(err: String): Option[(String, String, Int)] = {
    val Pattern = """^Missing restrict atom:\s*([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([A-Za-z_][A-Za-z0-9_]*)\s+\(bit=([01])\)$""".r
    err match {
      case Pattern(atom, base, bit) => Some((base, atom, bit.toInt))
      case _ => None
    }
  }


  private def isDerivedName(s: String): Boolean =
    DerivedNameRe.pattern.matcher(s).matches()

  private def isRestrictAliasName(s: String): Boolean =
    isDerivedName(s) && RestrictAliasRe.findFirstIn(s).nonEmpty

  private def parseDefinitionSlot(raw: String): Option[DefSlot] = {
    val t = Option(raw).getOrElse("").trim
    val m = (s"^($DerivedNameSrc)\\s*=\\s*(.*)$$").r
    t match {
      case m(name, rhs) => Some(DefSlot(name, Option(rhs).getOrElse("").trim))
      case _ => None
    }
  }

  private def parseApplyCall(raw: String): Option[ApplyCall] = {
    val t = Option(raw).getOrElse("").trim
    val m = (s"^apply\\s*\\(\\s*([^,]+?)\\s*,\\s*($DerivedNameSrc)\\s*,\\s*($DerivedNameSrc)\\s*\\)$$").r
    t match {
      case m(opRaw, left, right) =>
        canonicalOp(opRaw).map(op => ApplyCall(op, left, right))
      case _ => None
    }
  }

  private def parseRestrictCall(raw: String): Option[RestrictCall] = {
    val t = Option(raw).getOrElse("").trim
    val m = (s"^restrict\\s*\\(\\s*([01])\\s*,\\s*($BaseNameSrc)\\s*,\\s*($DerivedNameSrc)\\s*\\)$$").r
    t match {
      case m(bit, atom, bdd) => Some(RestrictCall(bit.toInt, atom, bdd))
      case _ => None
    }
  }

  private def canonicalOp(raw: String): Option[String] = {
    val compact = Option(raw).getOrElse("").trim
    val unwrapped =
      if (compact.startsWith("<") && compact.endsWith(">")) compact.substring(1, compact.length - 1).trim
      else compact
    val key = unwrapped.replaceAll("\\s+", "").toLowerCase
    key match {
      case "and" | "&&" | "&" | "∧" => Some("∧")
      case "nand" | "↑" | "⊼" => Some("↑")
      case "or" | "||" | "|" | "∨" => Some("∨")
      case "nor" | "↓" | "⊽" => Some("↓")
      case "xor" | "^" | "⊕" => Some("⊕")
      case "implies" | "->" | "→" => Some("→")
      case "iff" | "<->" | "↔" => Some("↔")
      case _ => None
    }
  }

  private def applyOp(op: String, a: Expr, b: Expr): Expr = op match {
    case "∧" => And(a, b)
    case "↑" => Nand(a, b)
    case "∨" => Or(a, b)
    case "↓" => Nor(a, b)
    case "⊕" => Xor(a, b)
    case "→" => Implies(a, b)
    case "↔" => Iff(a, b)
    case _ => Or(a, b)
  }

  private def restrictExprByAtom(expr: Expr, atomName: String, bit: Int): Expr = {
    val replacement = if (bit == 1) Const(true) else Const(false)
    def loop(e: Expr): Expr = e match {
      case Var(n) if n == atomName => replacement
      case v @ Var(_) => v
      case c @ Const(_) => c
      case Not(x) => Not(loop(x))
      case And(x, y) => And(loop(x), loop(y))
      case Nand(x, y) => Nand(loop(x), loop(y))
      case Or(x, y) => Or(loop(x), loop(y))
      case Nor(x, y) => Nor(loop(x), loop(y))
      case Xor(x, y) => Xor(loop(x), loop(y))
      case Implies(x, y) => Implies(loop(x), loop(y))
      case Iff(x, y) => Iff(loop(x), loop(y))
    }
    loop(expr)
  }

  private def expandExprDefs(
    expr: Expr,
    defs: Map[String, String],
    visiting: Set[String]
  ): Either[String, Expr] = expr match {
    case Var(name) if defs.contains(name) =>
      if (visiting.contains(name)) Left(s"Circular reference: $name")
      else expandNamed(name, defs, visiting)
    case v @ Var(_) => Right(v)
    case c @ Const(_) => Right(c)
    case Not(x) => expandExprDefs(x, defs, visiting).map(Not.apply)
    case And(a, b) => for { x <- expandExprDefs(a, defs, visiting); y <- expandExprDefs(b, defs, visiting) } yield And(x, y)
    case Nand(a, b) => for { x <- expandExprDefs(a, defs, visiting); y <- expandExprDefs(b, defs, visiting) } yield Nand(x, y)
    case Or(a, b) => for { x <- expandExprDefs(a, defs, visiting); y <- expandExprDefs(b, defs, visiting) } yield Or(x, y)
    case Nor(a, b) => for { x <- expandExprDefs(a, defs, visiting); y <- expandExprDefs(b, defs, visiting) } yield Nor(x, y)
    case Xor(a, b) => for { x <- expandExprDefs(a, defs, visiting); y <- expandExprDefs(b, defs, visiting) } yield Xor(x, y)
    case Implies(a, b) => for { x <- expandExprDefs(a, defs, visiting); y <- expandExprDefs(b, defs, visiting) } yield Implies(x, y)
    case Iff(a, b) => for { x <- expandExprDefs(a, defs, visiting); y <- expandExprDefs(b, defs, visiting) } yield Iff(x, y)
  }

  private def expandNamed(
    name: String,
    defs: Map[String, String],
    visiting: Set[String] = Set.empty
  ): Either[String, Expr] = {
    if (isRestrictAliasName(name)) {
      parseRestrictAliasName(name) match {
        case None => Left(s"Missing definition: $name")
        case Some((baseName, suffixes)) =>
          if (!defs.contains(baseName)) Left(s"Missing definition: $baseName")
          else {
            for {
              baseExpr <- expandNamed(baseName, defs, visiting)
              resolved <- suffixes.foldLeft[Either[String, Expr]](Right(baseExpr)) {
                case (Left(err), _) => Left(err)
                case (Right(acc), (bit, atom)) =>
                  val vars = BoolExpr.collectVars(acc)
                  if (!vars.contains(atom)) Left(s"Missing restrict atom: $atom in $baseName (bit=$bit)")
                  else Right(restrictExprByAtom(acc, atom, bit))
              }
            } yield resolved
          }
      }
    } else if (!defs.contains(name)) Left(s"Missing definition: $name")
    else if (visiting.contains(name)) Left(s"Circular reference: $name")
    else {
      val raw = defs(name).trim
      val nextVisiting = visiting + name
      parseApplyCall(raw) match {
        case Some(call) =>
          for {
            left <- expandNamed(call.leftName, defs, nextVisiting)
            right <- expandNamed(call.rightName, defs, nextVisiting)
          } yield applyOp(call.op, left, right)
        case None =>
          parseRestrictCall(raw) match {
            case Some(call) =>
              for {
                base <- expandNamed(call.bddName, defs, nextVisiting)
              } yield restrictExprByAtom(base, call.atomName, call.bit)
            case None =>
              for {
                parsed <- TempParser.parse(raw).left.map(_.toString)
                expanded <- expandExprDefs(parsed, defs, nextVisiting)
              } yield expanded
          }
      }
    }
  }

  private def makeRestrictDerivedName(baseName: String, bit: Int, atomName: String): Option[String] = {
    val b = bit.toString
    if (!isDerivedName(baseName) || !(b == "0" || b == "1") || !atomName.matches(s"^$BaseNameSrc$$")) None
    else Some(s"$baseName[$b/$atomName]")
  }

  private def collectSlots(expressions: List[String]): List[DefSlot] =
    expressions.flatMap(parseDefinitionSlot)

  private def collectDefs(expressions: List[String]): Map[String, String] =
    collectSlots(expressions).filter(_.rhs.nonEmpty).map(s => s.name -> s.rhs).toMap

  def analyze(expressions: List[String], idx: Int): AnalyzeLineResp = {
    val line = if (idx >= 0 && idx < expressions.length) expressions(idx) else ""
    val raw = Option(line).getOrElse("").trim
    if (raw.isEmpty) AnalyzeLineResp(ok = false, reason = Some("empty"), kind = "empty", raw = raw)
    else {
      val looseDef = "^(.+?)\\s*=\\s*(.*)$".r.findFirstMatchIn(raw)
      val looseDefInvalid = looseDef.flatMap { m =>
        val lhs = Option(m.group(1)).getOrElse("").trim
        val rhs = Option(m.group(2)).getOrElse("").trim
        Option.when(!isDerivedName(lhs))(
          AnalyzeLineResp(
            ok = false,
            reason = Some("invalid_name"),
            kind = "definition",
            raw = raw,
            body = Some(rhs)
          )
        )
      }

      looseDefInvalid.getOrElse {
        val slot = parseDefinitionSlot(raw)
        if (slot.exists(_.rhs.isEmpty)) {
          AnalyzeLineResp(ok = false, reason = Some("empty_definition"), kind = "definition", raw = raw)
        } else {
          val slots = collectSlots(expressions)
          val defs = collectDefs(expressions)
          if (slot.exists(s => slots.count(_.name == s.name) > 1)) {
            AnalyzeLineResp(ok = false, reason = Some("duplicate_name"), kind = "definition", raw = raw)
          } else {
            val body = slot.map(_.rhs).getOrElse(raw)
            val apply = parseApplyCall(body)
            val restrict = parseRestrictCall(body)
            val applyLike = body.toLowerCase.startsWith("apply(") || body.toLowerCase.startsWith("apply ")
            val restrictLike = body.toLowerCase.startsWith("restrict(") || body.toLowerCase.startsWith("restrict ")

            val invalidRestrictAliasName =
              (slot.exists(s => isRestrictAliasName(s.name)) && !restrictLike) ||
                (slot.exists(s => isRestrictAliasName(s.name)) && restrict.nonEmpty && {
                  val r = restrict.get
                  val expected = makeRestrictDerivedName(r.bddName, r.bit, r.atomName)
                  expected.forall(_ != slot.get.name)
                })

            if (invalidRestrictAliasName) {
              AnalyzeLineResp(ok = false, reason = Some("invalid_name"), kind = "definition", raw = raw, body = Some(body))
            } else {
              apply match {
                case Some(a) =>
                  val names = List(a.leftName, a.rightName)
                  val resolved = names.map(n => n -> expandNamed(n, defs))
                  val missingNames = resolved.flatMap { case (_, r) => r.left.toOption.flatMap(missingDefinitionFrom) }.distinct
                  val incompleteNames = missingNames.filter(n => slots.exists(x => x.name == n && x.rhs.isEmpty))
                  val creatableNames = missingNames.filterNot(n => slots.exists(_.name == n))

                  val aliasAtomMissing = resolved.collectFirst {
                    case (_, Left(err)) if missingRestrictAtomFrom(err).nonEmpty => missingRestrictAtomFrom(err).get
                  }

                  if (aliasAtomMissing.nonEmpty) {
                    val (baseName, atomName, bit) = aliasAtomMissing.get
                    AnalyzeLineResp(
                      ok = false,
                      reason = Some("restrict_atom_missing_in_expr"),
                      kind = "apply",
                      raw = raw,
                      body = Some(body),
                      apply = Some(AnalyzeApplyMeta(a.op, a.leftName, a.rightName)),
                      restrict = Some(AnalyzeRestrictMeta(bit, atomName, baseName))
                    )
                  } else if (missingNames.nonEmpty) {
                    AnalyzeLineResp(
                      ok = false,
                      reason = Some("apply_missing_defs"),
                      kind = "apply",
                      raw = raw,
                      body = Some(body),
                      apply = Some(AnalyzeApplyMeta(a.op, a.leftName, a.rightName)),
                      missingNames = missingNames,
                      incompleteNames = incompleteNames,
                      creatableNames = creatableNames
                    )
                  } else {
                    val expr1 = resolved.collectFirst { case (n, Right(e)) if n == a.leftName => e }
                    val expr2 = resolved.collectFirst { case (n, Right(e)) if n == a.rightName => e }
                    if (expr1.isEmpty || expr2.isEmpty) {
                      AnalyzeLineResp(
                        ok = false,
                        reason = Some("apply_unresolvable_defs"),
                        kind = "apply",
                        raw = raw,
                        body = Some(body),
                        apply = Some(AnalyzeApplyMeta(a.op, a.leftName, a.rightName))
                      )
                    } else {
                      AnalyzeLineResp(
                        ok = true,
                        reason = None,
                        kind = "apply",
                        raw = raw,
                        body = Some(body),
                        apply = Some(AnalyzeApplyMeta(a.op, a.leftName, a.rightName)),
                        expr1 = Some(BoolExpr.pretty(expr1.get)),
                        expr2 = Some(BoolExpr.pretty(expr2.get))
                      )
                    }
                  }

                case None =>
                  restrict match {
                    case Some(r) =>
                      val resolvedBase = expandNamed(r.bddName, defs)
                      val missingNames = resolvedBase.left.toOption.flatMap(missingDefinitionFrom).toList
                      val incompleteNames = missingNames.filter(n => slots.exists(s => s.name == n && s.rhs.isEmpty))
                      val creatableNames = missingNames.filterNot(n => slots.exists(_.name == n))

                      val aliasAtomMissing = resolvedBase.left.toOption.flatMap(missingRestrictAtomFrom)
                      if (aliasAtomMissing.nonEmpty) {
                        val (baseName, atomName, bit) = aliasAtomMissing.get
                        AnalyzeLineResp(
                          ok = false,
                          reason = Some("restrict_atom_missing_in_expr"),
                          kind = "restrict",
                          raw = raw,
                          body = Some(body),
                          restrict = Some(AnalyzeRestrictMeta(bit, atomName, baseName))
                        )
                      } else if (missingNames.nonEmpty) {
                        AnalyzeLineResp(
                          ok = false,
                          reason = Some("restrict_missing_defs"),
                          kind = "restrict",
                          raw = raw,
                          body = Some(body),
                          restrict = Some(AnalyzeRestrictMeta(r.bit, r.atomName, r.bddName)),
                          missingNames = missingNames,
                          incompleteNames = incompleteNames,
                          creatableNames = creatableNames
                        )
                      } else {
                        val baseExpr = resolvedBase.toOption
                        if (baseExpr.isEmpty) {
                          AnalyzeLineResp(
                            ok = false,
                            reason = Some("restrict_unresolvable_defs"),
                            kind = "restrict",
                            raw = raw,
                            body = Some(body),
                            restrict = Some(AnalyzeRestrictMeta(r.bit, r.atomName, r.bddName))
                          )
                        } else {
                          val vars = BoolExpr.collectVars(baseExpr.get)
                          if (vars.isEmpty) {
                            AnalyzeLineResp(
                              ok = false,
                              reason = Some("restrict_constant_input_forbidden"),
                              kind = "restrict",
                              raw = raw,
                              body = Some(body),
                              restrict = Some(AnalyzeRestrictMeta(r.bit, r.atomName, r.bddName))
                            )
                          } else if (!vars.contains(r.atomName)) {
                            AnalyzeLineResp(
                              ok = false,
                              reason = Some("restrict_atom_missing_in_expr"),
                              kind = "restrict",
                              raw = raw,
                              body = Some(body),
                              restrict = Some(AnalyzeRestrictMeta(r.bit, r.atomName, r.bddName))
                            )
                          } else {
                            val out = restrictExprByAtom(baseExpr.get, r.atomName, r.bit)
                            AnalyzeLineResp(
                              ok = true,
                              reason = None,
                              kind = "restrict",
                              raw = raw,
                              body = Some(body),
                              restrict = Some(AnalyzeRestrictMeta(r.bit, r.atomName, r.bddName)),
                              baseExpr = Some(BoolExpr.pretty(baseExpr.get)),
                              expr = Some(BoolExpr.pretty(out))
                            )
                          }
                        }
                      }

                    case None =>
                      if (applyLike) {
                        AnalyzeLineResp(ok = false, reason = Some("apply_incomplete"), kind = "apply", raw = raw, body = Some(body))
                      } else if (restrictLike) {
                        AnalyzeLineResp(ok = false, reason = Some("restrict_incomplete"), kind = "restrict", raw = raw, body = Some(body))
                      } else {
                        TempParser.parse(body) match {
                          case Left(_) =>
                            AnalyzeLineResp(
                              ok = false,
                              reason = Some("invalid_boolean_expression"),
                              kind = if (slot.nonEmpty) "definition" else "expr",
                              raw = raw,
                              body = Some(body)
                            )
                          case Right(parsed) =>
                            if (slot.exists(s => BoolExpr.collectVars(parsed).contains(s.name))) {
                              AnalyzeLineResp(
                                ok = false,
                                reason = Some("self_reference_definition"),
                                kind = "definition",
                                raw = raw,
                                body = Some(body)
                              )
                            } else {
                              val expanded = expandExprDefs(parsed, defs, Set.empty).getOrElse(parsed)
                              AnalyzeLineResp(
                                ok = true,
                                reason = None,
                                kind = "expr",
                                raw = raw,
                                body = Some(body),
                                expr = Some(BoolExpr.pretty(expanded))
                              )
                            }
                        }
                      }
                  }
              }
            }
          }
        }
      }
    }
  }
}
