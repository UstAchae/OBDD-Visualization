
import scala.collection.mutable

object BDDCore {

  // ---------------------------
  // Data structures
  // ---------------------------

  sealed trait BDDNode {
    var mark: Boolean
    var id: Int
    var uid: String
  }

  final case class Terminal(
    value: Boolean,
    var id: Int = 0,
    var mark: Boolean = false,
    var uid: String = ""
  ) extends BDDNode

  final case class NonTerminal(
    index: Int, // 1..n
    var low: BDDNode,
    var high: BDDNode,
    var id: Int = 0,
    var mark: Boolean = false,
    var uid: String = ""
  ) extends BDDNode

  // ---------------------------
  // Utilities
  // ---------------------------

  def collectReachable(root: BDDNode): List[BDDNode] = {
    val seen = mutable.HashSet.empty[BDDNode]
    val out  = mutable.ListBuffer.empty[BDDNode]

    def go(v: BDDNode): Unit =
      if (!seen.contains(v)) {
        seen += v; out += v
        v match {
          case NonTerminal(_, lo, hi, _, _, _) => go(lo); go(hi)
          case Terminal(_, _, _, _)            => ()
        }
      }

    go(root)
    out.toList
  }

  // ---------------------------
  // Traverse (DFS with mark flip) and Reduce → ROBDD
  // ---------------------------

  trait Visitor {
    def onEnter(v: BDDNode): Unit
    def onExit(v: BDDNode): Unit = ()
  }

  def Traverse(root: BDDNode, visitor: Visitor): Unit = {
    def go(v: BDDNode): Unit = {
      v.mark = !v.mark
      visitor.onEnter(v)

      v match {
        case NonTerminal(_, low, high, _, _, _) =>
          if (v.mark != low.mark) go(low)
          if (v.mark != high.mark) go(high)
        case Terminal(_, _, _, _) => ()
      }

      visitor.onExit(v)
    }

    go(root)
  }

  /** Sort/dedup key for each level's node list Q during Reduce (terminal value or low/high child ids). */
  private sealed trait Key
  private final case class TKey(value: Boolean) extends Key
  private final case class NKey(lowId: Int, highId: Int) extends Key

  private def keyOrder(a: Key, b: Key): Boolean = (a, b) match {
    case (TKey(x), TKey(y))           => (if (x) 1 else 0) < (if (y) 1 else 0)
    case (TKey(_), NKey(_, _))        => true
    case (NKey(_, _), TKey(_))        => false
    case (NKey(al, ah), NKey(bl, bh)) => if (al != bl) al < bl else ah < bh
  }

  /** Bottom-up reduction: merge redundant tests and identical subgraphs into a reduced ordered BDD. */
  def Reduce(v: BDDNode, varCount: Int): BDDNode = {
    val n = math.max(0, varCount)
    val subgraph = mutable.ArrayBuffer.empty[BDDNode]
    val vlist = Array.fill(n + 2)(List.empty[BDDNode])

    // Reserve index 0; reduced nodes get ids used as indices into `subgraph`.
    subgraph += Terminal(false, id = 0)

    Traverse(v, new Visitor {
      override def onEnter(node: BDDNode): Unit = {
        val idx = node match {
          case Terminal(_, _, _, _)          => n + 1
          case NonTerminal(i, _, _, _, _, _) => i
        }
        vlist(idx) = node :: vlist(idx)
      }
    })

    var nextid = 0
    var i = n + 1
    while (i >= 1) {
      val Q = mutable.ArrayBuffer.empty[(Key, BDDNode)]

      vlist(i).foreach {
        case t: Terminal =>
          Q += ((TKey(t.value), t))
        case nt: NonTerminal =>
          if (nt.low.id == nt.high.id) nt.id = nt.low.id
          else Q += ((NKey(nt.low.id, nt.high.id), nt))
      }

      val sorted = Q.sortWith { case ((ka, _), (kb, _)) => keyOrder(ka, kb) }
      var oldkey: Option[Key] = None

      sorted.foreach { case (key, u) =>
        oldkey match {
          case Some(ok) if ok == key =>
            u.id = nextid

          case _ =>
            nextid += 1
            u.id = nextid
            u match {
              case nt: NonTerminal =>
                nt.low = subgraph(nt.low.id)
                nt.high = subgraph(nt.high.id)
              case Terminal(_, _, _, _) => ()
            }
            subgraph += u
            oldkey = Some(key)
        }
      }

      i -= 1
    }

    val rid = v.id
    if (rid <= 0 || rid >= subgraph.length)
      throw new IllegalStateException(s"Reduce: invalid root id=$rid (subgraph size=${subgraph.length})")
    val out = subgraph(rid)
    collectReachable(out).foreach(_.mark = false)
    assignExportUids(out)
    out
  }

