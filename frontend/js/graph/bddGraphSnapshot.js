/**
 * Step-snapshot rendering + pruning user X offsets after graph replacement.
 */
export function createBddGraphSnapshot({
  state,
  cy,
  axis,
  setGraphInstant,
  cancelAllGraphAnims,
  smoothFit,
  setDraggingEnabled,
  persistBddPane,
  refreshCanvasReduceButtons,
  cloneElements
}) {
  function pruneUserX(cyInst) {
    const alive = new Set(cyInst.nodes().map((n) => n.id()));
    for (const k of state.userX.keys()) {
      if (!alive.has(k)) state.userX.delete(k);
    }
  }

  async function setGraphSnapshot(elements, vars, { bddLayoutKind = "tree" } = {}) {
    await setGraphInstant(cy, elements, vars, state.userX, {
      keepViewport: true,
      fit: false,
      bddLayoutKind,
      onAfterLayout: () => axis.sync()
    });
    pruneUserX(cy);
  }

  async function restoreBaseGraphIfAvailable() {
    const payload = state.lastBddPayload;
    if (!payload?.vars || !state.baseBddElements) return false;

    cancelAllGraphAnims(cy);

    state.appliedReduce.length = 0;
    state.skipReductionApplied = false;
    state.lastBddElements = cloneElements(state.baseBddElements);
    state.bddLayoutKind = "tree";

    await setGraphSnapshot(state.baseBddElements, payload.vars);
    await smoothFit(cy, undefined, { padding: 30, duration: 240 });
    setDraggingEnabled(false);
    persistBddPane(state.activeIndex);
    refreshCanvasReduceButtons();
    return true;
  }

  return {
    pruneUserX,
    setGraphSnapshot,
    restoreBaseGraphIfAvailable
  };
}
