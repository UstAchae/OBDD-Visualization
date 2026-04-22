import scala.collection.mutable

object ApplySnap {
  import BDDCore._
  import BDDExport._

  private enum ApplyCase:
    case TerminalCase
    case SameLevelCase
    case SmallerLeftCase
    case SmallerRightCase

  private def nodeKey(node: BDDNode): String = node.uid

  private final case class PartialChildren(
    low: Option[BDDNode] = None,
    high: Option[BDDNode] = None
  )

  private final case class PairPreview(
    anchor: BDDNode,
    leftRef: BDDNode,
    rightRef: BDDNode,
    path: String
  )

  private final case class ZoneRender(
    elements: CyElements,
    positions: Map[String, CyPos]
  )

  private final case class InteractiveState(
    left: BDDNode,
    right: BDDNode,
    vars: Vector[String],
    currentRoot: BDDNode,
    finalRoot: BDDNode,
    blockedUids: Set[String],
    partial: Map[String, PartialChildren],
    ghost: Set[String],
    placeholders: Set[String],
    previews: List[PairPreview],
    branches: List[ApplyBranch]
  )

  private val LayerGap = 120.0
  private val XGap = 54.0
  private val PairOffsetX = 22.0
  private val PairOffsetY = 0.0
  private def zoneNodeId(prefix: String, node: BDDNode): String = s"$prefix-${node.uid}"
  private def pairNodeId(anchor: BDDNode, side: String): String = s"P-${anchor.uid}-$side"

  private def mergeClasses(parts: String*): Option[String] = {
    val merged = parts.flatMap(_.split("\\s+")).map(_.trim).filter(_.nonEmpty).distinct.mkString(" ")
    Option.when(merged.nonEmpty)(merged)
  }

  private def zoneOffsets(varCount: Int): (Double, Double, Double) = {
    val leafCount = math.pow(2.0, math.max(1, varCount).toDouble)
    val width = leafCount * XGap
    val spacing = math.max(360.0, width * 0.7 + 120.0)
    (-spacing, 0.0, spacing)
  }

  private def levelY(node: BDDNode, vars: Vector[String]): Double = node match {
    case Terminal(_, _, _, _)                 => (vars.length + 1) * LayerGap
    case NonTerminal(index, _, _, _, _, _)   => math.max(1, index) * LayerGap
  }

  private def labelOf(node: BDDNode, vars: Vector[String]): String = node match {
    case Terminal(value, _, _, _)             => if (value) "1" else "0"
    case NonTerminal(index, _, _, _, _, _) =>
      if (index >= 1 && index <= vars.length) vars(index - 1)
      else s"x$index"
  }

  private def indexOf(node: BDDNode, varCount: Int): Int = node match {
    case Terminal(_, _, _, _)               => varCount + 1
    case NonTerminal(index, _, _, _, _, _) => index
  }

  private def buildZoneElements(
    rootOpt: Option[BDDNode],
    prefix: String,
    zoneClass: String,
    vars: Vector[String],
    xOffset: Double,
    partial: Map[String, PartialChildren] = Map.empty,
    ghost: Set[String] = Set.empty,
    placeholders: Set[String] = Set.empty
  ): ZoneRender = {
    if (rootOpt.isEmpty) ZoneRender(CyElements(Nil, Nil), Map.empty)
    else {
      val nodes = mutable.ListBuffer.empty[CyNode]
      val edges = mutable.ListBuffer.empty[CyEdge]
      val seenNodes = mutable.HashSet.empty[String]
      val seenEdges = mutable.HashSet.empty[String]
      val positions = mutable.HashMap.empty[String, CyPos]

      val leafCount = math.pow(2.0, math.max(1, vars.length).toDouble)

      def childPair(node: BDDNode): (Option[BDDNode], Option[BDDNode]) = node match {
        case nt: NonTerminal =>
          partial.get(nodeKey(nt)) match {
            case Some(pc) => (pc.low, pc.high)
            case None     => (Some(nt.low), Some(nt.high))
          }
        case _ => (None, None)
      }

      def assign(node: BDDNode, l: Double, r: Double): Unit = {
        val id = zoneNodeId(prefix, node)
        if (!positions.contains(id)) {
          val x = (((l + r) / 2.0) - (leafCount / 2.0)) * XGap + xOffset
          positions(id) = CyPos(x, levelY(node, vars))

          val (low, high) = childPair(node)
          val mid = (l + r) / 2.0
          low.foreach(assign(_, l, mid))
          high.foreach(assign(_, mid, r))
        }
      }

      def ensureNode(node: BDDNode): String = {
        val id = zoneNodeId(prefix, node)
        if (!seenNodes.contains(id)) {
          seenNodes += id
          val pos = positions.getOrElse(id, CyPos(xOffset, levelY(node, vars)))
          node match {
            case Terminal(value, _, _, _) =>
              nodes += CyNode(
                data = CyNodeData(id, if (placeholders.contains(nodeKey(node))) "" else if (value) "1" else "0"),
                classes = mergeClasses(
                  "terminal",
                  "apply-zone",
                  zoneClass,
                  if (ghost.contains(nodeKey(node))) "apply-ghost" else "",
                  if (placeholders.contains(nodeKey(node))) "apply-slot" else ""
                ),
                position = pos
              )
            case NonTerminal(_, _, _, _, _, _) =>
              nodes += CyNode(
                data = CyNodeData(id, if (placeholders.contains(nodeKey(node))) "" else labelOf(node, vars)),
                classes = mergeClasses(
                  "apply-zone",
                  zoneClass,
                  if (ghost.contains(nodeKey(node))) "apply-ghost" else "",
                  if (ghost.contains(nodeKey(node))) "apply-pending" else "",
                  if (placeholders.contains(nodeKey(node))) "apply-slot" else ""
                ),
                position = pos
              )
          }
        }
        id
      }

      def addEdge(source: String, target: String, label: String, edgeClass: String): Unit = {
        val id = s"e_${source}_${label}_${target}"
        if (!seenEdges.contains(id)) {
          seenEdges += id
          edges += CyEdge(
            data = CyEdgeData(id, source, target, label),
            classes = mergeClasses(edgeClass, zoneClass)
          )
        }
      }

      def go(node: BDDNode): Unit = {
        val id = ensureNode(node)
        val (low, high) = childPair(node)
        low.foreach { child =>
          val childId = ensureNode(child)
          addEdge(id, childId, "0", "zero")
          go(child)
        }
        high.foreach { child =>
          val childId = ensureNode(child)
          addEdge(id, childId, "1", "one")
          go(child)
        }
      }

      rootOpt.foreach(assign(_, 0.0, leafCount))
      rootOpt.foreach(go)
      ZoneRender(CyElements(nodes.toList, edges.toList), positions.toMap)
    }
  }

