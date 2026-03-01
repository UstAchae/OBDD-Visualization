// backend/src/main/scala/ReduceSnap.scala
object ReduceSnap {
  import BDDCore._
  import scala.collection.mutable

  // -----------------------------
  // graph utils
  // -----------------------------

  def dfsCollect(root: BDDNode): List[BDDNode] = {
    val seen = mutable.HashSet.empty[BDDNode]
    val out  = mutable.ListBuffer.empty[BDDNode]

    def go(v: BDDNode): Unit = {
      if (seen.contains(v)) return
      seen += v
      out += v
      v match {
        case NonTerminal(_, lo, hi, _, _, _) => go(lo); go(hi)
        case Terminal(_, _, _, _)            => ()
      }
    }

    go(root)
    out.toList
  }

  /** Deterministic stable ids for reachable graph: DFS, low then high. */
  def assignFreshIds(root: BDDNode): Unit = {
    val seen = mutable.HashSet.empty[BDDNode]
    var next = 0

    def go(v: BDDNode): Unit = {
      if (seen.contains(v)) return
      seen += v
      next += 1
      v.id = next
      v match {
        case NonTerminal(_, lo, hi, _, _, _) => go(lo); go(hi)
        case Terminal(_, _, _, _)            => ()
      }
    }

    go(root)
  }

