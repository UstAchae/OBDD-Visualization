object BDDFromTruthTable {
  import BDDCore._

  final case class Row(env: Vector[Boolean], out: Boolean)

  def build(vars: Vector[String], rows: Vector[Row]): BDDNode = {
    var nextId = 0
    def freshId(): Int = { nextId += 1; nextId }

    def allSameOut(rs: Vector[Row]): Option[Boolean] =
      if (rs.isEmpty) None
      else {
        val v = rs.head.out
        if (rs.forall(_.out == v)) Some(v) else None
      }

    def go(level: Int, rs: Vector[Row]): BDDNode = {
      // Early-stop: if the restricted truth-table already determines the output,
      // collapse this subtree into a NEW terminal.
      allSameOut(rs) match {
        case Some(v) =>
          Terminal(value = v, id = freshId())

        case None =>
          if (level >= vars.length) {
            Terminal(value = rs.headOption.map(_.out).getOrElse(false), id = freshId())
          } else {
            val (hi, lo) = rs.partition(r => r.env(level))
            val lowNode  = go(level + 1, lo)
            val highNode = go(level + 1, hi)

            NonTerminal(
              index = level + 1,
              low = lowNode,
              high = highNode,
              id = freshId()
            )
          }
      }
    }

    go(0, rows)
  }
}
