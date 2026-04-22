import scala.collection.mutable

object GraphStateCodec {
  import BDDCore._

  def encode(root: BDDNode): ApplyResultState = {
    val seen = mutable.HashSet.empty[String]
    val out = mutable.ListBuffer.empty[ApplyResultStateNode]

    def go(node: BDDNode): Unit = {
      val id = node.uid
      if (!seen.contains(id)) {
        seen += id
        node match {
          case Terminal(value, _, _, _) =>
            out += ApplyResultStateNode(
              id = id,
              terminalValue = Some(value)
            )
          case NonTerminal(index, low, high, _, _, _) =>
            out += ApplyResultStateNode(
              id = id,
              index = Some(index),
              lowId = Some(low.uid),
              highId = Some(high.uid)
            )
            go(low)
            go(high)
        }
      }
    }

    go(root)
    ApplyResultState(rootId = root.uid, nodes = out.toList)
  }

  def decode(resultState: ApplyResultState): Option[BDDNode] = {
    val byId = mutable.LinkedHashMap.empty[String, BDDNode]
    var nextId = 1

    resultState.nodes.foreach { rec =>
      val node =
        rec.terminalValue match {
          case Some(value) =>
            Terminal(value = value, id = nextId, uid = rec.id)
          case None =>
            NonTerminal(
              index = rec.index.getOrElse(1),
              low = Terminal(false),
              high = Terminal(false),
              id = nextId,
              uid = rec.id
            )
        }
      nextId += 1
      byId(rec.id) = node
    }

    resultState.nodes.foreach { rec =>
      byId.get(rec.id).collect { case nt: NonTerminal =>
        rec.lowId.flatMap(byId.get).foreach(nt.low = _)
        rec.highId.flatMap(byId.get).foreach(nt.high = _)
      }
    }

    byId.get(resultState.rootId)
  }
}
