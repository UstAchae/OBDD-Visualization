object TempParser {
  import BoolExpr._

  final case class ParseError(message: String, index: Int) {
    override def toString: String = s"$message at index $index"
  }

  def parse(input: String): Either[ParseError, Expr] = {
    val p = new Parser(input)
    for {
      e <- p.parseIff()
      _ <- p.expectEnd()
    } yield e
  }

  // -------------------------
  // Implementation
  // -------------------------
  private final class Parser(raw: String) {

    private val s: String = raw
    private var i: Int = 0

    // Entry points by precedence (lowest to highest):
    // IFF  := IMPL ( ( "<->" | "↔" ) IMPL )*
    // IMPL := OR ( ( "->" | "→" ) IMPL )?        // right-assoc
    // OR   := XOR ( ( "||" | "|" | "∨" ) XOR )*
    // XOR  := AND ( ( "^" | "⊕" ) AND )*
    // AND  := NOT ( ( "&&" | "&" | "∧" ) NOT )*
    // NOT  := ( "!" | "¬" ) NOT | ATOM
    // ATOM := VAR | CONST | "(" IFF ")"

    def parseIff(): Either[ParseError, Expr] =
      leftChain(parseImpl, parseIffOp, Iff.apply)

    def parseImpl(): Either[ParseError, Expr] = {
      // right-associative: a -> b -> c == a -> (b -> c)
      for {
        a <- parseOr()
        res <- if (peekImplOp()) {
          consumeImplOp()
          parseImpl().map(b => Implies(a, b))
        } else Right(a)
      } yield res
    }

    def parseOr(): Either[ParseError, Expr] =
      leftChain(parseXor, parseOrOp, Or.apply)

    def parseXor(): Either[ParseError, Expr] =
      leftChain(parseAnd, parseXorOp, Xor.apply)

    def parseAnd(): Either[ParseError, Expr] =
      leftChain(parseNot, parseAndOp, And.apply)

    def parseNot(): Either[ParseError, Expr] = {
      skipWs()
      if (peek("!") || peek("¬")) {
        i += 1
        parseNot().map(Not.apply)
      } else parseAtom()
    }

    def parseAtom(): Either[ParseError, Expr] = {
      skipWs()
      if (peek("(")) {
        i += 1
        for {
          e <- parseIff()
          _ <- expect(")")
        } yield e
      } else if (peekConstTrue()) {
        consumeConstTrue()
        Right(Const(true))
      } else if (peekConstFalse()) {
        consumeConstFalse()
        Right(Const(false))
      } else if (peek("1")) {
        i += 1
        Right(Const(true))
      } else if (peek("0")) {
        i += 1
        Right(Const(false))
      } else {
        parseVar()
      }
    }

    // -------------------------
    // Chains / operators
    // -------------------------
    private def leftChain(
                           sub: () => Either[ParseError, Expr],
                           op: () => Option[() => Unit],
                           ctor: (Expr, Expr) => Expr
                         ): Either[ParseError, Expr] = {

      sub().flatMap { first =>
        var acc: Expr = first
        var out: Either[ParseError, Expr] = Right(acc)
        var continue = true

        while (continue && out.isRight) {
          skipWs()
          op() match {
            case Some(consume) =>
              consume()
              sub() match {
                case Left(e)  => out = Left(e)
                case Right(b) => acc = ctor(acc, b); out = Right(acc)
              }
            case None =>
              continue = false
          }
        }

        out
      }
    }

    private def parseIffOp(): Option[() => Unit] = {
      skipWs()
      if (peek("<->")) Some(() => { i += 3 })
      else if (peek("↔")) Some(() => { i += 1 })
      else None
    }

    private def peekImplOp(): Boolean = {
      skipWs()
      peek("->") || peek("→")
    }

    private def consumeImplOp(): Unit = {
      skipWs()
      if (peek("->")) i += 2
      else if (peek("→")) i += 1
    }

    private def parseOrOp(): Option[() => Unit] = {
      skipWs()
      if (peek("||")) Some(() => { i += 2 })
      else if (peek("|")) Some(() => { i += 1 })
      else if (peek("∨")) Some(() => { i += 1 })
      else None
    }

    private def parseXorOp(): Option[() => Unit] = {
      skipWs()
      if (peek("^")) Some(() => { i += 1 })
      else if (peek("⊕")) Some(() => { i += 1 })
      else None
    }

    private def parseAndOp(): Option[() => Unit] = {
      skipWs()
      if (peek("&&")) Some(() => { i += 2 })
      else if (peek("&")) Some(() => { i += 1 })
      else if (peek("∧")) Some(() => { i += 1 })
      else None
    }

    // -------------------------
    // Identifiers / constants
    // -------------------------
    private def parseVar(): Either[ParseError, Expr] = {
      skipWs()
      if (i >= s.length) Left(err("Unexpected end of input"))
      else {
        val start = i
        val c0 = s.charAt(i)

        if (!isIdStart(c0)) Left(err("Expected variable or '(' or constant"))
        else {
          i += 1
          while (i < s.length && isIdPart(s.charAt(i))) i += 1
          val name = s.substring(start, i)
          Right(Var(name))
        }
      }
    }


    private def peekConstTrue(): Boolean = {
      skipWs()
      peekIgnoreCase("true") || peek("⊤") || peek("T")
    }

    private def peekConstFalse(): Boolean = {
      skipWs()
      peekIgnoreCase("false") || peek("⊥") || peek("F")
    }

    private def consumeConstTrue(): Unit = {
      skipWs()
      if (peekIgnoreCase("true")) i += 4
      else i += 1
    }

    private def consumeConstFalse(): Unit = {
      skipWs()
      if (peekIgnoreCase("false")) i += 5
      else i += 1
    }

    // -------------------------
    // Low-level helpers
    // -------------------------
    def expectEnd(): Either[ParseError, Unit] = {
      skipWs()
      if (i == s.length) Right(())
      else Left(ParseError(s"Unexpected trailing input: '${s.substring(i)}'", i))
    }

    private def expect(lit: String): Either[ParseError, Unit] = {
      skipWs()
      if (peek(lit)) { i += lit.length; Right(()) }
      else Left(ParseError(s"Expected '$lit'", i))
    }

    private def peek(lit: String): Boolean =
      s.regionMatches(i, lit, 0, lit.length)

    private def peekIgnoreCase(lit: String): Boolean =
      s.regionMatches(true, i, lit, 0, lit.length)

    private def skipWs(): Unit = {
      while (i < s.length && s.charAt(i).isWhitespace) i += 1
    }

    private def err(msg: String): ParseError =
      ParseError(msg, i)

    private def isIdStart(c: Char): Boolean =
      c.isLetter || c == '_'

    private def isIdPart(c: Char): Boolean =
      c.isLetterOrDigit || c == '_'
  }
}
