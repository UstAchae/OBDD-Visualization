import { computeSnapshotPositionMap, snapNodesToLayers, smoothFit } from "./cy.js";

export function createBddAutoLayout({
  state,
  cy,
  axis,
  canAutoLayoutCurrentBdd,
  getLayoutVarsForCurrentCanvas,
  persistBddPane,
  refreshCanvasReduceButtons
}) {
  function buildCurrentElementsSnapshot() {
    return {
      nodes: cy.nodes().map((n) => n.json()),
      edges: cy.edges().map((e) => e.json())
    };
  }

  async function runAutoLayoutForCurrentBdd() {
    if (!canAutoLayoutCurrentBdd()) return false;
    state.isReducing = true;
    refreshCanvasReduceButtons();
    const vars = getLayoutVarsForCurrentCanvas();
    try {
      if (!vars.length) return false;

      const elements = buildCurrentElementsSnapshot();
      const targetPos = await computeSnapshotPositionMap(cy, elements, vars, null, {
        bddLayoutKind: state.applyTraceSession ? "tree" : "aux_sugiyama"
      });
      if (!targetPos?.size) return false;

      const duration = 360;
      const tasks = [];
      cy.nodes().forEach((n) => {
        const pos = targetPos.get(n.id());
        if (!pos) return;
        tasks.push(n.animation({ position: pos }, { duration, easing: "ease-in-out" }).play().promise());
      });
      if (!tasks.length) return false;
      await Promise.allSettled(tasks);

      state.userX.clear();
      cy.nodes().forEach((n) => state.userX.set(n.id(), n.position("x")));
      snapNodesToLayers(cy, vars);
      if (!state.applyTraceSession) {
        state.bddLayoutKind = "aux_sugiyama";
        persistBddPane(state.activeIndex);
      }
      await smoothFit(cy, undefined, { padding: 30, duration: 240 });
      axis.sync();
      return true;
    } finally {
      state.isReducing = false;
      refreshCanvasReduceButtons();
    }
  }

  return {
    buildCurrentElementsSnapshot,
    runAutoLayoutForCurrentBdd
  };
}
