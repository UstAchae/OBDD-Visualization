final case class TruthTableReq(
  expr: String,
  vars: List[String]
)

final case class TruthTableRow(
  env: List[Boolean],
  out: Boolean
)

final case class TruthTableResp(
  vars: List[String],
  rows: List[TruthTableRow]
)

final case class BddReq(expr: String, vars: List[String])
final case class BddResp(elements: BDDExport.CyElements)

final case class ReduceTraceReq(expr: String, vars: List[String])

final case class ReduceStepResp(
  title: String,
  elements: BDDExport.CyElements,
  focus: List[String]
)

final case class ReduceTraceResp(steps: List[ReduceStepResp])
