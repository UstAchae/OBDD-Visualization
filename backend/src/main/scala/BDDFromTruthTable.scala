object BDDFromTruthTable {
  import BDDCore._

  final case class Row(env: Vector[Boolean], out: Boolean)

  def build(vars: Vector[String], rows: Vector[Row]): BDDNode = {
    var nextId = 0
    def freshId(): Int = { nextId += 1; nextId }

    def go(level: Int, rs: Vector[Row]): BDDNode = {
      if (level >= vars.length) {
        // Leaf: the assignment is fully specified. If rs is empty (incomplete table),
        // fall back to false to keep the tree total.
        Terminal(value = rs.headOption.map(_.out).getOrElse(false), id = freshId())
      } else {
        val (hi, lo) = rs.partition(r => r.env(level))
        val lowNode = go(level + 1, lo)
        val highNode = go(level + 1, hi)

        NonTerminal(
          index = level + 1,
          low = lowNode,
          high = highNode,
          id = freshId()
        )
      }
    }

    go(0, rows)
  }
}