  private def buildPairPreviewElements(
    previews: List[PairPreview],
    vars: Vector[String],
    resultPositions: Map[String, CyPos]
  ): CyElements = {
    val nodes = mutable.ListBuffer.empty[CyNode]
    val seen = mutable.HashSet.empty[String]

    previews.foreach { preview =>
      val anchorId = zoneNodeId("M", preview.anchor)
      resultPositions.get(anchorId).foreach { center =>
        val leftId = pairNodeId(preview.anchor, "L")
        if (!seen.contains(leftId)) {
          seen += leftId
          nodes += CyNode(
            data = CyNodeData(leftId, labelOf(preview.leftRef, vars)),
            classes = mergeClasses("apply-pair", "apply-pair-left"),
            position = CyPos(center.x - PairOffsetX, center.y + PairOffsetY)
          )
        }

        val rightId = pairNodeId(preview.anchor, "R")
        if (!seen.contains(rightId)) {
          seen += rightId
          nodes += CyNode(
            data = CyNodeData(rightId, labelOf(preview.rightRef, vars)),
            classes = mergeClasses("apply-pair", "apply-pair-right"),
            position = CyPos(center.x + PairOffsetX, center.y + PairOffsetY)
          )
        }
      }
    }

    CyElements(nodes.toList, Nil)
  }

  private def combineScenes(parts: CyElements*): CyElements =
    CyElements(parts.toList.flatMap(_.nodes), parts.toList.flatMap(_.edges))

  private def scene(
    left: BDDNode,
    result: Option[BDDNode],
    right: BDDNode,
    vars: Vector[String],
    partial: Map[String, PartialChildren] = Map.empty,
    ghost: Set[String] = Set.empty,
    placeholders: Set[String] = Set.empty,
    previews: List[PairPreview] = Nil
  ): CyElements = {
    val (leftX, midX, rightX) = zoneOffsets(vars.length)
    val leftZone = buildZoneElements(Some(left), "L", "apply-left", vars, leftX)
    val resultZone = buildZoneElements(result, "M", "apply-result", vars, midX, partial, ghost, placeholders)
    val rightZone = buildZoneElements(Some(right), "R", "apply-right", vars, rightX)
    val previewZone = buildPairPreviewElements(previews, vars, resultZone.positions)
    combineScenes(leftZone.elements, resultZone.elements, previewZone, rightZone.elements)
  }

  def initialSnapshot(left: BDDNode, right: BDDNode, vars: Vector[String]): CyElements =
    scene(left, None, right, vars)

  private def branchPath(parent: String, bit: String): String =
    if (parent.isEmpty) bit else s"$parent.$bit"

  private def stableNodeId(path: String): String =
    path.replace('.', '_')

  private def midNodeId(path: String): String =
    s"M-m_${stableNodeId(path)}"

  private def slotNodeIds(path: String): List[String] = List(midNodeId(path))

  private def pairNodeIds(path: String): List[String] = {
    val sid = stableNodeId(path)
    List(s"P-m_${sid}-L", s"P-m_${sid}-R")
  }

