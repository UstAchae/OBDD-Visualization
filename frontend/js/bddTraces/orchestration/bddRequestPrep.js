export function createBddRequestPrep({
  state,
  expr,
  ctx,
  axis,
  syncOrder,
  analyzeLine
}) {
  function prepareActiveExpr() {
    const active = state.expressions[state.activeIndex];
    const analysis = analyzeLine(state.activeIndex);
    if (!analysis.ok) {
      active.order = [];
      expr.updateOrderBarOnly(ctx, state.activeIndex);
      axis.render([]);
      return { ok: false, ...analysis };
    }

    const exprText =
      analysis.kind === "apply"
        ? `${analysis.expr1} ${analysis.expr2}`
        : analysis.expr;
    const vars = syncOrder(exprText, active.order);
    active.order = vars;

    expr.updateOrderBarOnly(ctx, state.activeIndex);
    axis.render(vars);

    if (analysis.kind === "apply") {
      const reqKey = `apply|${analysis.apply.op}|${analysis.expr1}|${analysis.expr2}|${vars.join(",")}`;
      return { ok: true, active, vars, requestKey: reqKey, ...analysis };
    }

    if (analysis.kind === "restrict") {
      const expanded = analysis.expr;
      const reqKey =
        `restrict|result|${analysis.restrict.bit}|${analysis.restrict.atomName}|${analysis.restrict.bddName}|` +
        `${expanded.replace(/\s+/g, "")}|${vars.join(",")}`;
      return { ok: true, active, vars, expanded, requestKey: reqKey, ...analysis };
    }

    const expanded = analysis.expr;
    const reqKey = `${expanded.replace(/\s+/g, "")}|${vars.join(",")}`;
    return { ok: true, active, vars, expanded, requestKey: reqKey, ...analysis };
  }

  return {
    prepareActiveExpr
  };
}
