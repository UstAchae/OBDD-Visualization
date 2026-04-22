import scala.collection.mutable

object RestrictSnap {
  import BDDCore._
  import BDDExport._

  private def dfsCollect(root: BDDNode): List[BDDNode] = {
    val seen = mutable.HashSet.empty[BDDNode]
    val out = mutable.ListBuffer.empty[BDDNode]
    def go(v: BDDNode): Unit = {
      if (!seen.contains(v)) {
        seen += v
        out += v
        v match {
          case NonTerminal(_, lo, hi, _, _, _) => go(lo); go(hi)
          case Terminal(_, _, _, _) => ()
        }
      }
    }
    go(root)
    out.toList
  }

  private def buildParents(
    root: BDDNode
  ): mutable.HashMap[BDDNode, mutable.ListBuffer[(NonTerminal, Boolean)]] = {
    val parents =
      mutable.HashMap.empty[BDDNode, mutable.ListBuffer[(NonTerminal, Boolean)]]

    def add(child: BDDNode, p: NonTerminal, isLow: Boolean): Unit = {
      val buf = parents.getOrElseUpdate(child, mutable.ListBuffer.empty)
      buf += ((p, isLow))
    }

    val seen = mutable.HashSet.empty[BDDNode]
    def go(v: BDDNode): Unit = {
      if (!seen.contains(v)) {
        seen += v
        v match {
          case p @ NonTerminal(_, lo, hi, _, _, _) =>
            add(lo, p, true)
            add(hi, p, false)
            go(lo); go(hi)
          case Terminal(_, _, _, _) => ()
        }
      }
    }

    go(root)
    parents
  }

  private def replaceInParents(
    parents: mutable.HashMap[BDDNode, mutable.ListBuffer[(NonTerminal, Boolean)]],
    oldNode: BDDNode,
    newNode: BDDNode
  ): Unit = {
    parents.get(oldNode).foreach { buf =>
      buf.foreach { case (p, isLow) =>
        if (isLow) p.low = newNode else p.high = newNode
        val b2 = parents.getOrElseUpdate(newNode, mutable.ListBuffer.empty)
        b2 += ((p, isLow))
      }
    }
    parents.remove(oldNode)
  }

  private def snapshot(root: BDDNode, vars: Vector[String]): CyElements =
    BDDExport.toCytoscape(root, vars)

  private def labelOf(node: BDDNode, vars: Vector[String]): String = node match {
    case Terminal(value, _, _, _) => if (value) "1" else "0"
    case NonTerminal(index, _, _, _, _, _) =>
      if (index >= 1 && index <= vars.length) vars(index - 1) else s"x$index"
  }

  private def explicitSnapshot(
    nodes: List[BDDNode],
    layoutRoot: BDDNode,
    vars: Vector[String],
    originalPositions: Map[String, CyPos]
  ): CyElements = {
    val layoutPositions =
      snapshot(layoutRoot, vars).nodes.map(n => n.data.id -> n.position).toMap
    val includedIds = nodes.map(BDDExport.cyIdOf).toSet

    val cyNodes = nodes.map { node =>
      val id = BDDExport.cyIdOf(node)
      CyNode(
        data = CyNodeData(id, labelOf(node, vars)),
        classes = node match {
          case Terminal(_, _, _, _) => Some("terminal")
          case _ => None
        },
        position = layoutPositions
          .getOrElse(id, originalPositions.getOrElse(id, CyPos(0.0, 0.0)))
      )
    }

    val seenEdges = mutable.HashSet.empty[String]
    val cyEdges = mutable.ListBuffer.empty[CyEdge]
    nodes.foreach {
      case nt: NonTerminal =>
        val from = BDDExport.cyIdOf(nt)
        List(("0", nt.low), ("1", nt.high)).foreach { case (lab, child) =>
          val to = BDDExport.cyIdOf(child)
          if (includedIds.contains(to)) {
            val edgeId = s"e_${from}_${lab}_${to}"
            if (!seenEdges.contains(edgeId)) {
              seenEdges += edgeId
              cyEdges += CyEdge(
                data = CyEdgeData(edgeId, from, to, lab),
                classes = Some(if (lab == "0") "zero" else "one")
              )
            }
          }
        }
      case _ => ()
    }

    CyElements(cyNodes, cyEdges.toList)
  }

  def traceRestrict(
    rootStart: BDDNode,
    atomIndex: Int,
    bit: Boolean,
    vars: Vector[String]
  ): List[TraceSnapStep] = {
    var root = rootStart
    val out = mutable.ListBuffer.empty[TraceSnapStep]

    val before = dfsCollect(root)
    val originalPositions = snapshot(root, vars).nodes.map(n => n.data.id -> n.position).toMap
    val targets = before.collect { case nt: NonTerminal if nt.index == atomIndex => nt }
    if (targets.nonEmpty) {
      val parents = buildParents(root)
      val targetIds = targets.map(BDDExport.cyIdOf)
      val incomingEdgeIds = targets.flatMap { nt =>
        parents.getOrElse(nt, mutable.ListBuffer.empty).map { case (p, isLowChild) =>
          val from = BDDExport.cyIdOf(p)
          val to = BDDExport.cyIdOf(nt)
          val lab = if (isLowChild) "0" else "1"
          s"e_${from}_${lab}_${to}"
        }
      }.distinct
      targets.foreach { nt =>
        val next = if (bit) nt.high else nt.low
        if (root eq nt) root = next
        replaceInParents(parents, nt, next)
      }

      out += TraceSnapStep(
        title = s"Restrict: redirect incoming edges to ${if (bit) "high" else "low"}",
        focus = incomingEdgeIds ++ targetIds,
        snapshot = explicitSnapshot(before, root, vars, originalPositions),
        resultState = Some(GraphStateCodec.encode(root))
      )

      val withoutTargets = before.filterNot(targets.contains)
      out += TraceSnapStep(
        title = "Restrict: remove restricted nodes and their outgoing edges",
        focus = targetIds,
        snapshot = explicitSnapshot(withoutTargets, root, vars, originalPositions),
        resultState = Some(GraphStateCodec.encode(root))
      )

      val reachableAfterRedirect = dfsCollect(root)
      val unreachableIds = withoutTargets
        .map(BDDExport.cyIdOf)
        .filterNot(id => reachableAfterRedirect.exists(n => BDDExport.cyIdOf(n) == id))
      out += TraceSnapStep(
        title = "Restrict: prune unreachable nodes and edges",
        focus = unreachableIds,
        snapshot = snapshot(root, vars),
        resultState = Some(GraphStateCodec.encode(root))
      )
    }

    out.toList
  }
}