  private def cyEdgeId(source: String, label: String, target: String): String =
    s"e_${source}_${label}_${target}"

  private def freshResolvedTerminal(path: String, value: Boolean): Terminal = {
    val t = Terminal(value)
    t.uid = s"m_${stableNodeId(path)}"
    t
  }

  private def freshResolvedNonTerminal(path: String, index: Int): NonTerminal = {
    val stub = Terminal(false)
    val nt = NonTerminal(index = index, low = stub, high = stub)
    nt.uid = s"m_${stableNodeId(path)}"
    nt
  }

  private def freshSlotTerminal(path: String, value: Boolean): Terminal = {
    val t = Terminal(value)
    t.uid = s"m_${stableNodeId(path)}"
    t
  }

  private def freshSlotNonTerminal(path: String, index: Int): NonTerminal = {
    val stub = Terminal(false)
    val nt = NonTerminal(index = index, low = stub, high = stub)
    nt.uid = s"m_${stableNodeId(path)}"
    nt
  }

  private def buildInteractiveState(
    left: BDDNode,
    right: BDDNode,
    op: Operator,
    vars: Vector[String],
    revealedPaths: Set[String],
    resolvedPaths: Set[String],
    expandedPaths: Set[String]
  ): InteractiveState = {
    val revealed = revealedPaths ++ resolvedPaths ++ expandedPaths
    val resolved = resolvedPaths ++ expandedPaths
    val expanded = expandedPaths
    val partial = mutable.HashMap.empty[String, PartialChildren]
    val ghost = mutable.HashSet.empty[String]
    val placeholders = mutable.HashSet.empty[String]
    val previews = mutable.ArrayBuffer.empty[PairPreview]
    val branches = mutable.ListBuffer.empty[ApplyBranch]
    val blocked = mutable.HashSet.empty[String]

    def classify(x: BDDNode, y: BDDNode): ApplyCase = (x, y) match {
      case (Terminal(_, _, _, _), Terminal(_, _, _, _)) =>
        ApplyCase.TerminalCase
      case (NonTerminal(ix, _, _, _, _, _), NonTerminal(iy, _, _, _, _, _)) if ix == iy =>
        ApplyCase.SameLevelCase
      case _ =>
        val ix = indexOf(x, vars.length)
        val iy = indexOf(y, vars.length)
        if (ix <= iy) ApplyCase.SmallerLeftCase else ApplyCase.SmallerRightCase
    }

    def caseKeyOf(c: ApplyCase): String = c match {
      case ApplyCase.TerminalCase     => "case1"
      case ApplyCase.SameLevelCase    => "case2"
      case ApplyCase.SmallerLeftCase  => "case3"
      case ApplyCase.SmallerRightCase => "case4"
    }

    def pairSideId(path: String, side: String): String =
      if (side == "left") pairNodeIds(path).head else pairNodeIds(path).last

    def parentPath(path: String): String = path.split('.').dropRight(1).mkString(".")

    def parentEdgeId(path: String): String = {
      val bit = path.split('.').lastOption.getOrElse("0")
      cyEdgeId(midNodeId(parentPath(path)), bit, midNodeId(path))
    }

    def previewRevealIds(x: BDDNode, y: BDDNode, path: String): (List[String], List[String], List[String]) =
      classify(x, y) match {
        case ApplyCase.SameLevelCase | ApplyCase.TerminalCase =>
          val all = List(parentEdgeId(path), midNodeId(path))
          (all, Nil, all)
        case ApplyCase.SmallerLeftCase =>
          (
            List(parentEdgeId(path), pairSideId(path, "left")),
            List(pairSideId(path, "right")),
            List(parentEdgeId(path)) ++ pairNodeIds(path)
          )
        case ApplyCase.SmallerRightCase =>
          (
            List(parentEdgeId(path), pairSideId(path, "right")),
            List(pairSideId(path, "left")),
            List(parentEdgeId(path)) ++ pairNodeIds(path)
          )
      }

    def branchMeta(x: BDDNode, y: BDDNode, path: String, nodeIds: List[String], phase: String): ApplyBranch = {
      val c = classify(x, y)
      val compareIds = List(zoneNodeId("L", x), zoneNodeId("R", y)).distinct
      val revealId = midNodeId(path)

      c match {
        case ApplyCase.TerminalCase =>
          ApplyBranch(
            path = path,
            nodeIds = nodeIds,
            phase = phase,
            caseKey = caseKeyOf(c),
            compareIds = compareIds,
            revealNodeId = Some(revealId)
          )

        case ApplyCase.SameLevelCase =>
          val lowPath = branchPath(path, "0")
          val highPath = branchPath(path, "1")
          val leftNt = x.asInstanceOf[NonTerminal]
          val rightNt = y.asInstanceOf[NonTerminal]
          val lowProblem = (leftNt.low, rightNt.low)
          val highProblem = (leftNt.high, rightNt.high)
          val (lowPrimaryReveal, lowSecondaryReveal, lowReveal) = previewRevealIds(lowProblem._1, lowProblem._2, lowPath)
          val (highPrimaryReveal, highSecondaryReveal, highReveal) = previewRevealIds(highProblem._1, highProblem._2, highPath)
          ApplyBranch(
            path = path,
            nodeIds = nodeIds,
            phase = phase,
            caseKey = caseKeyOf(c),
            compareIds = compareIds,
            revealNodeId = Some(revealId),
            lowPrimaryFocusIds = List(zoneNodeId("L", leftNt.low), zoneNodeId("R", rightNt.low)).distinct,
            highPrimaryFocusIds = List(zoneNodeId("L", leftNt.high), zoneNodeId("R", rightNt.high)).distinct,
            lowPrimaryRevealIds = lowPrimaryReveal,
            lowSecondaryRevealIds = lowSecondaryReveal,
            highPrimaryRevealIds = highPrimaryReveal,
            highSecondaryRevealIds = highSecondaryReveal,
            lowRevealIds = lowReveal,
            highRevealIds = highReveal
          )

        case ApplyCase.SmallerLeftCase =>
          val leftNt = x.asInstanceOf[NonTerminal]
          val leftId = zoneNodeId("L", x)
          val rightId = zoneNodeId("R", y)
          val lowTargetId = zoneNodeId("L", leftNt.low)
          val highTargetId = zoneNodeId("L", leftNt.high)
          val lowPath = branchPath(path, "0")
          val highPath = branchPath(path, "1")
          val lowProblem = (leftNt.low, y)
          val highProblem = (leftNt.high, y)
          val (lowPrimaryReveal, lowSecondaryReveal, lowReveal) = previewRevealIds(lowProblem._1, lowProblem._2, lowPath)
          val (highPrimaryReveal, highSecondaryReveal, highReveal) = previewRevealIds(highProblem._1, highProblem._2, highPath)
          ApplyBranch(
            path = path,
            nodeIds = nodeIds,
            phase = phase,
            caseKey = caseKeyOf(c),
            compareIds = compareIds,
            lowPrimaryFocusIds = List(leftId, cyEdgeId(leftId, "0", lowTargetId), lowTargetId).distinct,
            lowSecondaryFocusIds = List(rightId),
            highPrimaryFocusIds = List(leftId, cyEdgeId(leftId, "1", highTargetId), highTargetId).distinct,
            highSecondaryFocusIds = List(rightId),
            lowFocusIds = List(leftId, cyEdgeId(leftId, "0", lowTargetId), lowTargetId, rightId).distinct,
            highFocusIds = List(leftId, cyEdgeId(leftId, "1", highTargetId), highTargetId, rightId).distinct,
            revealNodeId = Some(revealId),
            lowPrimaryRevealIds = lowPrimaryReveal,
            lowSecondaryRevealIds = lowSecondaryReveal,
            highPrimaryRevealIds = highPrimaryReveal,
            highSecondaryRevealIds = highSecondaryReveal,
            lowRevealIds = lowReveal,
            highRevealIds = highReveal
          )

        case ApplyCase.SmallerRightCase =>
          val rightNt = y.asInstanceOf[NonTerminal]
          val leftId = zoneNodeId("L", x)
          val rightId = zoneNodeId("R", y)
          val lowTargetId = zoneNodeId("R", rightNt.low)
          val highTargetId = zoneNodeId("R", rightNt.high)
          val lowPath = branchPath(path, "0")
          val highPath = branchPath(path, "1")
          val lowProblem = (x, rightNt.low)
          val highProblem = (x, rightNt.high)
          val (lowPrimaryReveal, lowSecondaryReveal, lowReveal) = previewRevealIds(lowProblem._1, lowProblem._2, lowPath)
          val (highPrimaryReveal, highSecondaryReveal, highReveal) = previewRevealIds(highProblem._1, highProblem._2, highPath)
          ApplyBranch(
            path = path,
            nodeIds = nodeIds,
            phase = phase,
            caseKey = caseKeyOf(c),
            compareIds = compareIds,
            lowPrimaryFocusIds = List(rightId, cyEdgeId(rightId, "0", lowTargetId), lowTargetId).distinct,
            lowSecondaryFocusIds = List(leftId),
            highPrimaryFocusIds = List(rightId, cyEdgeId(rightId, "1", highTargetId), highTargetId).distinct,
            highSecondaryFocusIds = List(leftId),
            lowFocusIds = List(rightId, cyEdgeId(rightId, "0", lowTargetId), lowTargetId, leftId).distinct,
            highFocusIds = List(rightId, cyEdgeId(rightId, "1", highTargetId), highTargetId, leftId).distinct,
            revealNodeId = Some(revealId),
            lowPrimaryRevealIds = lowPrimaryReveal,
            lowSecondaryRevealIds = lowSecondaryReveal,
            highPrimaryRevealIds = highPrimaryReveal,
            highSecondaryRevealIds = highSecondaryReveal,
            lowRevealIds = lowReveal,
            highRevealIds = highReveal
          )
      }
    }

    def markBlocked(node: BDDNode): Unit = {
      blocked += nodeKey(node)
      partial(nodeKey(node)) = PartialChildren()
    }

    def addPlaceholder(slot: BDDNode, x: BDDNode, y: BDDNode, path: String): Unit = {
      placeholders += nodeKey(slot)
      markBlocked(slot)
      branches += branchMeta(x, y, path, slotNodeIds(path), phase = "reveal")
    }

    def addPairPreview(anchor: BDDNode, x: BDDNode, y: BDDNode, path: String): Unit = {
      ghost += nodeKey(anchor)
      markBlocked(anchor)
      previews += PairPreview(anchor, x, y, path)
      branches += branchMeta(x, y, path, pairNodeIds(path), phase = "resolve")
    }

    def addDirectPreview(node: BDDNode, x: BDDNode, y: BDDNode, path: String, clickable: Boolean): Unit = {
      if (clickable) branches += branchMeta(x, y, path, slotNodeIds(path), phase = "expand")
    }

    def addExpandBranch(x: BDDNode, y: BDDNode, path: String): Unit =
      branches += branchMeta(x, y, path, List(midNodeId(path)), phase = "expand")

    def unresolvedPreview(problem: (BDDNode, BDDNode), path: String): BDDNode = problem match {
      case (a: Terminal, b: Terminal) =>
        val t = freshResolvedTerminal(path, op.eval(a.value, b.value))
        addDirectPreview(t, a, b, path, clickable = false)
        t
      case (a, b) =>
        classify(a, b) match {
          case ApplyCase.SameLevelCase =>
            val index = indexOf(a, vars.length)
            val nt = freshResolvedNonTerminal(path, index)
            markBlocked(nt)
            addDirectPreview(nt, a, b, path, clickable = true)
            nt
          case _ =>
            val nt = freshResolvedNonTerminal(path, math.min(indexOf(a, vars.length), indexOf(b, vars.length)))
            addPairPreview(nt, a, b, path)
            nt
        }
    }

    def unresolvedNode(problem: (BDDNode, BDDNode), path: String): BDDNode = problem match {
      case (a: Terminal, b: Terminal) =>
        val t = freshSlotTerminal(path, op.eval(a.value, b.value))
        addPlaceholder(t, a, b, path)
        t
      case (a, b) =>
        val nt = freshSlotNonTerminal(path, math.min(indexOf(a, vars.length), indexOf(b, vars.length)))
        addPlaceholder(nt, a, b, path)
        nt
    }

    def expandTerminalCase(a: Terminal, b: Terminal, path: String): BDDNode =
      freshResolvedTerminal(path, op.eval(a.value, b.value))

    def previewOnlyNode(x: BDDNode, y: BDDNode, path: String): BDDNode = (x, y) match {
      case (a: Terminal, b: Terminal) =>
        freshResolvedTerminal(path, op.eval(a.value, b.value))
      case _ =>
        classify(x, y) match {
          case ApplyCase.SameLevelCase =>
            val current = freshResolvedNonTerminal(path, indexOf(x, vars.length))
            markBlocked(current)
            addExpandBranch(x, y, path)
            current
          case ApplyCase.SmallerLeftCase | ApplyCase.SmallerRightCase =>
            val current = freshResolvedNonTerminal(path, math.min(indexOf(x, vars.length), indexOf(y, vars.length)))
            addPairPreview(current, x, y, path)
            current
          case ApplyCase.TerminalCase =>
            freshResolvedTerminal(path, op.eval(x.asInstanceOf[Terminal].value, y.asInstanceOf[Terminal].value))
        }
    }

    def resolvedOnlyNode(x: BDDNode, y: BDDNode, path: String): BDDNode = classify(x, y) match {
      case ApplyCase.TerminalCase =>
        freshResolvedTerminal(path, op.eval(x.asInstanceOf[Terminal].value, y.asInstanceOf[Terminal].value))
      case ApplyCase.SameLevelCase =>
        val current = freshResolvedNonTerminal(path, indexOf(x, vars.length))
        markBlocked(current)
        addExpandBranch(x, y, path)
        current
      case ApplyCase.SmallerLeftCase | ApplyCase.SmallerRightCase =>
        val current = freshResolvedNonTerminal(path, math.min(indexOf(x, vars.length), indexOf(y, vars.length)))
        markBlocked(current)
        addExpandBranch(x, y, path)
        current
    }

    def buildPath(x: BDDNode, y: BDDNode, path: String, allowPlaceholder: Boolean): BDDNode =
      if (!revealed.contains(path)) {
        if (allowPlaceholder) unresolvedNode((x, y), path) else unresolvedPreview((x, y), path)
      } else if (!resolved.contains(path)) {
        previewOnlyNode(x, y, path)
      } else if (!expanded.contains(path)) {
        resolvedOnlyNode(x, y, path)
      } else {
        buildExpanded(x, y, path)
      }

    def expandSameLevelCase(x: BDDNode, y: BDDNode, path: String): BDDNode = {
      val index = indexOf(x, vars.length)
      val leftNt = x.asInstanceOf[NonTerminal]
      val rightNt = y.asInstanceOf[NonTerminal]
      val current = freshResolvedNonTerminal(path, index)
      val lowPath = branchPath(path, "0")
      val highPath = branchPath(path, "1")

      val lowProblem = (leftNt.low, rightNt.low)
      val highProblem = (leftNt.high, rightNt.high)
      current.low = buildPath(lowProblem._1, lowProblem._2, lowPath, allowPlaceholder = false)
      current.high = buildPath(highProblem._1, highProblem._2, highPath, allowPlaceholder = false)
      current
    }

    def expandSmallerLabelCase(x: BDDNode, y: BDDNode, path: String, smallerSide: String): BDDNode = {
      val (index, lowProblem, highProblem) =
        if (smallerSide == "left") {
          val leftNt = x.asInstanceOf[NonTerminal]
          (leftNt.index, (leftNt.low, y), (leftNt.high, y))
        } else {
          val rightNt = y.asInstanceOf[NonTerminal]
          (rightNt.index, (x, rightNt.low), (x, rightNt.high))
        }

      val current = freshResolvedNonTerminal(path, index)
      val lowPath = branchPath(path, "0")
      val highPath = branchPath(path, "1")

      current.low = buildPath(lowProblem._1, lowProblem._2, lowPath, allowPlaceholder = false)
      current.high = buildPath(highProblem._1, highProblem._2, highPath, allowPlaceholder = false)
      current
    }

    def buildExpanded(x: BDDNode, y: BDDNode, path: String): BDDNode = {
      classify(x, y) match {
        case ApplyCase.TerminalCase =>
          expandTerminalCase(x.asInstanceOf[Terminal], y.asInstanceOf[Terminal], path)
        case ApplyCase.SameLevelCase =>
          expandSameLevelCase(x, y, path)
        case ApplyCase.SmallerLeftCase =>
          expandSmallerLabelCase(x, y, path, smallerSide = "left")
        case ApplyCase.SmallerRightCase =>
          expandSmallerLabelCase(x, y, path, smallerSide = "right")
      }
    }

    def buildFinal(x: BDDNode, y: BDDNode, path: String): BDDNode =
      classify(x, y) match {
        case ApplyCase.TerminalCase =>
          freshResolvedTerminal(path, op.eval(x.asInstanceOf[Terminal].value, y.asInstanceOf[Terminal].value))

        case ApplyCase.SameLevelCase =>
          val current = freshResolvedNonTerminal(path, indexOf(x, vars.length))
          val leftNt = x.asInstanceOf[NonTerminal]
          val rightNt = y.asInstanceOf[NonTerminal]
          current.low = buildFinal(leftNt.low, rightNt.low, branchPath(path, "0"))
          current.high = buildFinal(leftNt.high, rightNt.high, branchPath(path, "1"))
          current

        case ApplyCase.SmallerLeftCase =>
          val leftNt = x.asInstanceOf[NonTerminal]
          val current = freshResolvedNonTerminal(path, leftNt.index)
          current.low = buildFinal(leftNt.low, y, branchPath(path, "0"))
          current.high = buildFinal(leftNt.high, y, branchPath(path, "1"))
          current

        case ApplyCase.SmallerRightCase =>
          val rightNt = y.asInstanceOf[NonTerminal]
          val current = freshResolvedNonTerminal(path, rightNt.index)
          current.low = buildFinal(x, rightNt.low, branchPath(path, "0"))
          current.high = buildFinal(x, rightNt.high, branchPath(path, "1"))
          current
      }

    InteractiveState(
      left = left,
      right = right,
      vars = vars,
      currentRoot = buildPath(left, right, "root", allowPlaceholder = true),
      finalRoot = buildFinal(left, right, "root"),
      blockedUids = blocked.toSet,
      partial = partial.toMap,
      ghost = ghost.toSet,
      placeholders = placeholders.toSet,
      previews = previews.toList,
      branches = branches.toList.sortBy(_.path)
    )
  }

