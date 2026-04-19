export function createPaneLifecycleController({
  state,
  cy,
  axis,
  defaultBddPane,
  ensureBddPane,
  applyGlobalsFromPane,
  setReduceButtonsEnabled,
  clearGraph,
  clearApplyPendingCompareHighlight,
  clearApplyCompareHighlight,
  clearRestrictInteractiveFocus,
  cancelAllGraphAnims,
  prepareActiveExpr,
  setGraphInstant,
  pruneUserX,
  setDraggingEnabled,
  smoothFit,
  updateBddForActive,
  refreshBddBarPrimaryButtons,
  scheduleLineAnalysisRefresh
}) {
  let tabRestoreToken = 0;

  function clearActivePaneState() {
    clearApplyPendingCompareHighlight(state.applyTraceSession);
    clearApplyCompareHighlight();
    clearRestrictInteractiveFocus();
    clearGraph(cy);
    cy.nodes().ungrabify();
    axis.sync();
    setReduceButtonsEnabled(false);
    state.applyTraceSession = null;
    state.restrictTraceSession = null;
    state.isRestrictTracing = false;

    state.lastRequestedKey = null;
    state.appliedReduce.length = 0;
    state.skipReductionApplied = false;
    state.lastBddPayload = null;
    state.baseBddElements = null;
    state.lastBddElements = null;
    state.userX.clear();
    state.panelDragEnabled = false;
    state.bddLayoutKind = "tree";

    const cur = state.expressions[state.activeIndex];
    if (cur) {
      ensureBddPane(cur);
      cur.bddPane = defaultBddPane();
    }
  }

  async function restoreBddPaneForIndex(idx) {
    const t = ++tabRestoreToken;
    const ex = state.expressions[idx];
    if (!ex) return;
    ensureBddPane(ex);
    applyGlobalsFromPane(ex.bddPane);

    cancelAllGraphAnims(cy);

    const prep = prepareActiveExpr();
    if (!prep.ok) {
      clearActivePaneState();
      return;
    }

    const { vars } = prep;
    axis.render(vars);

    const els = state.lastBddElements;
    if (els?.nodes?.length && state.lastRequestedKey === prep.requestKey) {
      await setGraphInstant(cy, els, vars, state.userX, {
        keepViewport: true,
        fit: false,
        bddLayoutKind: state.bddLayoutKind,
        onAfterLayout: () => {
          axis.sync();
        }
      });
      pruneUserX(cy);
      if (t !== tabRestoreToken) return;
      setReduceButtonsEnabled(Boolean(state.lastBddPayload));
      setDraggingEnabled(state.panelDragEnabled);
      await smoothFit(cy, undefined, { padding: 30, duration: 220 });
      axis.sync();
    } else {
      clearGraph(cy);
      cy.nodes().ungrabify();
      setReduceButtonsEnabled(false);
      state.lastRequestedKey = null;
      if (t !== tabRestoreToken) return;
      await updateBddForActive(false);
    }
  }

  function onExpressionsReset() {
    tabRestoreToken += 1;
    state.lineAnalysisCache.clear();
    state.lineAnalysisVersion += 1;
    applyGlobalsFromPane(defaultBddPane());
    clearApplyPendingCompareHighlight(state.applyTraceSession);
    clearRestrictInteractiveFocus();
    state.applyTraceSession = null;
    state.restrictTraceSession = null;
    state.isRestrictTracing = false;
    clearApplyCompareHighlight();
    clearGraph(cy);
    cy.nodes().ungrabify();
    setReduceButtonsEnabled(false);
    state.lastRequestedKey = null;
    axis.render([]);
    axis.sync();
    refreshBddBarPrimaryButtons();
    scheduleLineAnalysisRefresh();
  }

  return {
    clearActivePaneState,
    restoreBddPaneForIndex,
    onExpressionsReset
  };
}