  sealed trait Operator {
    def eval(a: Boolean, b: Boolean): Boolean
  }

  case object And extends Operator {
    override def eval(a: Boolean, b: Boolean): Boolean = a && b
  }

  case object Nand extends Operator {
    override def eval(a: Boolean, b: Boolean): Boolean = !(a && b)
  }

  case object Or extends Operator {
    override def eval(a: Boolean, b: Boolean): Boolean = a || b
  }

  case object Nor extends Operator {
    override def eval(a: Boolean, b: Boolean): Boolean = !(a || b)
  }

  case object Xor extends Operator {
    override def eval(a: Boolean, b: Boolean): Boolean = a ^ b
  }

  case object Implies extends Operator {
    override def eval(a: Boolean, b: Boolean): Boolean = !a || b
  }

  case object Iff extends Operator {
    override def eval(a: Boolean, b: Boolean): Boolean = a == b
  }

  def parseOperator(raw: String): Option[Operator] =
    raw.trim.stripPrefix("<").stripSuffix(">").trim.toLowerCase match {
      case "and" | "&&" | "&" | "∧"          => Some(And)
      case "nand" | "↑" | "⊼"                => Some(Nand)
      case "or" | "||" | "|" | "∨"           => Some(Or)
      case "nor" | "↓" | "⊽"                 => Some(Nor)
      case "xor" | "^" | "⊕"                 => Some(Xor)
      case "implies" | "->" | "→"            => Some(Implies)
      case "iff" | "<->" | "↔"               => Some(Iff)
      case _                                 => None
    }

  /** Binary Apply: combine two ROBDDs with `op` (Shannon expansion), then Reduce the result. */
  def Apply(v1: BDDNode, v2: BDDNode, op: Operator, varCount: Int): BDDNode = {
    val n = math.max(0, varCount)
    val left = Reduce(v1, n)
    val right = Reduce(v2, n)
    val T = mutable.HashMap.empty[(Int, Int), BDDNode]

    def indexOf(v: BDDNode): Int = v match {
      case Terminal(_, _, _, _)            => n + 1
      case NonTerminal(index, _, _, _, _, _) => index
    }

    def ApplyStep(x: BDDNode, y: BDDNode): BDDNode = {
      T.getOrElseUpdate((x.id, y.id), {
        (x, y) match {
          case (Terminal(a, _, _, _), Terminal(b, _, _, _)) =>
            Terminal(op.eval(a, b))

          case _ =>
            val index = math.min(indexOf(x), indexOf(y))

            val (vlow1, vhigh1) = x match {
              case NonTerminal(i, low, high, _, _, _) if i == index => (low, high)
              case _ => (x, x)
            }

            val (vlow2, vhigh2) = y match {
              case NonTerminal(i, low, high, _, _, _) if i == index => (low, high)
              case _ => (y, y)
            }

            NonTerminal(
              index = index,
              low = ApplyStep(vlow1, vlow2),
              high = ApplyStep(vhigh1, vhigh2)
            )
        }
      })
    }

    Reduce(ApplyStep(left, right), n)
  }

  /**
   * Restrict a reduced OBDD by fixing one variable index to a Boolean value.
   * `bit = false` means x_i = 0, `bit = true` means x_i = 1.
   */
  def Restrict(root: BDDNode, index: Int, bit: Boolean, varCount: Int): BDDNode = {
    val n = math.max(0, varCount)
    val reducedInput = Reduce(root, n)
    val memo = mutable.HashMap.empty[BDDNode, BDDNode]

    def go(v: BDDNode): BDDNode = memo.getOrElseUpdate(v, v match {
      case Terminal(value, _, _, _) =>
        Terminal(value)
      case nt: NonTerminal =>
        if (nt.index == index) {
          if (bit) go(nt.high) else go(nt.low)
        } else {
          NonTerminal(
            index = nt.index,
            low = go(nt.low),
            high = go(nt.high)
          )
        }
    })

    Reduce(go(reducedInput), n)
  }

  /** Stable low-first DFS; sets `uid` so `BDDExport.cyIdOf` is unique on the reduced DAG. */
  def assignExportUids(root: BDDNode): Unit = {
    val seen = mutable.HashSet.empty[BDDNode]
    var seq = 0

    def go(v: BDDNode): Unit = {
      if (!seen.contains(v)) {
        seen += v
        seq += 1
        v.uid = "u" + seq.toString
        v match {
          case NonTerminal(_, lo, hi, _, _, _) => go(lo); go(hi)
          case Terminal(_, _, _, _) => ()
        }
      }
    }

    go(root)
  }
}
