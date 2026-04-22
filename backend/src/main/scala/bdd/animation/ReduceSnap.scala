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
      if (!seen.contains(v)) {
        seen += v
        out += v
        v match {
          case NonTerminal(_, lo, hi, _, _, _) => go(lo); go(hi)
          case Terminal(_, _, _, _)            => ()
        }
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
      if (!seen.contains(v)) {
        seen += v
        next += 1
        v.id = next
        v match {
          case NonTerminal(_, lo, hi, _, _, _) => go(lo); go(hi)
          case Terminal(_, _, _, _)            => ()
        }
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

  /** semantic key: terminals by value, non-terminals by identity */
  private def sk(n: BDDNode): (String, Int) = n match {
    case t: Terminal => ("T", if (t.value) 1 else 0)
    case _           => ("N", System.identityHashCode(n))
  }

  private def reducibleMemo(root: BDDNode, blockedUids: Set[String]): mutable.HashMap[BDDNode, Boolean] = {
    val memo = mutable.HashMap.empty[BDDNode, Boolean]
    def go(v: BDDNode): Boolean = memo.getOrElseUpdate(
      v, {
        val blocked = blockedUids.contains(BDDExport.cyIdOf(v))
        if (blocked) false
        else
          v match {
            case Terminal(_, _, _, _)            => true
            case NonTerminal(_, lo, hi, _, _, _) => go(lo) && go(hi)
          }
      }
    )
    go(root)
    memo
  }

  private def skWithBlocked(
    n: BDDNode,
    blockedUids: Set[String],
    reducible: mutable.HashMap[BDDNode, Boolean]
  ): (String, Int) =
    if (!reducible.getOrElse(n, false)) ("N", System.identityHashCode(n))
    else sk(n)

  // -----------------------------
  // apply already applied steps
  // -----------------------------

  def applyAlreadyApplied(root0: BDDNode, applied: List[String]): BDDNode = {
    applyAlreadyApplied(root0, applied, Set.empty)
  }

  def applyAlreadyApplied(root0: BDDNode, applied: List[String], blockedUids: Set[String]): BDDNode = {
    var root = root0
    applied.foreach {
      case "terminals" => root = applyTerminals(root, blockedUids)
      case "redundant" => root = applyRedundant(root, blockedUids)
      case "merge"     => root = applyMerge(root, blockedUids)
      case _           => ()
    }
    root
  }

  private def applyTerminals(root0: BDDNode): BDDNode = {
    applyTerminals(root0, Set.empty)
  }

  private def applyTerminals(root0: BDDNode, blockedUids: Set[String]): BDDNode = {
    var root = root0
    val reducible = reducibleMemo(root, blockedUids)
    val terms = dfsCollect(root).collect { case t: Terminal if reducible.getOrElse(t, false) => t }
    if (terms.nonEmpty) {
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
    }
    root
  }

  private def applyRedundant(root0: BDDNode): BDDNode = {
    applyRedundant(root0, Set.empty)
  }

  private def applyRedundant(root0: BDDNode, blockedUids: Set[String]): BDDNode = {
    var root = root0
    var changed = true

    while (changed) {
      changed = false
      val parents = buildParents(root)
      val reducible = reducibleMemo(root, blockedUids)

      val redundant = dfsCollect(root).collect {
        case nt: NonTerminal
            if !blockedUids.contains(BDDExport.cyIdOf(nt)) &&
              skWithBlocked(nt.low, blockedUids, reducible) == skWithBlocked(nt.high, blockedUids, reducible) =>
          nt
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
    applyMerge(root0, Set.empty)
  }

  private def applyMerge(root0: BDDNode, blockedUids: Set[String]): BDDNode = {
    var root = root0
    var changed = true

    while (changed) {
      changed = false
      val parents = buildParents(root)
      val reducible = reducibleMemo(root, blockedUids)

      val nts = dfsCollect(root).collect { case nt: NonTerminal if reducible.getOrElse(nt, false) => nt }
      val levels = nts.map(_.index).distinct.sorted

      levels.foreach { level =>
        val layer = nts.filter(_.index == level).sortBy(_.uid)

        val grouped =
          layer
            .groupBy(nt => (skWithBlocked(nt.low, blockedUids, reducible), skWithBlocked(nt.high, blockedUids, reducible)))
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

  private def traceTerminalsWithSnapshotImpl(
    rootStart: BDDNode,
    snapshotOf: BDDNode => BDDExport.CyElements,
    blockedUids: Set[String],
    stateOf: BDDNode => Option[ApplyResultState] = (_: BDDNode) => None,
    forceReducibleUidsOf: BDDNode => Set[String] = (_: BDDNode) => Set.empty
  ): List[TraceSnapStep] = {
    var root = rootStart
    val out = mutable.ListBuffer.empty[TraceSnapStep]

    def collectByValue(r: BDDNode, value: Boolean): List[Terminal] = {
      val reducible = reducibleMemo(r, blockedUids)
      val forced = forceReducibleUidsOf(r)
      dfsCollect(r).collect {
        case t: Terminal
            if t.value == value && (reducible.getOrElse(t, false) || forced.contains(BDDExport.cyIdOf(t))) =>
          t
      }
    }

    def canonicalizeOneValue(r0: BDDNode, value: Boolean): (BDDNode, List[String]) = {
      var r = r0
      val ts = collectByValue(r, value)
      if (ts.length <= 1) (r, Nil)
      else {
        val focus = ts.map(BDDExport.cyIdOf)
        val parents = buildParents(r)
        val rep = ts.head
        ts.tail.foreach { t =>
          if (r eq t) r = rep
          replaceInParents(parents, t, rep)
        }
        (r, focus)
      }
    }

    val zeros = collectByValue(root, value = false)
    if (zeros.length > 1) {
      val (r2, focus) = canonicalizeOneValue(root, value = false)
      root = r2
      out += TraceSnapStep(
        title = "Reduce terminals: merge 0 duplicates",
        focus = focus,
        snapshot = snapshotOf(root),
        resultState = stateOf(root)
      )
    }

    val ones = collectByValue(root, value = true)
    if (ones.length > 1) {
      val (r2, focus) = canonicalizeOneValue(root, value = true)
      root = r2
      out += TraceSnapStep(
        title = "Reduce terminals: merge 1 duplicates",
        focus = focus,
        snapshot = snapshotOf(root),
        resultState = stateOf(root)
      )
    }

    out.toList
  }

  def traceTerminals(rootStart: BDDNode, vars: Vector[String]): List[TraceSnapStep] = {
    traceTerminalsWithSnapshotImpl(rootStart, (root) => BDDExport.toCytoscape(root, vars), Set.empty)
  }

  def traceTerminalsWithSnapshot(
    rootStart: BDDNode,
    snapshotOf: BDDNode => BDDExport.CyElements,
    blockedUids: Set[String],
    stateOf: BDDNode => Option[ApplyResultState] = (_: BDDNode) => None,
    forceReducibleUidsOf: BDDNode => Set[String] = (_: BDDNode) => Set.empty
  ): List[TraceSnapStep] =
    traceTerminalsWithSnapshotImpl(rootStart, snapshotOf, blockedUids, stateOf, forceReducibleUidsOf)

  /** Parents that would become redundant after removing n (same semantic as n.low on the other branch). */
  private def redundantPredecessors(
    n: NonTerminal,
    parents: mutable.HashMap[BDDNode, mutable.ListBuffer[(NonTerminal, Boolean)]]
  ): List[NonTerminal] = {
    val buf = parents.getOrElse(n, mutable.ListBuffer.empty)
    buf.collect { case (p: NonTerminal, isLow) =>
      val other = if (isLow) p.high else p.low
      if (sk(other) == sk(n.low)) p else null
    }.filter(_ != null).distinct.toList
  }

  private def redundantPredecessors(
    n: NonTerminal,
    parents: mutable.HashMap[BDDNode, mutable.ListBuffer[(NonTerminal, Boolean)]],
    blockedUids: Set[String],
    reducible: mutable.HashMap[BDDNode, Boolean]
  ): List[NonTerminal] = {
    val buf = parents.getOrElse(n, mutable.ListBuffer.empty)
    buf.collect { case (p: NonTerminal, isLow) =>
      val other = if (isLow) p.high else p.low
      if (
        reducible.getOrElse(p, false) &&
        skWithBlocked(other, blockedUids, reducible) == skWithBlocked(n.low, blockedUids, reducible)
      ) p else null
    }.filter(_ != null).distinct.toList
  }

  /** Expand redundant set to include full chains: nodes that become redundant after removing a child in the set. */
  private def expandRedundantChain(
    redundant: List[NonTerminal],
    parents: mutable.HashMap[BDDNode, mutable.ListBuffer[(NonTerminal, Boolean)]]
  ): List[NonTerminal] = {
    val seen = mutable.HashSet.empty[BDDNode]
    val queue = mutable.Queue.empty[NonTerminal]
    redundant.foreach { nt => seen += nt; queue.enqueue(nt) }
    while (queue.nonEmpty) {
      val n = queue.dequeue()
      redundantPredecessors(n, parents).foreach { p =>
        if (!seen.contains(p)) { seen += p; queue.enqueue(p) }
      }
    }
    seen.toList.collect { case nt: NonTerminal => nt }
  }

  private def expandRedundantChain(
    redundant: List[NonTerminal],
    parents: mutable.HashMap[BDDNode, mutable.ListBuffer[(NonTerminal, Boolean)]],
    blockedUids: Set[String],
    reducible: mutable.HashMap[BDDNode, Boolean]
  ): List[NonTerminal] = {
    val seen = mutable.HashSet.empty[BDDNode]
    val queue = mutable.Queue.empty[NonTerminal]
    redundant.foreach { nt => seen += nt; queue.enqueue(nt) }
    while (queue.nonEmpty) {
      val n = queue.dequeue()
      redundantPredecessors(n, parents, blockedUids, reducible).foreach { p =>
        if (!seen.contains(p)) { seen += p; queue.enqueue(p) }
      }
    }
    seen.toList.collect { case nt: NonTerminal => nt }
  }

  /** Topological order for removal: child before parent (remove bottom of chain first). */
  private def removalOrder(
    chain: List[NonTerminal],
    parents: mutable.HashMap[BDDNode, mutable.ListBuffer[(NonTerminal, Boolean)]]
  ): List[NonTerminal] = {
    def pred(n: NonTerminal) = redundantPredecessors(n, parents).filter(chain.contains)
    var remaining = chain.to(mutable.ListBuffer)
    val order = mutable.ListBuffer.empty[NonTerminal]
    var fallback = false
    while (remaining.nonEmpty) {
      val ready = remaining.filter(n => !remaining.exists(m => pred(m).contains(n)))
      if (ready.isEmpty) {
        fallback = true
        remaining.clear()
      } else {
        ready.foreach { n => order += n; remaining -= n }
      }
    }
    if (fallback) chain else order.toList
  }

  private def removalOrder(
    chain: List[NonTerminal],
    parents: mutable.HashMap[BDDNode, mutable.ListBuffer[(NonTerminal, Boolean)]],
    blockedUids: Set[String],
    reducible: mutable.HashMap[BDDNode, Boolean]
  ): List[NonTerminal] = {
    def pred(n: NonTerminal) = redundantPredecessors(n, parents, blockedUids, reducible).filter(chain.contains)
    var remaining = chain.to(mutable.ListBuffer)
    val order = mutable.ListBuffer.empty[NonTerminal]
    var fallback = false
    while (remaining.nonEmpty) {
      val ready = remaining.filter(n => !remaining.exists(m => pred(m).contains(n)))
      if (ready.isEmpty) {
        fallback = true
        remaining.clear()
      } else {
        ready.foreach { n => order += n; remaining -= n }
      }
    }
    if (fallback) chain else order.toList
  }

  private def traceRedundantWithSnapshotImpl(
    rootStart: BDDNode,
    snapshotOf: BDDNode => BDDExport.CyElements,
    blockedUids: Set[String],
    stateOf: BDDNode => Option[ApplyResultState] = (_: BDDNode) => None
  ): List[TraceSnapStep] = {
    var root = rootStart
    val out = mutable.ListBuffer.empty[TraceSnapStep]

    var changed = true
    var iter = 0
    val maxIters = 256

    while (changed && iter < maxIters) {
      iter += 1
      changed = false

      val parents = buildParents(root)
      val reducible = reducibleMemo(root, blockedUids)
      val redundant = dfsCollect(root).collect {
        case nt: NonTerminal
            if !blockedUids.contains(BDDExport.cyIdOf(nt)) &&
              skWithBlocked(nt.low, blockedUids, reducible) == skWithBlocked(nt.high, blockedUids, reducible) =>
          nt
      }

      if (redundant.nonEmpty) {
        val chain = expandRedundantChain(redundant, parents, blockedUids, reducible)
        val focusIds = chain.map(BDDExport.cyIdOf)
        val order = removalOrder(chain, parents, blockedUids, reducible)
        val replacementByUid = mutable.HashMap.empty[String, BDDNode]
        val focusIdSet = focusIds.toSet
        order.foreach { nt =>
          val child = nt.low
          val effectiveChild = child match {
            case c: NonTerminal =>
              val uid = BDDExport.cyIdOf(c)
              if (replacementByUid.contains(uid)) replacementByUid(uid) else child
            case _ => child
          }
          replacementByUid(BDDExport.cyIdOf(nt)) = effectiveChild
        }
        focusIds.foreach { uid =>
          var n = replacementByUid(uid)
          while (focusIdSet.contains(BDDExport.cyIdOf(n)) && replacementByUid.contains(BDDExport.cyIdOf(n))) {
            n = replacementByUid(BDDExport.cyIdOf(n))
          }
          replacementByUid(uid) = n
        }

        if (replacementByUid.contains(BDDExport.cyIdOf(root))) root = replacementByUid(BDDExport.cyIdOf(root))
        dfsCollect(root).collect { case p: NonTerminal => p }.foreach { p =>
          if (replacementByUid.contains(BDDExport.cyIdOf(p.low))) p.low = replacementByUid(BDDExport.cyIdOf(p.low))
          if (replacementByUid.contains(BDDExport.cyIdOf(p.high))) p.high = replacementByUid(BDDExport.cyIdOf(p.high))
        }

        out += TraceSnapStep(
          title = s"Reduce redundant tests: removed ${chain.length} node(s)",
          focus = focusIds,
          snapshot = snapshotOf(root),
          resultState = stateOf(root)
        )
        changed = true
      }
    }

    out.toList
  }

  def traceRedundant(rootStart: BDDNode, vars: Vector[String]): List[TraceSnapStep] = {
    traceRedundantWithSnapshotImpl(rootStart, (root) => BDDExport.toCytoscape(root, vars), Set.empty)
  }

  def traceRedundantWithSnapshot(
    rootStart: BDDNode,
    snapshotOf: BDDNode => BDDExport.CyElements,
    blockedUids: Set[String],
    stateOf: BDDNode => Option[ApplyResultState] = (_: BDDNode) => None
  ): List[TraceSnapStep] = traceRedundantWithSnapshotImpl(rootStart, snapshotOf, blockedUids, stateOf)

  private def traceMergeWithSnapshotImpl(
    rootStart: BDDNode,
    snapshotOf: BDDNode => BDDExport.CyElements,
    blockedUids: Set[String],
    stateOf: BDDNode => Option[ApplyResultState] = (_: BDDNode) => None
  ): List[TraceSnapStep] = {
    var root = rootStart
    val out = mutable.ListBuffer.empty[TraceSnapStep]

    var changed = true
    var iter = 0
    val maxIters = 128

    while (changed && iter < maxIters) {
      iter += 1
      changed = false

      val parents = buildParents(root)
      val reducible = reducibleMemo(root, blockedUids)
      val nts = dfsCollect(root).collect { case nt: NonTerminal if reducible.getOrElse(nt, false) => nt }
      val levels = nts.map(_.index).distinct.sorted

      levels.foreach { level =>
        val layer = nts.filter(_.index == level)
        if (layer.length > 1) {
          val groups =
            layer.groupBy(nt => (skWithBlocked(nt.low, blockedUids, reducible), skWithBlocked(nt.high, blockedUids, reducible)))
              .values
              .filter(_.size >= 2)
              .toList

          if (groups.nonEmpty) {
            val batchesBuf = mutable.ListBuffer.empty[List[String]]
            val focusBuf = mutable.ListBuffer.empty[String]
            var mergedCount = 0

            groups.foreach { g =>
              val keep = g.minBy(_.uid)
              val dups = g.filterNot(_ eq keep)

              if (dups.nonEmpty) {
                val batchIds = (keep +: dups).map(BDDExport.cyIdOf).toList
                batchesBuf += batchIds
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
                snapshot = snapshotOf(root),
                batches = Some(batchesBuf.toList),
                resultState = stateOf(root)
              )
            }
          }
        }
      }
    }

    out.toList
  }

  def traceMerge(rootStart: BDDNode, vars: Vector[String]): List[TraceSnapStep] = {
    traceMergeWithSnapshotImpl(rootStart, (root) => BDDExport.toCytoscape(root, vars), Set.empty)
  }

  def traceMergeWithSnapshot(
    rootStart: BDDNode,
    snapshotOf: BDDNode => BDDExport.CyElements,
    blockedUids: Set[String],
    stateOf: BDDNode => Option[ApplyResultState] = (_: BDDNode) => None
  ): List[TraceSnapStep] = traceMergeWithSnapshotImpl(rootStart, snapshotOf, blockedUids, stateOf)
}
