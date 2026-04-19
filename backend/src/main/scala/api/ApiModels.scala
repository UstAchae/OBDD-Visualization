// backend/src/main/scala/api/ApiModels.scala

final case class TruthTableReq(expr: String, vars: List[String])
final case class TruthTableRow(env: List[Boolean], out: Boolean)
final case class TruthTableResp(vars: List[String], rows: List[TruthTableRow])

final case class BddReq(expr: String, vars: List[String])
final case class BddResp(elements: BDDExport.CyElements)
final case class ApplyReq(expr1: String, expr2: String, vars: List[String], op: String)
final case class ApplyResultStateNode(
                                       id: String,
                                       terminalValue: Option[Boolean] = None,
                                       index: Option[Int] = None,
                                       lowId: Option[String] = None,
                                       highId: Option[String] = None
                                     )
final case class ApplyResultState(
                                   rootId: String,
                                   nodes: List[ApplyResultStateNode]
                                 )
final case class ApplyTraceReq(
                                expr1: String,
                                expr2: String,
                                vars: List[String],
                                op: String,
                                revealed: List[String] = Nil,
                                resolved: List[String] = Nil,
                                expanded: List[String] = Nil,
                                appliedReductions: List[String] = Nil,
                                resultState: Option[ApplyResultState] = None,
                                advancePath: Option[String] = None,
                                advancePhase: Option[String] = None
                              )
final case class ApplyReduceTraceReq(
                                      expr1: String,
                                      expr2: String,
                                      vars: List[String],
                                      op: String,
                                      kind: String,
                                      revealed: List[String] = Nil,
                                      resolved: List[String] = Nil,
                                      expanded: List[String] = Nil,
                                      appliedReductions: List[String] = Nil,
                                      resultState: Option[ApplyResultState] = None,
                                      visibleResultNodeIds: List[String] = Nil
                              )
final case class FormatExprReq(expr: String)
final case class FormatExprResp(expr: String)

final case class AnalyzeLineReq(expressions: List[String], idx: Int)
final case class AnalyzeApplyMeta(op: String, leftName: String, rightName: String)
final case class AnalyzeRestrictMeta(bit: Int, atomName: String, bddName: String)
final case class AnalyzeLineResp(
                                ok: Boolean,
                                reason: Option[String],
                                kind: String,
                                raw: String,
                                body: Option[String] = None,
                                expr: Option[String] = None,
                                baseExpr: Option[String] = None,
                                expr1: Option[String] = None,
                                expr2: Option[String] = None,
                                apply: Option[AnalyzeApplyMeta] = None,
                                restrict: Option[AnalyzeRestrictMeta] = None,
                                missingNames: List[String] = Nil,
                                incompleteNames: List[String] = Nil,
                                creatableNames: List[String] = Nil
                              )

final case class ApplyBranch(
                             path: String,
                             nodeIds: List[String],
                             phase: String,
                             caseKey: String,
                             compareIds: List[String] = Nil,
                             lowPrimaryFocusIds: List[String] = Nil,
                             lowSecondaryFocusIds: List[String] = Nil,
                             highPrimaryFocusIds: List[String] = Nil,
                             highSecondaryFocusIds: List[String] = Nil,
                             lowFocusIds: List[String] = Nil,
                             highFocusIds: List[String] = Nil,
                             revealNodeId: Option[String] = None,
                             lowPrimaryRevealIds: List[String] = Nil,
                             lowSecondaryRevealIds: List[String] = Nil,
                             highPrimaryRevealIds: List[String] = Nil,
                             highSecondaryRevealIds: List[String] = Nil,
                             lowRevealIds: List[String] = Nil,
                             highRevealIds: List[String] = Nil
                           )
final case class ApplyTraceResp(
                                snapshot: BDDExport.CyElements,
                                branches: List[ApplyBranch],
                                finalResultPositions: Map[String, BDDExport.CyPos] = Map.empty,
                                finalResultSnapshot: BDDExport.CyElements = BDDExport.CyElements(Nil, Nil),
                                resultState: Option[ApplyResultState] = None
                              )

final case class ReduceTraceReq(
                                 expr: String,
                                 vars: List[String],
                                 applied: List[String] = Nil
                               )

final case class RestrictTraceReq(
                                   expr: String,
                                   vars: List[String],
                                   atom: String,
                                   bit: Int
                                 )

final case class StateReduceTraceReq(
                                      kind: String,
                                      vars: List[String],
                                      resultState: ApplyResultState
                                    )

final case class TraceSnapStep(
                                title: String,
                                focus: List[String],
                                snapshot: BDDExport.CyElements,
                                batches: Option[List[List[String]]] = None,
                                branches: List[ApplyBranch] = Nil,
                                resultState: Option[ApplyResultState] = None
                              )

final case class ReduceSnapTraceResp(
                                      initial: BDDExport.CyElements,
                                      steps: List[TraceSnapStep],
                                      initialBranches: List[ApplyBranch] = Nil,
                                      initialResultState: Option[ApplyResultState] = None
                                    )