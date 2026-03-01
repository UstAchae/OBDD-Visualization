// frontend/js/main.js

import { ANIM, TT_DEBOUNCE_MS, BDD_DEBOUNCE_MS } from "./config.js";

import { createState } from "./state.js";
import { getDom } from "./dom.js";

import {
  createCy,
  enableHorizontalDragOnly,
  disableUserZoom,
  autoFitOnResize,
  setGraphAnimated,
  clearGraph,
  setGraphInstant,
  snapNodesToLayers,
  cancelAllGraphAnims
} from "./graph/cy.js";

import { renderLayers, renderLayerAxis, syncLayerAxis } from "./graph/layerAxis.js";

import {
  buildDefMap,
  parseDefinition,
  expandExpr,
  syncOrder,
  shouldRequest
} from "./expr/defs.js";

import * as expr from "./expr/exprUI.js";

import {
  fetchTruthTable,
  fetchBdd,
  fetchReduceTerminalsTrace,
  fetchReduceRedundantTrace,
  fetchReduceMergeTrace
} from "./net/api.js";

import { playReduceTerminalsTrace } from "./reduce/terminals.js";
import { playReduceRedundantTrace } from "./reduce/redundant.js";
import { playReduceMergeTrace } from "./reduce/merge.js";

import { setupKeyboard } from "./keyboard/keyboard.js";

const state = createState();
const dom = getDom();

const cy = createCy(dom.cyContainer);
window.cy = cy;

disableUserZoom(cy);
enableHorizontalDragOnly(cy, { layerGap: 120 });

const axis = {
  render(vars) {
    renderLayerAxis(dom.layerAxisEl, vars, cy);
  },
  sync() {
    syncLayerAxis(dom.layerAxisEl, cy);
  }
};

const ctx = {
  state,
  dom,
  cy,
  axis,
  expr,
  callbacks: {
    onExprChanged() {
      scheduleTruthTable();
      scheduleBdd();
    }
  }
};

function setReduceButtonsEnabled(enabled) {
  expr.setReduceButtonsEnabled(dom, enabled);
}

function scheduleTruthTable() {
  if (state.ttTimer) clearTimeout(state.ttTimer);
  state.ttTimer = setTimeout(() => updateTruthTableForActive(true), TT_DEBOUNCE_MS);
}

function scheduleBdd() {
  if (state.bddTimer) clearTimeout(state.bddTimer);
  state.bddTimer = setTimeout(() => updateBddForActive(true), BDD_DEBOUNCE_MS);
}

function prepareActiveExpr() {
  const active = state.expressions[state.activeIndex];
  const raw = (active?.text || "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  try {
    const defs = buildDefMap(state.expressions);
    const d = parseDefinition(raw);
    let expanded = d ? d.rhs : raw;
    expanded = expandExpr(expanded, defs);

    const vars = syncOrder(expanded, active.order);
    active.order = vars;

    expr.updateOrderBarOnly(ctx, state.activeIndex);
    renderLayers(dom.layersListEl, vars);
    axis.render(vars);

    return { ok: true, active, raw, expanded, vars };
  } catch (e) {
    return { ok: false, reason: "expand_failed", error: e };
  }
}

async function updateTruthTableForActive(isLive = true) {
  if (state.isReducing) return;

  const prep = prepareActiveExpr();
  if (!prep.ok) return;

  const { expanded, vars } = prep;
  if (isLive && !shouldRequest(expanded)) return;

  try {
    const ttResp = await fetchTruthTable(expanded, vars);
    if (!ttResp.ok) {
      if (isLive && ttResp.status === 400) return;
      return;
    }
    await ttResp.json();
  } catch {
    return;
  }
}

function setDraggingEnabled(enabled) {
  if (enabled) cy.nodes().grabify();
  else cy.nodes().ungrabify();
}
function hasAnyReduceApplied() {
  return (state.appliedReduce?.length ?? 0) > 0;
}

function pruneUserX(cyInst) {
  const alive = new Set(cyInst.nodes().map((n) => n.id()));
  for (const k of state.userX.keys()) {
    if (!alive.has(k)) state.userX.delete(k);
  }
}

async function setGraphSnapshot(elements, vars) {
  await setGraphInstant(cy, elements, vars, state.userX, {
    keepViewport: true,
    onAfterLayout: () => axis.sync()
  });
  pruneUserX(cy);
}

