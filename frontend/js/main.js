import { ANIM, TT_DEBOUNCE_MS, BDD_DEBOUNCE_MS } from "./config.js";
import { createState } from "./state.js";
import { getDom } from "./dom.js";

import { createCy, setGraphAnimated, clearGraph } from "./graph/cy.js";
import { renderLayers, renderLayerAxis, syncLayerAxis } from "./graph/layerAxis.js";

import { buildDefMap, parseDefinition, expandExpr, syncOrder, shouldRequest } from "./expr/defs.js";
import * as expr from "./expr/exprUI.js";

import { fetchTruthTable, fetchBdd } from "./net/api.js";

import { animateReduceTerminals } from "./reduce/terminals.js";
import { animateRemoveRedundantTests } from "./reduce/redundant.js";

import { setupKeyboard } from "./keyboard/keyboard.js";

const state = createState();
const dom = getDom();

const cy = createCy(dom.cyContainer);

const axis = {
  render(vars) {
    renderLayerAxis(dom.layerAxisEl, vars, cy);
  },
  sync() {
    syncLayerAxis(dom.layerAxisEl, cy);
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

async function updateBddForActive(isLive = true) {
  const prep = prepareActiveExpr();

  if (!prep.ok) {
    if (prep.reason === "empty") {
      clearGraph(cy);
      axis.sync();
      setReduceButtonsEnabled(false);
    }
    return;
  }

  const { expanded, vars } = prep;
  if (isLive && !shouldRequest(expanded)) return;

  const mySeq = ++state.bddReqSeq;

  try {
    const resp = await fetchBdd(expanded, vars);

    if (mySeq !== state.bddReqSeq) return;

    if (!resp.ok) {
      if (isLive && resp.status === 400) return;
      clearGraph(cy);
      setReduceButtonsEnabled(false);
      axis.sync();
      return;
    }

    const data = await resp.json();
    if (mySeq !== state.bddReqSeq) return;

    if (data?.elements?.nodes && data?.elements?.edges) {
      state.lastBddPayload = { expr: expanded, vars };
      state.lastBddElements = data.elements;

      setGraphAnimated(
        cy,
        data.elements,
        ANIM,
        { onAfterLayout: () => axis.sync() }
      );

      setReduceButtonsEnabled(true);
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

function wireButtons() {
  dom.btnAdd?.addEventListener("click", () => {
    expr.addLine(ctx, "");
    expr.focusActiveInputSoon(dom);
  });

  dom.btnClearAll?.addEventListener("click", () => {
    expr.clearAll(ctx);
    clearGraph(cy);
    setReduceButtonsEnabled(false);
    axis.sync();
  });

  dom.btnFit?.addEventListener("click", () => cy.fit(undefined, 30));

  dom.btnReduce?.addEventListener("click", async () => {
    if (!state.lastBddPayload) return;
    await animateReduceTerminals(cy, { onAfter: () => axis.sync() });
    await animateRemoveRedundantTests(cy, { onAfterBatch: () => axis.sync() });
  });

  dom.btnReduceTerminals?.addEventListener("click", async () => {
    if (!state.lastBddPayload) return;
    await animateReduceTerminals(cy, { onAfter: () => axis.sync() });
  });

  dom.btnReduceRedundant?.addEventListener("click", async () => {
    if (!state.lastBddPayload) return;
    await animateRemoveRedundantTests(cy, { onAfterBatch: () => axis.sync() });
  });

  dom.btnReduceMerge?.addEventListener("click", async () => {
    return;
  });
}

function wireCyEvents() {
  cy.on("render", () => axis.sync());
  cy.on("layoutstop", () => axis.sync());
  cy.on("pan zoom resize", () => axis.sync());
}

function init() {
  setReduceButtonsEnabled(false);

  expr.renderExprList(ctx);
  expr.setActiveIndex(state, dom, 0);

  clearGraph(cy);
  axis.sync();

  setupKeyboard({ ...ctx, expr });
  wireButtons();
  wireCyEvents();

  dom.backendInfo && (dom.backendInfo.textContent = "Backend: /api/bdd");
}

init();