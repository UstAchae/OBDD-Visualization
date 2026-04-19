import { ANIM } from "../../config.js";

export function createBddUpdateController({
  state,
  ctx,
  shouldRequest,
  prepareActiveExpr,
  ensureLineAnalysis,
  clearRestrictInteractiveFocus,
  clearActivePaneState,
  ensureBddPane,
  cloneElements,
  applyGlobalsFromPane,
  expr,
  cy,
  axis,
  setGraphInstant,
  setGraphAnimated,
  smoothFit,
  fetchBddApply,
  fetchBddReduced,
  fetchBdd,
  clearGraph,
  setReduceButtonsEnabled,
  setDraggingEnabled
}) {
  async function commitGraphToExpression(idx, payload, vars, elements, reqKey, { layoutKind } = {}) {
    const varsCopy = [...vars];
    const nextPayload = payload ? { expr: payload.expr, vars: varsCopy } : null;
    const ex = state.expressions[idx];
    ensureBddPane(ex);
    const prev = ex.bddPane.lastBddPayload;
    const prevVars = prev?.vars ?? [];
    const payloadChanged =
      !prev && !nextPayload
        ? ex.bddPane.lastRequestedKey !== reqKey
        : !prev ||
          !nextPayload ||
          prev.expr !== nextPayload.expr ||
          prevVars.length !== varsCopy.length ||
          prevVars.some((v, i) => v !== varsCopy[i]);

    const cloneNodes = cloneElements(elements);
    const nextLayoutKind = layoutKind ?? (payloadChanged ? "tree" : (ex.bddPane.layoutKind ?? state.bddLayoutKind ?? "tree"));
    const nextPane = {
      ...ex.bddPane,
      lastBddPayload: nextPayload,
      baseBddElements: cloneNodes,
      lastBddElements: cloneNodes,
      lastRequestedKey: reqKey,
      layoutKind: nextLayoutKind
    };
    if (payloadChanged) {
      nextPane.appliedReduce = [];
      nextPane.skipReductionApplied = false;
      nextPane.userX = {};
      nextPane.panelDragEnabled = !nextPayload;
    }
    ex.bddPane = nextPane;

    if (state.activeIndex !== idx) return;

    applyGlobalsFromPane(ex.bddPane);
    expr.refreshExprUiOnly(ctx, idx);
    if (nextLayoutKind === "aux_sugiyama" && !nextPayload) {
      await setGraphInstant(cy, elements, vars, state.userX, {
        keepViewport: false,
        fit: false,
        bddLayoutKind: state.bddLayoutKind,
        onAfterLayout: () => {
          axis.sync();
        }
      });
      await smoothFit(cy, undefined, { padding: 30, duration: 220 });
      axis.sync();
    } else {
      await setGraphAnimated(
        cy,
        elements,
        ANIM,
        {
          bddLayoutKind: state.bddLayoutKind,
          onAfterLayout: () => {
            axis.sync();
          }
        },
        vars,
        state.userX
      );
    }
    setReduceButtonsEnabled(Boolean(nextPayload));
    setDraggingEnabled(ex.bddPane.panelDragEnabled);
  }

  async function updateBddForActive(isLive = true) {
    if (state.isReducing) return;
    clearRestrictInteractiveFocus();
    state.applyTraceSession = null;
    state.restrictTraceSession = null;
    state.isRestrictTracing = false;

    await ensureLineAnalysis(state.activeIndex);
    const prep = prepareActiveExpr();
    if (!prep.ok) {
      clearActivePaneState();
      return;
    }

    const { vars, requestKey } = prep;
    if (prep.kind === "expr" && isLive && !shouldRequest(prep.expanded)) return;

    if (state.lastRequestedKey === requestKey) return;
    state.lastRequestedKey = requestKey;

    const ownerIdx = state.activeIndex;
    const ownerEx = state.expressions[ownerIdx];
    ensureBddPane(ownerEx);
    ownerEx.bddFetchTicket = (ownerEx.bddFetchTicket || 0) + 1;
    const ticket = ownerEx.bddFetchTicket;

    try {
      const resp =
        prep.kind === "apply"
          ? await fetchBddApply(prep.apply.op, prep.expr1, prep.expr2, vars)
          : prep.kind === "restrict"
            ? await fetchBddReduced(prep.expanded, vars)
            : await fetchBdd(prep.expanded, vars);
      if (ownerEx.bddFetchTicket !== ticket) return;

      if (!resp.ok) {
        if (isLive && resp.status === 400) return;

        if (state.activeIndex === ownerIdx) {
          clearGraph(cy);
          state.lastRequestedKey = null;
          setReduceButtonsEnabled(false);
          axis.sync();
        }
        return;
      }

      const data = await resp.json();
      if (ownerEx.bddFetchTicket !== ticket) return;

      if (data?.elements?.nodes && data?.elements?.edges) {
        await commitGraphToExpression(
          ownerIdx,
          prep.kind === "apply" ? null : { expr: prep.expanded },
          vars,
          data.elements,
          requestKey,
          { layoutKind: prep.kind === "apply" || prep.kind === "restrict" ? "aux_sugiyama" : "tree" }
        );
      } else {
        if (state.activeIndex === ownerIdx) {
          clearGraph(cy);
          setReduceButtonsEnabled(false);
          axis.sync();
        }
      }
    } catch (err) {
      console.error("BDD fetch failed:", err);
      if (ownerEx.bddFetchTicket === ticket && state.activeIndex === ownerIdx) {
        clearGraph(cy);
        setReduceButtonsEnabled(false);
        axis.sync();
      }
    }
  }

  return {
    commitGraphToExpression,
    updateBddForActive
  };
}
