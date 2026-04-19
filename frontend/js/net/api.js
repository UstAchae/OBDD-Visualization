import { postJson } from "./request.js";

export async function fetchBdd(expr, vars) {
  return postJson("/api/bdd", { expr, vars });
}

export async function fetchFormattedExpr(expr) {
  return postJson("/api/format-expr", { expr });
}

export async function fetchAnalyzeLine(expressions, idx, signal) {
  return postJson("/api/analyze-line", { expressions, idx }, {
    signal
  });
}

export async function fetchBddApply(op, expr1, expr2, vars, signal) {
  return postJson("/api/bdd/apply", { op, expr1, expr2, vars }, {
    signal
  });
}

export async function fetchApplyTrace(
  op,
  expr1,
  expr2,
  vars,
  revealed = [],
  resolved = [],
  expanded = [],
  appliedReductions = [],
  resultState = null,
  advancePath = null,
  advancePhase = null,
  signal
) {
  return postJson("/api/bdd/apply-trace", {
      op,
      expr1,
      expr2,
      vars,
      revealed,
      resolved,
      expanded,
      appliedReductions,
      resultState,
      advancePath,
      advancePhase
    }, {
    signal
  });
}

export async function fetchApplyReduceTrace(
  kind,
  op,
  expr1,
  expr2,
  vars,
  revealed = [],
  resolved = [],
  expanded = [],
  appliedReductions = [],
  resultState = null,
  visibleResultNodeIds = [],
  signal
) {
  return postJson("/api/bdd/apply-reduce-trace", {
      kind,
      op,
      expr1,
      expr2,
      vars,
      revealed,
      resolved,
      expanded,
      appliedReductions,
      resultState,
      visibleResultNodeIds
    }, {
    signal
  });
}

/** Bryant batch reduce on the server; returns Cytoscape elements (no step trace). */
export async function fetchBddReduced(expr, vars, signal) {
  return postJson("/api/bdd/reduce-full", { expr, vars }, {
    signal
  });
}

export async function fetchReduceTerminalsTrace(expr, vars, applied = []) {
  return postJson("/api/bdd/reduce-terminals-trace", { expr, vars, applied });
}

export async function fetchReduceRedundantTrace(expr, vars, applied = []) {
  return postJson("/api/bdd/reduce-redundant-trace", { expr, vars, applied });
}

export async function fetchReduceMergeTrace(expr, vars, applied = []) {
  return postJson("/api/bdd/reduce-merge-trace", { expr, vars, applied });
}

export async function fetchRestrictTrace(expr, vars, atom, bit, signal) {
  return postJson("/api/bdd/restrict-trace", { expr, vars, atom, bit }, {
    signal
  });
}

export async function fetchReduceStateTrace(kind, vars, resultState, signal) {
  return postJson("/api/bdd/reduce-state-trace", { kind, vars, resultState }, {
    signal
  });
}