function restoreBaseGraphIfAvailable() {
  const payload = state.lastBddPayload;
  if (!payload?.vars || !state.baseBddElements) return false;

  cancelAllGraphAnims(cy);

  // reset applied + view graph back to base
  state.appliedReduce.length = 0;
  state.lastBddElements = state.baseBddElements;

  setGraphSnapshot(state.baseBddElements, payload.vars);
  setDraggingEnabled(false);
  return true;
}

async function updateBddForActive(isLive = true) {
  if (state.isReducing) return;

  const prep = prepareActiveExpr();
  if (!prep.ok) {
    if (prep.reason === "empty") {
      clearGraph(cy);
      cy.nodes().ungrabify();
      axis.sync();
      setReduceButtonsEnabled(false);

      state.lastRequestedKey = null;
      state.appliedReduce.length = 0;
      state.lastBddPayload = null;

      state.baseBddElements = null;
      state.lastBddElements = null;

      state.userX.clear();
    }
    return;
  }

  const { expanded, vars } = prep;
  if (isLive && !shouldRequest(expanded)) return;

  const exprKey = expanded.replace(/\s+/g, "");
  const varsKey = Array.isArray(vars) ? vars.join(",") : "";
  const reqKey = `${exprKey}|${varsKey}`;

  if (state.lastRequestedKey === reqKey) return;
  state.lastRequestedKey = reqKey;

  const mySeq = ++state.bddReqSeq;

  try {
    const resp = await fetchBdd(expanded, vars);
    if (mySeq !== state.bddReqSeq) return;

    if (!resp.ok) {
      if (isLive && resp.status === 400) return;

      clearGraph(cy);
      state.lastRequestedKey = null;
      setReduceButtonsEnabled(false);
      axis.sync();
      return;
    }

    const data = await resp.json();
    if (mySeq !== state.bddReqSeq) return;

    if (data?.elements?.nodes && data?.elements?.edges) {
      const varsCopy = [...vars];
      const nextPayload = { expr: expanded, vars: varsCopy };

      const prev = state.lastBddPayload;
      const prevVars = prev?.vars ?? [];

      const payloadChanged =
        !prev ||
        prev.expr !== nextPayload.expr ||
        prevVars.length !== varsCopy.length ||
        prevVars.some((v, i) => v !== varsCopy[i]);

      if (payloadChanged) {
        state.appliedReduce.length = 0;
        state.userX.clear();
      }

      state.lastBddPayload = nextPayload;

      // base graph = /bdd result (unreduced)
      state.baseBddElements = data.elements;
      // view graph starts as base
      state.lastBddElements = data.elements;

      setGraphAnimated(
        cy,
        data.elements,
        ANIM,
        {
          onAfterLayout: () => {
            snapNodesToLayers(cy, vars);
            axis.sync();
          }
        },
        vars,
        state.userX
      );

      setReduceButtonsEnabled(true);
      setDraggingEnabled(false);
    } else {
      clearGraph(cy);
      setReduceButtonsEnabled(false);
      axis.sync();
    }
  } catch (err) {
    console.error("BDD fetch failed:", err);
    if (mySeq === state.bddReqSeq) {
      clearGraph(cy);
      setReduceButtonsEnabled(false);
      axis.sync();
    }
  }
}

/**
 * Runs ONE reduction endpoint + animation.
 * - uses ONE global lock: state.isReducing
 * - appliedReduce is a SEQUENCE (history), not a set
 * - commit appliedReduce ONLY after success, but also on 204 (no-op)
 */
