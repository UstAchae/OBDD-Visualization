final case class TruthTableReq (
  expr: String,
  vars: List[String]
)

final case class TruthTableRow (
  env: List[Boolean], // 按 vars 顺序：vars(i) 对应 env(i)
  out: Boolean
)

final case class TruthTableResp (
  vars: List[String],
  rows: List[TruthTableRow]
)

final case class BddReq(expr: String, vars: List[String])
final case class BddResp(elements: BDDExport.CyElements)