  private def renderInteractiveSnapshot(state: InteractiveState, resultRoot: BDDNode): CyElements =
    scene(
      state.left,
      Some(resultRoot),
      state.right,
      state.vars,
      state.partial,
      state.ghost,
      state.placeholders,
      state.previews
    )

  private def branchesForSnapshot(branches: List[ApplyBranch], snapshot: CyElements): List[ApplyBranch] = {
    val nodeIds = snapshot.nodes.map(_.data.id).toSet
    val allIds = nodeIds ++ snapshot.edges.map(_.data.id)

    def keepNodeIds(ids: List[String]): List[String] =
      ids.filter(nodeIds.contains).distinct

    def keepAnyIds(ids: List[String]): List[String] =
      ids.filter(allIds.contains).distinct

    def normalizeIds(ids: List[String]): List[String] =
      ids.filter(_.nonEmpty).distinct

    branches.flatMap { br =>
      val filteredNodeIds = keepNodeIds(br.nodeIds)
      if (filteredNodeIds.isEmpty) None
      else {
        Some(
          br.copy(
            nodeIds = filteredNodeIds,
            compareIds = keepAnyIds(br.compareIds),
            lowPrimaryFocusIds = keepAnyIds(br.lowPrimaryFocusIds),
            lowSecondaryFocusIds = keepAnyIds(br.lowSecondaryFocusIds),
            highPrimaryFocusIds = keepAnyIds(br.highPrimaryFocusIds),
            highSecondaryFocusIds = keepAnyIds(br.highSecondaryFocusIds),
            lowFocusIds = keepAnyIds(br.lowFocusIds),
            highFocusIds = keepAnyIds(br.highFocusIds),
            revealNodeId = br.revealNodeId.filter(nodeIds.contains),
            // Keep reveal ids unfiltered so frontend can stage-hide future nodes/pairs by id
            // before/while they appear across phase transitions.
            lowPrimaryRevealIds = normalizeIds(br.lowPrimaryRevealIds),
            lowSecondaryRevealIds = normalizeIds(br.lowSecondaryRevealIds),
            highPrimaryRevealIds = normalizeIds(br.highPrimaryRevealIds),
            highSecondaryRevealIds = normalizeIds(br.highSecondaryRevealIds),
            lowRevealIds = normalizeIds(br.lowRevealIds),
            highRevealIds = normalizeIds(br.highRevealIds)
          )
        )
      }
    }
  }