  /** parents: child -> ListBuffer[(parent, isLowChild)] */
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
      if (seen.contains(v)) return
      seen += v
      v match {
        case p @ NonTerminal(_, lo, hi, _, _, _) =>
          add(lo, p, true)
          add(hi, p, false)
          go(lo); go(hi)
        case Terminal(_, _, _, _) => ()
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

  /** semantic key: terminals by value, non-terminals by identity */
  private def sk(n: BDDNode): (String, Int) = n match {
    case t: Terminal => ("T", if (t.value) 1 else 0)
    case _           => ("N", System.identityHashCode(n))
  }

  // -----------------------------
  // apply already applied steps
  // -----------------------------

  def applyAlreadyApplied(root0: BDDNode, applied: List[String]): BDDNode = {
    var root = root0
    applied.foreach {
      case "terminals" => root = applyTerminals(root)
      case "redundant" => root = applyRedundant(root)
      case "merge"     => root = applyMerge(root)
      case _           => ()
    }
    root
  }

  private def applyTerminals(root0: BDDNode): BDDNode = {
    var root = root0
    val terms = dfsCollect(root).collect { case t: Terminal => t }
    if (terms.isEmpty) return root

    val parents = buildParents(root)
    val falseRep = terms.find(!_.value).getOrElse(terms.head)
    val trueRep = terms.find(_.value).getOrElse(terms.head)

    terms.foreach { t =>
      val canon = if (t.value) trueRep else falseRep
      if (!(t eq canon)) {
        if (root eq t) root = canon
        replaceInParents(parents, t, canon)
      }
    }
    root
  }

  private def applyRedundant(root0: BDDNode): BDDNode = {
    var root = root0
    var changed = true

    while (changed) {
      changed = false
      val parents = buildParents(root)

      val redundant = dfsCollect(root).collect {
        case nt: NonTerminal if sk(nt.low) == sk(nt.high) => nt
      }

      if (redundant.nonEmpty) {
        redundant.foreach { nt =>
          val child = nt.low
          if (root eq nt) root = child
          replaceInParents(parents, nt, child)
        }
        changed = true
      }
    }
    root
  }

  private def applyMerge(root0: BDDNode): BDDNode = {
    var root = root0
    var changed = true

    while (changed) {
      changed = false
      val parents = buildParents(root)

      val nts = dfsCollect(root).collect { case nt: NonTerminal => nt }
      val levels = nts.map(_.index).distinct.sorted

      levels.foreach { level =>
        val layer = nts.filter(_.index == level).sortBy(_.uid)

        val grouped =
          layer
            .groupBy(nt => (sk(nt.low), sk(nt.high)))
            .toList
            .sortBy { case ((a, b), _) => (a.toString, b.toString) }
            .map { case (k, xs) => (k, xs.sortBy(_.uid)) }
            .filter { case (_, xs) => xs.size >= 2 }

        grouped.foreach { case (_, g) =>
          val keep = g.minBy(_.uid)
          val dups = g.filterNot(_ eq keep)

          if (dups.nonEmpty) {
            dups.foreach { d =>
              if (root eq d) root = keep
              replaceInParents(parents, d, keep)
            }
            changed = true
          }
        }
      }
    }

    root
  }

  // -----------------------------
  // Snapshot trace builders
  // IMPORTANT: DO NOT reassign ids in trace
  // -----------------------------

  def traceTerminals(rootStart: BDDNode, vars: Vector[String]): List[TraceSnapStep] = {
    var root = rootStart
    val out = mutable.ListBuffer.empty[TraceSnapStep]

    def collectByValue(r: BDDNode, value: Boolean): List[Terminal] =
      dfsCollect(r).collect { case t: Terminal if t.value == value => t }

    def canonicalizeOneValue(r0: BDDNode, value: Boolean): (BDDNode, List[String]) = {
      var r = r0
      val ts = collectByValue(r, value)
      if (ts.length <= 1) return (r, Nil)

      val focus = ts.map(BDDExport.cyIdOf) // ids BEFORE merge
      val parents = buildParents(r)
      val rep = ts.head
      ts.tail.foreach { t =>
        if (r eq t) r = rep
        replaceInParents(parents, t, rep)
      }
      (r, focus)
    }

    val zeros = collectByValue(root, value = false)
    if (zeros.length > 1) {
      val (r2, focus) = canonicalizeOneValue(root, value = false)
      root = r2
      out += TraceSnapStep(
        title = "Reduce terminals: merge 0 duplicates",
        focus = focus,
        snapshot = BDDExport.toCytoscape(root, vars)
      )
    }

    val ones = collectByValue(root, value = true)
    if (ones.length > 1) {
      val (r2, focus) = canonicalizeOneValue(root, value = true)
      root = r2
      out += TraceSnapStep(
        title = "Reduce terminals: merge 1 duplicates",
        focus = focus,
        snapshot = BDDExport.toCytoscape(root, vars)
      )
    }

    out.toList
  }

  def traceRedundant(rootStart: BDDNode, vars: Vector[String]): List[TraceSnapStep] = {
    var root = rootStart
    val out = mutable.ListBuffer.empty[TraceSnapStep]

    var changed = true
    var iter = 0
    val maxIters = 256

    while (changed && iter < maxIters) {
      iter += 1
      changed = false

      val parents = buildParents(root)
      val redundant = dfsCollect(root).collect {
        case nt: NonTerminal if sk(nt.low) == sk(nt.high) => nt
      }

      if (redundant.nonEmpty) {
        val focusIds = redundant.map(BDDExport.cyIdOf) // ids BEFORE removal

        redundant.foreach { nt =>
          val child = nt.low
          if (root eq nt) root = child
          replaceInParents(parents, nt, child)
        }

        out += TraceSnapStep(
          title = s"Reduce redundant tests: removed ${redundant.length} node(s)",
          focus = focusIds,
          snapshot = BDDExport.toCytoscape(root, vars)
        )

        changed = true
      }
    }

    out.toList
  }

  // backend/src/main/scala/ReduceSnap.scala
  def traceMerge(rootStart: BDDNode, vars: Vector[String]): List[TraceSnapStep] = {
    var root = rootStart
    val out = mutable.ListBuffer.empty[TraceSnapStep]

    var changed = true
    var iter = 0
    val maxIters = 128

    while (changed && iter < maxIters) {
      iter += 1
      changed = false

      val parents = buildParents(root)
      val nts = dfsCollect(root).collect { case nt: NonTerminal => nt }
      val levels = nts.map(_.index).distinct.sorted

      levels.foreach { level =>
        val layer = nts.filter(_.index == level)
        if (layer.length > 1) {
          val groups =
            layer.groupBy(nt => (sk(nt.low), sk(nt.high))).values.filter(_.size >= 2).toList

          if (groups.nonEmpty) {
            val batchesBuf = mutable.ListBuffer.empty[List[String]]
            val focusBuf = mutable.ListBuffer.empty[String]
            var mergedCount = 0

            groups.foreach { g =>
              val keep = g.minBy(_.uid)
              val dups = g.filterNot(_ eq keep)

              if (dups.nonEmpty) {
                // batch: keep first, then dups
                val batchIds = (keep +: dups).map(BDDExport.cyIdOf).toList
                batchesBuf += batchIds

                // keep old "focus" too (flattened)
                focusBuf ++= batchIds
                mergedCount += dups.length

                dups.foreach { d =>
                  if (root eq d) root = keep
                  replaceInParents(parents, d, keep)
                }

                changed = true
              }
            }

            if (mergedCount > 0) {
              out += TraceSnapStep(
                title = s"Merge non-terminals: level $level merged $mergedCount node(s)",
                focus = focusBuf.toList,
                snapshot = BDDExport.toCytoscape(root, vars),
                batches = Some(batchesBuf.toList)
              )
            }
          }
        }
      }
    }

    out.toList
  }
}