async function runReduceTrace({ kind, fetchTrace, playTrace }) {
  if (!state.lastBddPayload) return false;

  if (state.isReducing) {
    console.warn("[reduce] blocked: already reducing", kind);
    return false;
  }

  state.isReducing = true;

  try {
    const applied = state.appliedReduce.slice(); // historical sequence
    const { expr: exprStr, vars } = state.lastBddPayload;

    console.log("[reduce] START", { kind, applied });

    // fetch
    let resp;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12000);

      console.log("[reduce] before fetchTrace", { kind, applied });
      // fetchTrace must accept (expr, vars, applied, signal)
      resp = await fetchTrace(exprStr, vars, applied, controller.signal);

      clearTimeout(t);
      console.log("[reduce] after fetchTrace", { kind, status: resp.status });
    } catch (e) {
      console.error("[reduce] fetchTrace FAILED", kind, e);
      return false;
    }

    // 204: backend says no-op
    if (resp.status === 204) {
      state.appliedReduce.push(kind);
      setDraggingEnabled(hasAnyReduceApplied());
      console.log("[reduce] DONE (204)", { kind, appliedNow: state.appliedReduce.slice() });
      return true;
    }

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("[reduce] HTTP not ok", resp.status, txt);
      return false;
    }

    const trace = await resp.json().catch((e) => {
      console.error("[reduce] JSON parse failed", e);
      return null;
    });

    if (!trace?.initial) {
      console.error("[reduce] missing trace.initial", trace);
      return false;
    }

    // Always render initial first
    console.log("[reduce] before setGraphSnapshot(initial)");
    await setGraphSnapshot(trace.initial, vars);
    console.log("[reduce] after setGraphSnapshot(initial)");

    const steps = trace?.steps ?? [];
    if (steps.length) {
      console.log("[reduce] before playTrace steps=", steps.length);

      await playTrace(cy, trace, {
        setGraph: async (els) => setGraphSnapshot(els, vars),
        onAfterEach: () => axis.sync(),
        ctx: { vars, state }
      });

      console.log("[reduce] after playTrace");

      const finalSnap = steps.at(-1)?.snapshot ?? null;
      if (finalSnap) state.lastBddElements = finalSnap;
    } else {
      state.lastBddElements = trace.initial;
    }

    // commit applied ONLY after success
    state.appliedReduce.push(kind);
    setDraggingEnabled(hasAnyReduceApplied());

    console.log("[reduce] DONE", { kind, appliedNow: state.appliedReduce.slice() });
    return true;
  } finally {
    state.isReducing = false;
  }
}

function wireButtons() {
  dom.btnAdd?.addEventListener("click", () => {
    expr.addLine(ctx, "");
    expr.focusActiveInputSoon(dom);
  });

  dom.btnClearAll?.addEventListener("click", () => {
    expr.clearAll(ctx);
    clearGraph(cy);
    cy.nodes().ungrabify();

    state.userX.clear();
    setReduceButtonsEnabled(false);
    state.lastRequestedKey = null;

    state.appliedReduce.length = 0;
    state.lastBddPayload = null;
    state.baseBddElements = null;
    state.lastBddElements = null;

    axis.sync();
  });

  // Main "Reduce" button: restore unreduced base graph (local, no network)
  dom.btnReduce?.addEventListener("click", () => {
    if (state.isReducing) return;
    restoreBaseGraphIfAvailable();
  });

  dom.btnReduceTerminals?.addEventListener("click", async () => {
    if (!state.lastBddPayload) return;
    await runReduceTrace({
      kind: "terminals",
      fetchTrace: fetchReduceTerminalsTrace,
      playTrace: playReduceTerminalsTrace
    });
  });

  dom.btnReduceRedundant?.addEventListener("click", async () => {
    if (!state.lastBddPayload) return;
    await runReduceTrace({
      kind: "redundant",
      fetchTrace: fetchReduceRedundantTrace,
      playTrace: playReduceRedundantTrace
    });
  });

  dom.btnReduceMerge?.addEventListener("click", async () => {
    if (!state.lastBddPayload) return;
    await runReduceTrace({
      kind: "merge",
      fetchTrace: fetchReduceMergeTrace,
      playTrace: playReduceMergeTrace
    });
  });

  dom.btnFit?.addEventListener("click", () => {
    cy.fit(undefined, 30);
    axis.sync();
  });

  dom.btnResetExample?.addEventListener("click", () => {
    // TODO: put your existing example/reset logic back here if you had one
  });
}

function wireCyAxisSync() {
  cy.on("zoom pan", () => axis.sync());
  cy.on("resize", () => axis.sync());

  let fitTimer = null;
  function scheduleFitAfterDrag() {
    if (fitTimer) clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      fitTimer = null;
      cy.fit(undefined, 30);
      axis.sync();
    }, 60);
  }

  cy.on("dragfree", "node", (evt) => {
    const n = evt.target;
    state.userX.set(n.id(), n.position("x"));
    scheduleFitAfterDrag();
  });

  window.addEventListener("resize", () => axis.sync());
}

function init() {
  setReduceButtonsEnabled(false);

  expr.renderExprList(ctx);
  expr.setActiveIndex(state, dom, 0);

  clearGraph(cy);
  state.lastRequestedKey = null;
  axis.sync();

  setupKeyboard({ ...ctx, expr });
  wireButtons();
  wireCyAxisSync();

  autoFitOnResize(cy, () => axis.sync(), { padding: 30, debounceMs: 60 });

  if (dom.backendInfo) dom.backendInfo.textContent = "Backend: /api/bdd";
}

init();