  private def encodeResultState(root: BDDNode): ApplyResultState = {
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

  private def decodeResultState(resultState: ApplyResultState): Option[BDDNode] = {
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

  private def pathBits(path: String): List[String] =
    path.split('.').toList.drop(1).filter(_.nonEmpty)

  private def nodeAtPath(root: BDDNode, path: String): Option[BDDNode] = {
    pathBits(path).foldLeft(Option(root)) {
      case (Some(nt: NonTerminal), "0") => Some(nt.low)
      case (Some(nt: NonTerminal), "1") => Some(nt.high)
      case _                            => None
    }
  }

  private def replaceSubtreeAtPath(root: BDDNode, path: String, replacement: BDDNode): BDDNode = {
    val bits = pathBits(path)
    if (bits.isEmpty) replacement
    else {
      def go(node: BDDNode, rest: List[String]): Unit = (node, rest) match {
        case (nt: NonTerminal, bit :: Nil) =>
          if (bit == "0") nt.low = replacement else nt.high = replacement
        case (nt: NonTerminal, bit :: tail) =>
          if (bit == "0") go(nt.low, tail) else go(nt.high, tail)
        case _ => ()
      }

      go(root, bits)
      root
    }
  }

  private def currentRootForSnapshot(
    state: InteractiveState,
    resultState: Option[ApplyResultState],
    advancePath: Option[String]
  ): BDDNode = {
    val rawRoot = state.currentRoot
    resultState.flatMap(decodeResultState) match {
      case Some(existingRoot) =>
        advancePath.flatMap(path => nodeAtPath(rawRoot, path).map(replacement => replaceSubtreeAtPath(existingRoot, path, replacement)))
          .getOrElse(existingRoot)
      case None =>
        rawRoot
    }
  }

  private def visibleResultNodeUids(root: BDDNode, snapshotOf: BDDNode => CyElements): Set[String] =
    snapshotOf(root).nodes.collect {
      case node
          if String.valueOf(node.classes.getOrElse("")).contains("apply-result") &&
            !String.valueOf(node.classes.getOrElse("")).contains("apply-slot") &&
            !String.valueOf(node.classes.getOrElse("")).contains("apply-ghost") &&
            node.data.id.startsWith("M-") =>
        node.data.id.stripPrefix("M-")
    }.toSet

  private def visibleRealTerminalUids(
    root: BDDNode,
    snapshotOf: BDDNode => CyElements,
    allowedNodeUids: Set[String]
  ): Set[String] =
    snapshotOf(root).nodes.collect {
      case node
          if String.valueOf(node.classes.getOrElse("")).contains("apply-result") &&
            !String.valueOf(node.classes.getOrElse("")).contains("apply-slot") &&
            !String.valueOf(node.classes.getOrElse("")).contains("apply-ghost") &&
            (
              String.valueOf(node.classes.getOrElse("")).contains("terminal") ||
                node.data.label == "0" ||
                node.data.label == "1"
            ) &&
            node.data.id.startsWith("M-") =>
        node.data.id.stripPrefix("M-")
    }.toSet.intersect(allowedNodeUids)

  private def buildFinalResultZone(state: InteractiveState, appliedReductions: List[String]): ZoneRender = {
    val reducedFinalRoot = ReduceSnap.applyAlreadyApplied(state.finalRoot, appliedReductions)
    val (_, midX, _) = zoneOffsets(state.vars.length)
    buildZoneElements(
      Some(reducedFinalRoot),
      "M",
      "apply-result",
      state.vars,
      midX
    )
  }

  def interactiveScene(
    left: BDDNode,
    right: BDDNode,
    op: Operator,
    vars: Vector[String],
    revealedPaths: Set[String],
    resolvedPaths: Set[String],
    expandedPaths: Set[String],
    appliedReductions: List[String] = Nil,
    resultState: Option[ApplyResultState] = None,
    advancePath: Option[String] = None,
    advancePhase: Option[String] = None
  ): ApplyTraceResp = {
    val state = buildInteractiveState(left, right, op, vars, revealedPaths, resolvedPaths, expandedPaths)
    val currentRoot =
      if (resultState.nonEmpty) currentRootForSnapshot(state, resultState, advancePath)
      else ReduceSnap.applyAlreadyApplied(state.currentRoot, appliedReductions, state.blockedUids)
    val snap = renderInteractiveSnapshot(state, currentRoot)
    val finalResultZone = buildFinalResultZone(state, appliedReductions)

    ApplyTraceResp(
      snapshot = snap,
      branches = branchesForSnapshot(state.branches, snap),
      finalResultPositions = finalResultZone.positions,
      finalResultSnapshot = finalResultZone.elements,
      resultState = Some(encodeResultState(currentRoot))
    )
  }

  def reduceInteractiveScene(
    left: BDDNode,
    right: BDDNode,
    op: Operator,
    vars: Vector[String],
    revealedPaths: Set[String],
    resolvedPaths: Set[String],
    expandedPaths: Set[String],
    appliedReductions: List[String],
    kind: String,
    resultState: Option[ApplyResultState] = None,
    visibleResultNodeIds: Set[String] = Set.empty
  ): ReduceSnapTraceResp = {
    val state = buildInteractiveState(left, right, op, vars, revealedPaths, resolvedPaths, expandedPaths)
    val initiallyVisibleNodeUids = visibleResultNodeIds.collect {
      case id if id.startsWith("M-") => id.stripPrefix("M-")
    }
    val currentRoot =
      resultState.flatMap(decodeResultState)
        .getOrElse(ReduceSnap.applyAlreadyApplied(state.currentRoot, appliedReductions, state.blockedUids))
    val snapshotOf = (root: BDDNode) => renderInteractiveSnapshot(state, root)
    val stateOf = (root: BDDNode) => Some(encodeResultState(root))
    val visibleNodeUidsOf = (root: BDDNode) =>
      if (initiallyVisibleNodeUids.nonEmpty) initiallyVisibleNodeUids
      else visibleResultNodeUids(root, snapshotOf)
    val blockedUidsOf = (root: BDDNode) => {
      val visible = visibleNodeUidsOf(root)
      // Visible apply-result nodes are unblocked even when introduced only in
      // preview/resolve phases. Hidden nodes remain blocked so reduction stays
      // scoped to the visible subtree.
      (state.blockedUids -- visible) ++ (visibleResultNodeUids(root, snapshotOf) -- visible)
    }
    val forceTerminalUidsOf = (root: BDDNode) => visibleRealTerminalUids(root, snapshotOf, visibleNodeUidsOf(root))
    // Capture the true pre-reduction state BEFORE trace builders mutate the working graph in place.
    val initial = snapshotOf(currentRoot)
    val initialResultState = Some(encodeResultState(currentRoot))
    val rawSteps = kind match {
      case "terminals" => ReduceSnap.traceTerminalsWithSnapshot(currentRoot, snapshotOf, blockedUidsOf(currentRoot), stateOf, forceTerminalUidsOf)
      case "redundant" => ReduceSnap.traceRedundantWithSnapshot(currentRoot, snapshotOf, blockedUidsOf(currentRoot), stateOf)
      case "merge"     => ReduceSnap.traceMergeWithSnapshot(currentRoot, snapshotOf, blockedUidsOf(currentRoot), stateOf)
      case _           => Nil
    }
    val toResultZoneId = (id: String) => if (id.startsWith("M-")) id else s"M-$id"
    val steps = rawSteps.map { step =>
      step.copy(
        focus = step.focus.map(toResultZoneId),
        batches = step.batches.map(_.map(_.map(toResultZoneId))),
        branches = branchesForSnapshot(state.branches, step.snapshot)
      )
    }

    ReduceSnapTraceResp(
      initial = initial,
      steps = steps,
      initialBranches = branchesForSnapshot(state.branches, initial),
      initialResultState = initialResultState
    )
  }
}
