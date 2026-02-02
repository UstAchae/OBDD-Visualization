object BDDExport {
  import BDDCore._

  final case class CyNodeData(id: String, label: String)
  final case class CyEdgeData(id: String, source: String, target: String, label: String)

  final case class CyNode(data: CyNodeData, classes: Option[String] = None)
  final case class CyEdge(data: CyEdgeData, classes: Option[String] = None)

  final case class CyElements(nodes: List[CyNode], edges: List[CyEdge])

  def toCytoscape(root: BDDNode, vars: Vector[String]): CyElements = {
    var nextNode = 0
    var nextEdge = 0

    val nodeIds = scala.collection.mutable.Map[BDDNode, String]()
    val nodes = scala.collection.mutable.ListBuffer[CyNode]()
    val edges = scala.collection.mutable.ListBuffer[CyEdge]()

    def allocNode(v: BDDNode): String =
      nodeIds.getOrElseUpdate(v, {
        val id = s"n$nextNode"
        nextNode += 1

        v match {
          case Terminal(value, _, _) =>
            nodes += CyNode(
              data = CyNodeData(id, if (value) "1" else "0"),
              classes = Some("terminal")
            )
          case NonTerminal(index, _, _, _, _) =>
            val name =
              if (index >= 1 && index <= vars.length) vars(index - 1)
              else s"x$index"
            nodes += CyNode(
              data = CyNodeData(id, name),
              classes = None
            )
        }

        id
      })

    def addEdge(src: String, dst: String, lab: String, cls: String): Unit = {
      val id = s"e$nextEdge"
      nextEdge += 1
      edges += CyEdge(
        data = CyEdgeData(id, src, dst, lab),
        classes = Some(cls)
      )
    }

    def go(v: BDDNode): Unit = v match {
      case NonTerminal(_, low, high, _, _) =>
        val from = allocNode(v)
        val loId = allocNode(low)
        val hiId = allocNode(high)

        addEdge(from, loId, "0", "zero")
        addEdge(from, hiId, "1", "one")

        go(low)
        go(high)
      case _ => ()
    }

    go(root)
    CyElements(nodes.toList, edges.toList)
  }
}
