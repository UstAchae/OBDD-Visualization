export function createPaneStateController({ state, defaultBddPane }) {
  function ensureBddPane(ex) {
    if (!ex.bddPane) ex.bddPane = defaultBddPane();
  }

  function cloneElements(els) {
    if (!els) return null;
    try {
      return structuredClone(els);
    } catch {
      return JSON.parse(JSON.stringify(els));
    }
  }

  function clonePayload(p) {
    if (!p) return null;
    return { expr: p.expr, vars: [...p.vars] };
  }

  function applyGlobalsFromPane(pane) {
    const p = pane || defaultBddPane();
    state.lastBddPayload = clonePayload(p.lastBddPayload);
    state.baseBddElements = cloneElements(p.baseBddElements);
    state.lastBddElements = cloneElements(p.lastBddElements);
    state.appliedReduce = [...(p.appliedReduce || [])];
    state.skipReductionApplied = Boolean(p.skipReductionApplied);
    state.lastRequestedKey = p.lastRequestedKey ?? null;
    state.userX = new Map(Object.entries(p.userX || {}));
    state.panelDragEnabled = p.panelDragEnabled ?? false;
    state.bddLayoutKind = p.layoutKind ?? "tree";
  }

  function persistBddPane(idx) {
    const ex = state.expressions[idx];
    if (!ex) return;
    ensureBddPane(ex);
    ex.bddPane = {
      lastBddPayload: clonePayload(state.lastBddPayload),
      baseBddElements: cloneElements(state.baseBddElements),
      lastBddElements: cloneElements(state.lastBddElements),
      appliedReduce: [...state.appliedReduce],
      skipReductionApplied: Boolean(state.skipReductionApplied),
      lastRequestedKey: state.lastRequestedKey,
      userX: Object.fromEntries(state.userX),
      panelDragEnabled: state.panelDragEnabled,
      layoutKind: state.bddLayoutKind ?? "tree"
    };
  }

  return {
    ensureBddPane,
    cloneElements,
    clonePayload,
    applyGlobalsFromPane,
    persistBddPane
  };
}
