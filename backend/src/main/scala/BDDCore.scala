object BDDCore {

  // BDDNode = Terminal ∪ NonTerminal
  sealed trait BDDNode {
    var mark: Boolean
    var id: Int
  }

  final case class Terminal(value: Boolean, var id: Int = 0, var mark: Boolean = false) extends BDDNode

  final case class NonTerminal(
                                index: Int, // 1..n
                                var low: BDDNode,
                                var high: BDDNode,
                                var id: Int = 0,
                                var mark: Boolean = false
                              ) extends BDDNode

  trait Visitor {
    def onEnter(v: BDDNode): Unit
    def onExit(v: BDDNode): Unit = ()
  }

  def traverse(root: BDDNode, visitor: Visitor): Unit = {
    def go(v: BDDNode): Unit = {
      v.mark = !v.mark
      visitor.onEnter(v)

      v match {
        case NonTerminal(_, low, high, _, _) =>
          if (v.mark != low.mark) go(low)
          if (v.mark != high.mark) go(high)
        case Terminal(_, _, _) => ()
      }

      visitor.onExit(v)
    }
    go(root)
  }

  def reduce(root: BDDNode, n: Int): BDDNode = {
    val vlist = Array.fill(n + 2)(List.empty[BDDNode])

    traverse(root, new Visitor {
      def onEnter(v: BDDNode): Unit = {
        val idx = v match {
          case Terminal(_, _, _) => n + 1
          case NonTerminal(i, _, _, _, _) => i
        }
        vlist(idx) = v :: vlist(idx)
      }
    })

    // TODO: 你的 reduce 主逻辑还没写完，这里先不返回 subgraph(root.id)（否则会炸）
    // 暂时先原样返回 root，保证项目可跑
    root
  }
}
