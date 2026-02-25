//// -----------------------------
//// Config
//// -----------------------------
//const ANIM = {
//  stepMs: 50,       // delay between each reveal
//  nodeFadeMs: 90,  // node fade duration
//  edgeFadeMs: 90   // edge fade duration
//};
//
//// -----------------------------
//// State
//// -----------------------------
//const state = {
//  apList: ["p", "q", "r", "s"],
//  expressions: [
//    { id: crypto.randomUUID(), text: "", order: [] },
//  ],
//  activeIndex: 0,
//  selectedForApply: new Set(),
//  focusedInput: null,
//  ttTimer: null,
//  bddTimer: null,
//  lastBddPayload: null,
//  lastBddElements: null,
//
//};
//
//// -----------------------------
//// DOM
//// -----------------------------
//const exprListEl = document.getElementById("exprList");
//const selectedInfo = document.getElementById("selectedInfo");
//const layersListEl = document.getElementById("layersList");
//const layerAxisEl = document.getElementById("layerAxis");
//const keyboardRoot = document.getElementById("keyboard");
//const btnKbdToggle = document.getElementById("btnKbdToggle");
//
//// -----------------------------
//// Cytoscape init
//// -----------------------------
//const cy = cytoscape({
//  container: document.getElementById("cy"),
//  elements: [],
//  style: [
//    {
//      selector: "node",
//      style: {
//        "label": "data(label)",
//        "text-valign": "center",
//        "text-halign": "center",
//        "width": 42,
//        "height": 42,
//        "border-width": 2,
//        "border-color": "#cfd4df",
//        "background-color": "#ffffff",
//        "font-size": 12
//      }
//    },
//    {
//      selector: "node.focus",
//      style: {
//        "border-width": 6,
//        "border-color": "#2563eb"
//      }
//    },
//
//    {
//      selector: "node.terminal",
//      style: {
//        "shape": "round-rectangle",
//        "width": 48,
//        "height": 34,
//        "border-color": "#b6bccb",
//        "font-weight": 700
//      }
//    },
//
//    {
//      selector: "edge",
//      style: {
//        "curve-style": "bezier",
//        "target-arrow-shape": "triangle",
//        "arrow-scale": 0.9,
//        "width": 2,
//        "line-color": "#cfd4df",
//        "target-arrow-color": "#cfd4df",
//        "label": "data(label)",
//        "font-size": 10,
//        "text-rotation": "autorotate",
//        "text-margin-y": -8
//      }
//    },
//
//    {
//      selector: ".dim",
//      style: { "opacity": 0.15 }
//    },
//
//    {
//      selector: "edge.dim",
//      style: { "opacity": 0.08 }
//    },
//
//    { selector: "edge.zero", style: { "line-style": "dashed" } },
//    { selector: "edge.one", style: { "line-style": "solid" } }
//  ],
//  layout: { name: "breadthfirst", directed: true, spacingFactor: 1.25 }
//});
//
//let graphAnimToken = 0;
//
//function setKeyboardCollapsed(collapsed) {
//  if (!keyboardRoot) return;
//  keyboardRoot.classList.toggle("is-collapsed", collapsed);
//  if (btnKbdToggle) btnKbdToggle.setAttribute("aria-expanded", String(!collapsed));
//
//  requestAnimationFrame(() => {
//    cy.resize();
//    cy.fit(undefined, 30);
//    syncLayerAxis();
//  });
//}
//
//btnKbdToggle?.addEventListener("click", () => {
//  const collapsed = keyboardRoot.classList.contains("is-collapsed");
//  setKeyboardCollapsed(!collapsed);
//});
//
//function hasPresetPositions(elements) {
//  return !!(elements?.nodes || []).some(n => n && n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y));
//}
//
//function setGraphInstant(elements) {
//  cy.stop();
//  cy.elements().stop();
//  cy.elements().remove();
//  cy.add(elements);
//  cy.nodes().ungrabify();
//
//  const preset = hasPresetPositions(elements);
//  const layoutOpts = preset
//    ? { name: "preset", fit: true, padding: 30 }
//    : { name: "breadthfirst", directed: true, spacingFactor: 1.35, fit: true, padding: 30 };
//
//  cy.layout(layoutOpts).run();
//  cy.resize();
//  cy.fit(undefined, 30);
//  syncLayerAxis();
//}
//
//function cancelAllGraphAnims() {
//  graphAnimToken++;
//  cy.stop();
//  cy.elements().stop();
//}
//
//async function runReduceStep1_TerminalsOnly() {
//  cancelAllGraphAnims();
//  await animateReduceTerminals();
//}
//
//async function runReduceStep2_RedundantTestsOnly() {
//  cancelAllGraphAnims();
//
//  // Step 2 animation
//  await animateRemoveRedundantTests();
//}
//
//async function runReduceStep3_MergeNonTerminalOnly() {
//  cancelAllGraphAnims();
//
//  // await animateMergeNonTerminals();
//}
//
//const btnReduceTerminals = document.getElementById("btnReduceTerminals");
//const btnReduceRedundant = document.getElementById("btnReduceRedundant");
//const btnReduceMerge = document.getElementById("btnReduceMerge");
//
//function setReduceButtonsEnabled(enabled) {
//  [btnReduceTerminals, btnReduceRedundant, btnReduceMerge].forEach(b => {
//    if (!b) return;
//    b.disabled = !enabled;
//  });
//}
//
//// Define "graph ready" as: we have payload + graph has nodes
//function isGraphReady() {
//  return !!state.lastBddPayload && cy.nodes().length > 0;
//}
//
//document.getElementById("btnReduceTerminals")?.addEventListener("click", runReduceStep1_TerminalsOnly);
//document.getElementById("btnReduceRedundant")?.addEventListener("click", runReduceStep2_RedundantTestsOnly);
//document.getElementById("btnReduceMerge")?.addEventListener("click", runReduceStep3_MergeNonTerminalOnly);
//
//function sleep(ms) {
//  return new Promise((r) => setTimeout(r, ms));
//}
//
//function setGraphAnimated(
//  elements,
//  { stepMs = 80, nodeFadeMs = 120, edgeFadeMs = 120 } = {}
//) {
//  const token = ++graphAnimToken;
//
//  // Stop ongoing animations/layouts
//  cy.stop();
//  cy.elements().stop();
//
//  // Reset graph
//  cy.elements().remove();
//  cy.add(elements);
//  cy.nodes().ungrabify();
//  cy.elements().style("opacity", 0);
//
//  // Layout once (no animation)
//  const preset = hasPresetPositions(elements);
//  cy.layout(
//    preset
//      ? { name: "preset", animate: false, fit: true, padding: 30 }
//      : { name: "breadthfirst", directed: true, spacingFactor: 1.35, animate: false, fit: true, padding: 30 }
//  ).run();
//  cy.resize();
//  cy.fit(undefined, 30);
//  syncLayerAxis();
//
//  // Run after layout; keep viewport stable during the reveal
//  setTimeout(async () => {
//    if (token !== graphAnimToken) {
//      cy.elements().style("opacity", 1);
//      return;
//    }
//
//    const vp = cy.viewport();
//    const nodes = cy.nodes();
//    const edges = cy.edges();
//
//    // Build incoming count to find root (node with indegree 0)
//    const indeg = new Map();
//    nodes.forEach((n) => indeg.set(n.id(), 0));
//    edges.forEach((e) => {
//      const tgt = e.target().id();
//      indeg.set(tgt, (indeg.get(tgt) || 0) + 1);
//    });
//
//    const roots = nodes.filter((n) => (indeg.get(n.id()) || 0) === 0);
//    const root = roots[0];
//
//    if (!root) {
//      // Fallback: just reveal everything
//      cy.elements().animate({ style: { opacity: 1 } }, { duration: nodeFadeMs });
//      return;
//    }
//
//    // Outgoing adjacency: nodeId -> [{ edge, childNode }]
//    const out = new Map();
//    nodes.forEach((n) => out.set(n.id(), []));
//
//    edges.forEach((e) => {
//      const src = e.source().id();
//      const tgt = e.target().id();
//      out.get(src).push({ edge: e, child: cy.getElementById(tgt) });
//    });
//
//    // Optional: ensure low(0) branch reveals before high(1)
//    function branchOrder(a, b) {
//      const la = (a.edge.data("label") ?? "").toString();
//      const lb = (b.edge.data("label") ?? "").toString();
//      // Expect "0"/"1" labels; adjust if your labels differ
//      if (la === lb) return 0;
//      if (la === "0") return -1;
//      if (lb === "0") return 1;
//      if (la === "1") return -1;
//      if (lb === "1") return 1;
//      return la.localeCompare(lb);
//    }
//
//    out.forEach((arr) => arr.sort(branchOrder));
//
//    // Build a strict action list: node -> edge -> node -> edge -> node...
//    const seenNodes = new Set();
//    const seenEdges = new Set();
//    const actions = [];
//
//    function dfs(n) {
//      const nid = n.id();
//      if (!seenNodes.has(nid)) {
//        seenNodes.add(nid);
//        actions.push({ kind: "node", id: nid });
//      }
//
//      const nexts = out.get(nid) || [];
//      for (const { edge, child } of nexts) {
//        const eid = edge.id();
//
//        if (!seenEdges.has(eid)) {
//          seenEdges.add(eid);
//          actions.push({ kind: "edge", id: eid });
//        }
//
//        // Always reveal the child node after its connecting edge
//        const cid = child.id();
//        if (!seenNodes.has(cid)) {
//          seenNodes.add(cid);
//          actions.push({ kind: "node", id: cid });
//          dfs(child);
//        } else {
//          // Node already seen; still continue DFS is optional
//          // dfs(child);
//        }
//      }
//    }
//
//    dfs(root);
//
//    // Playback
//    for (const a of actions) {
//      if (token !== graphAnimToken) {
//        cy.elements().style("opacity", 1);
//        return;
//      }
//
//      // Keep viewport stable (no focus-jump)
//      cy.viewport(vp);
//
//      if (a.kind === "node") {
//        const el = cy.getElementById(a.id);
//        el.animate({ style: { opacity: 1 } }, { duration: nodeFadeMs });
//      } else {
//        const el = cy.getElementById(a.id);
//        el.animate({ style: { opacity: 1 } }, { duration: edgeFadeMs });
//      }
//
//      await sleep(stepMs);
//    }
//  }, 0);
//}
//
//function renderLayers(vars) {
//  if (!layersListEl) return;
//  layersListEl.innerHTML = "";
//
//  if (!Array.isArray(vars) || vars.length === 0) {
//    layersListEl.innerHTML = `<div class="small">No variables</div>`;
//    return;
//  }
//
//  vars.forEach((v, i) => {
//    const row = document.createElement("div");
//    row.className = "layer-row";
//    row.innerHTML = `<span> ${v} </span><span class="layer-idx">level ${i+1}</span>`;
//    layersListEl.appendChild(row);
//  });
//}
//
//const Y_GAP = 90;
//
//let axisVars = [];
//
//function renderLayerAxis(vars) {
//  axisVars = Array.isArray(vars) ? vars.slice() : [];
//  if (!layerAxisEl) return;
//
//  layerAxisEl.innerHTML = "";
//
//  for (const v of axisVars) {
//    const tick = document.createElement("div");
//    tick.className = "layer-tick";
//    tick.dataset.kind = "var";
//    tick.dataset.var = v;
//    tick.innerHTML = `<span class="layer-dot"></span><span>${v}</span>`;
//    layerAxisEl.appendChild(tick);
//  }
//
//  const t = document.createElement("div");
//  t.className = "layer-tick";
//  t.dataset.kind = "terminal";
//  t.innerHTML = `<span class="layer-dot"></span><span>0/1</span>`;
//  layerAxisEl.appendChild(t);
//
//  syncLayerAxis();
//}
//
//function syncLayerAxis() {
//  if (!layerAxisEl) return;
//
//  // vars
//  for (const v of axisVars) {
//    const ry = levelRenderedYFromGraph(v);
//    const el = layerAxisEl.querySelector(
//      `.layer-tick[data-kind="var"][data-var="${CSS.escape(v)}"]`
//    );
//    if (!el) continue;
//
//    if (ry == null) el.style.display = "none";
//    else {
//      el.style.display = "";
//      el.style.top = `${renderedYToAxisTop(ry)}px`;
//    }
//  }
//
//  // terminal
//  const tryY = terminalRenderedYFromGraph();
//  const tel = layerAxisEl.querySelector(`.layer-tick[data-kind="terminal"]`);
//  if (tel) {
//    if (tryY == null) tel.style.display = "none";
//    else {
//      tel.style.display = "";
//      tel.style.top = `${renderedYToAxisTop(tryY)}px`;
//    }
//  }
//}
//
//function median(nums) {
//  const a = nums.slice().sort((x, y) => x - y);
//  const m = Math.floor(a.length / 2);
//  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
//}
//
//function levelRenderedYFromGraph(varName) {
//  const ys = cy.nodes()
//    .filter(n => !n.hasClass("terminal") && n.data("label") === varName)
//    .map(n => n.renderedPosition("y"));
//
//  if (!ys.length) return null;
//  return median(ys);
//}
//
//function terminalRenderedYFromGraph() {
//  const ys = cy.nodes()
//    .filter(n => n.hasClass("terminal") || n.data("label") === "0" || n.data("label") === "1")
//    .map(n => n.renderedPosition("y"));
//
//  if (!ys.length) return null;
//  return median(ys);
//}
//
//function renderedYToAxisTop(renderedY) {
//  const cyRect = cy.container().getBoundingClientRect();
//  const axisRect = layerAxisEl.getBoundingClientRect();
//  return renderedY + (cyRect.top - axisRect.top);
//}
//
//function clearGraph() {
//  graphAnimToken++; // cancel any in-flight animation
//  cy.stop();
//  cy.elements().stop();
//  cy.elements().remove();
//  setReduceButtonsEnabled(false);
//}
//
//
//// -----------------------------
//// Parsing definitions + expansion
//// -----------------------------
//function parseDefinition(text) {
//  const t = (text || "").trim();
//  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
//  if (!m) return null;
//  const name = m[1];
//  const rhs = (m[2] || "").trim();
//  if (!rhs) return null;
//  return { name, rhs };
//}
//
//function buildDefMap() {
//  const defs = new Map();
//  for (const line of state.expressions) {
//    const d = parseDefinition(line.text);
//    if (d) defs.set(d.name, d.rhs);
//  }
//  return defs;
//}
//
//function expandExpr(text, defs) {
//  const tokens = (text || "").split(/(\b[A-Za-z_][A-Za-z0-9_]*\b)/g);
//
//  const expanding = new Set();
//
//  function expandName(name) {
//    if (!defs.has(name)) return name;
//    if (expanding.has(name)) {
//      throw new Error(`Cyclic definition detected: ${name}`);
//    }
//    expanding.add(name);
//    const rhs = defs.get(name);
//    const out = `(${expand(rhs)})`;
//    expanding.delete(name);
//    return out;
//  }
//
//  function expand(s) {
//    const parts = (s || "").split(/(\b[A-Za-z_][A-Za-z0-9_]*\b)/g);
//    return parts.map(p => {
//      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
//        if (p.toLowerCase() === "true" || p.toLowerCase() === "false") return p;
//        return expandName(p);
//      }
//      return p;
//    }).join("");
//  }
//
//  return tokens.map(p => {
//    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
//      if (p.toLowerCase() === "true" || p.toLowerCase() === "false") return p;
//      return expandName(p);
//    }
//    return p;
//  }).join("");
//}
//
//function inferVars(exprText) {
//  const matches = (exprText || "").match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
//  const out = [];
//  const seen = new Set();
//  for (const m of matches) {
//    const k = m.toLowerCase();
//    if (k === "true" || k === "false") continue;
//    if (!seen.has(m)) {
//      seen.add(m);
//      out.push(m);
//    }
//  }
//  return out;
//}
//
//function syncOrder(exprText, currentOrder) {
//  const used = inferVars(exprText);
//  if (used.length === 0) return [];
//
//  const order = Array.isArray(currentOrder) ? [...currentOrder] : [];
//  const kept = order.filter(v => used.includes(v));
//  const appended = used.filter(v => !kept.includes(v));
//  return kept.concat(appended);
//}
//
//function shouldRequest(expr) {
//  const s = (expr || "").trim();
//  if (!s) return false;
//
//  // 1) Parentheses balance
//  let bal = 0;
//  for (const ch of s) {
//    if (ch === "(") bal++;
//    else if (ch === ")") bal--;
//    if (bal < 0) return false; // ")(" like cases are invalid
//  }
//  if (bal !== 0) return false; // still unclosed "("
//
//  // 2) Must not end with a binary operator
//  // Adjust to your operators set
//  const endsWithBinaryOp = /[∧∨⊕→↔]$/.test(s);
//  if (endsWithBinaryOp) return false;
//
//  // 3) Must not end with negation only
//  if (/¬$/.test(s)) return false;
//
//  // 4) Must not contain two binary ops in a row (very common while typing)
//  if (/[∧∨⊕→↔]{2,}/.test(s)) return false;
//
//  return true;
//}
//
//
//// -----------------------------
//// Expressions UI (inline inputs)
//// -----------------------------
//function focusIndex(idx, placeCursorAtEnd = true) {
//  queueMicrotask(() => {
//    const item = exprListEl.querySelector(`.expr-item[data-index="${idx}"]`);
//    const input = item?.querySelector(".expr-input");
//    if (!input) return;
//
//    input.focus();
//    state.focusedInput = input;
//
//    if (placeCursorAtEnd) {
//      const n = input.value.length;
//      input.setSelectionRange(n, n);
//    }
//  });
//}
//
//function updateSelectedInfo() {
//  const active = state.expressions[state.activeIndex];
//  if (!active) {
//    selectedInfo.textContent = "No selection";
//    return;
//  }
//  const applyPick = [...state.selectedForApply].map(i => i + 1).join(", ");
//  selectedInfo.textContent =
//    `Selected: #${state.activeIndex + 1}` + (applyPick ? ` | Apply: [${applyPick}]` : "");
//}
//
//function updateActiveClass() {
//  const items = exprListEl.querySelectorAll(".expr-item");
//  items.forEach((el) => {
//    const idx = Number(el.dataset.index);
//    el.classList.toggle("active", idx === state.activeIndex);
//  });
//}
//
//function updateOrderBarOnly(idx) {
//  const item = exprListEl.querySelector(`.expr-item[data-index="${idx}"]`);
//  if (!item) return;
//
//  const bar = item.querySelector(".order-bar");
//  if (!bar) return;
//
//  bar.innerHTML = "";
//  const expr = state.expressions[idx];
//  const order = expr.order || [];
//
//  if (order.length === 0) {
//    bar.style.display = "none";
//    return;
//  }
//  bar.style.display = "flex";
//
//  for (const v of order) {
//    const chip = document.createElement("div");
//    chip.className = "chip";
//    chip.draggable = true;
//    chip.dataset.var = v;
//
//    const label = document.createElement("span");
//    label.textContent = v;
//    chip.appendChild(label);
//
//    chip.addEventListener("dragstart", (e) => {
//      chip.classList.add("dragging");
//      e.dataTransfer.effectAllowed = "move";
//      e.dataTransfer.setData("text/plain", v);
//      bar.dataset.dragVar = v;
//    });
//
//    chip.addEventListener("dragend", () => {
//      chip.classList.remove("dragging");
//      clearDropTargets(bar);
//      delete bar.dataset.dragVar;
//    });
//
//    chip.addEventListener("dragover", (e) => {
//      e.preventDefault();
//      const dragVar = bar.dataset.dragVar;
//      if (!dragVar || dragVar === v) return;
//      chip.classList.add("drop-target");
//      e.dataTransfer.dropEffect = "move";
//    });
//
//    chip.addEventListener("dragleave", () => {
//      chip.classList.remove("drop-target");
//    });
//
//    chip.addEventListener("drop", (e) => {
//      e.preventDefault();
//      const dragVar = e.dataTransfer.getData("text/plain") || bar.dataset.dragVar;
//      if (!dragVar || dragVar === v) return;
//
//      // If you want the dragged line to become active:
//      if (state.activeIndex !== idx) setActiveIndex(idx);
//
//      reorderVar(idx, dragVar, v);
//      updateOrderBarOnly(idx);
//
//      scheduleTruthTable();
//      scheduleBdd();
//
//      clearDropTargets(bar);
//    });
//
//
//    bar.appendChild(chip);
//  }
//
//  function clearDropTargets(container) {
//    const targets = container.querySelectorAll(".chip.drop-target");
//    targets.forEach(t => t.classList.remove("drop-target"));
//  }
//}
//
//function setActiveIndex(idx) {
//  if (idx < 0 || idx >= state.expressions.length) return;
//  state.activeIndex = idx;
//  updateActiveClass();
//  updateSelectedInfo();
//  focusIndex(idx);
//}
//
//function onLineChanged(idx, inputEl, { runNetwork = true } = {}) {
//  const e = state.expressions[idx];
//  e.text = inputEl.value;
//
//  if (!e.text.trim()) {
//    e.order = [];
//  } else {
//    e.order = syncOrder(e.text, e.order);
//  }
//
//  state.activeIndex = idx;
//  updateActiveClass();
//  updateSelectedInfo();
//  updateOrderBarOnly(idx);
//
//  if (runNetwork) {
//    scheduleTruthTable();
//    scheduleBdd();
//  }
//}
//
//function renderExprList() {
//  exprListEl.innerHTML = "";
//
//  state.expressions.forEach((expr, idx) => {
//    const item = document.createElement("div");
//    item.className = "expr-item" + (idx === state.activeIndex ? " active" : "");
//    item.dataset.index = String(idx);
//
//    const index = document.createElement("div");
//    index.className = "expr-index";
//    index.textContent = String(idx + 1);
//
//    const mid = document.createElement("div");
//    mid.className = "expr-mid";
//
//    const input = document.createElement("input");
//    input.className = "expr-input";
//    input.id = `expr-${idx}`;
//    input.name = `expr-${idx}`;
//    input.value = expr.text || "";
//    input.placeholder = "";
//
//    input.addEventListener("focus", () => {
//      state.focusedInput = input;
//      if (state.activeIndex !== idx) {
//        state.activeIndex = idx;
//        updateActiveClass();
//        updateSelectedInfo();
//      }
//    });
//
//    input.addEventListener("blur", () => {
//      if (state.focusedInput === input) state.focusedInput = null;
//    });
//
//    input.addEventListener("input", () => {
//      onLineChanged(idx, input);
//    });
//
//    mid.appendChild(input);
//
//    const orderBar = document.createElement("div");
//    orderBar.className = "order-bar";
//    mid.appendChild(orderBar);
//
//    const del = document.createElement("button");
//    del.className = "expr-del";
//    del.textContent = "×";
//    del.title = "Delete";
//    del.addEventListener("click", (ev) => {
//      ev.stopPropagation();
//      clearLineAt(idx);
//    });
//
//    item.addEventListener("click", () => setActiveIndex(idx));
//    item.addEventListener("dblclick", () => toggleSelectForApply(idx));
//
//    item.appendChild(index);
//    item.appendChild(mid);
//    item.appendChild(del);
//
//    exprListEl.appendChild(item);
//
//    updateOrderBarOnly(idx);
//  });
//
//  updateSelectedInfo();
//}
//
//function clearLineAt(idx) {
//  const item = exprListEl.querySelector(`.expr-item[data-index="${idx}"]`);
//  const input = item?.querySelector(".expr-input");
//  if (!input) return;
//  input.value = "";
//  onLineChanged(idx, input);
//}
//
//function focusActiveInputSoon() {
//  queueMicrotask(() => {
//    const active = exprListEl.querySelector(".expr-item.active .expr-input");
//    if (active) active.focus();
//  });
//}
//
//function addLine(text = "") {
//  const order = syncOrder(text, []);
//  state.expressions.push({ id: crypto.randomUUID(), text, order });
//  renderExprList();
//  setActiveIndex(state.expressions.length - 1);
//}
//
//function deleteLine(idx) {
//  state.expressions.splice(idx, 1);
//
//  if (state.expressions.length === 0) {
//    state.expressions.push({ id: crypto.randomUUID(), text: "", order: [] });
//  }
//
//  // adjust selectedForApply (same as your logic)
//  const newSet = new Set();
//  for (const i of state.selectedForApply) {
//    if (i === idx) continue;
//    newSet.add(i > idx ? i - 1 : i);
//  }
//  state.selectedForApply = newSet;
//
//  renderExprList();
//
//  const next = Math.max(0, Math.min(idx, state.expressions.length - 1));
//  setActiveIndex(next);
//}
//
//function reorderVar(exprIndex, dragVar, dropVar) {
//  const order = state.expressions[exprIndex].order || [];
//  const from = order.indexOf(dragVar);
//  const to = order.indexOf(dropVar);
//  if (from === -1 || to === -1 || from === to) return;
//
//  order.splice(from, 1);
//  order.splice(to, 0, dragVar);
//}
//
//function clearAll() {
//  state.expressions = [{ id: crypto.randomUUID(), text: "", order: [] }];
//  state.activeIndex = 0;
//  state.selectedForApply.clear();
//  renderExprList();
//}
//
//function toggleSelectForApply(idx) {
//  if (state.selectedForApply.has(idx)) state.selectedForApply.delete(idx);
//  else {
//    if (state.selectedForApply.size >= 2) {
//      const first = state.selectedForApply.values().next().value;
//      state.selectedForApply.delete(first);
//    }
//    state.selectedForApply.add(idx);
//  }
//  renderExprList();
//}
//
//const TT_DEBOUNCE_MS = 25;
//const BDD_DEBOUNCE_MS = 45;
//
//function scheduleTruthTable() {
//  if (state.ttTimer) clearTimeout(state.ttTimer);
//  state.ttTimer = setTimeout(() => updateTruthTableForActive(true), TT_DEBOUNCE_MS);
//}
//
//let bddReqSeq = 0;
//
//function scheduleBdd() {
//  if (state.bddTimer) clearTimeout(state.bddTimer);
//  state.bddTimer = setTimeout(() => updateBddForActive(true), BDD_DEBOUNCE_MS);
//}
//
//function prepareActiveExpr() {
//  const active = state.expressions[state.activeIndex];
//  const raw = (active?.text || "").trim();
//  if (!raw) return { ok: false, reason: "empty" };
//
//  try {
//    const defs = buildDefMap();
//    const d = parseDefinition(raw);
//    let expanded = d ? d.rhs : raw;
//    expanded = expandExpr(expanded, defs);
//
//    const vars = syncOrder(expanded, active.order);
//    active.order = vars;
//    updateOrderBarOnly(state.activeIndex);
//    renderLayers(vars);
//    renderLayerAxis(vars);
//
//    return { ok: true, active, raw, expanded, vars };
//  } catch (e) {
//    return { ok: false, reason: "expand_failed", error: e };
//  }
//}
//
//
//async function updateTruthTableForActive(isLive = true) {
//  const prep = prepareActiveExpr();
//  if (!prep.ok) return;
//
//  const { expanded, vars } = prep;
//
//  if (isLive && !shouldRequest(expanded)) return;
//
//  try {
//    const ttResp = await fetch("/api/truth-table", {
//      method: "POST",
//      headers: { "Content-Type": "application/json" },
//      body: JSON.stringify({ expr: expanded, vars })
//    });
//
//    if (!ttResp.ok) {
//      if (isLive && ttResp.status === 400) return;
//      const txt = await ttResp.text();
//      throw new Error(`HTTP ${ttResp.status}: ${txt}`);
//    }
//
//    const data = await ttResp.json();
//    // render table...
//  } catch (err) {
//
//  }
//}
//
//async function updateBddForActive(isLive = true) {
//  const prep = prepareActiveExpr();
//
//  if (!prep.ok) {
//    if (prep.reason === "empty") {
//      clearGraph();
//      syncLayerAxis();
//    }
//    return;
//  }
//
//  const { expanded, vars } = prep;
//  if (isLive && !shouldRequest(expanded)) return;
//
//  const mySeq = ++bddReqSeq;
//
//  let resp;
//  try {
//    resp = await fetch("/api/bdd", {
//      method: "POST",
//      headers: { "Content-Type": "application/json" },
//      body: JSON.stringify({ expr: expanded, vars })
//    });
//
//    if (mySeq !== bddReqSeq) return;
//
//    if (!resp.ok) {
//      if (isLive && resp.status === 400) return;
//      clearGraph();
//      return;
//    }
//
//    const data = await resp.json();
//    if (mySeq !== bddReqSeq) return;
//
//    if (data?.elements?.nodes && data?.elements?.edges) {
//      state.lastBddPayload = { expr: expanded, vars };
//      state.lastBddElements = data.elements;
//
//      setGraphAnimated(data.elements, ANIM);
//
//      setReduceButtonsEnabled(true);
//    } else {
//      clearGraph();
//      setReduceButtonsEnabled(false);
//    }
//  } catch (err) {
//    console.error("BDD fetch failed:", err);
//    if (mySeq === bddReqSeq) clearGraph();
//  }
//}
//
//const REDUCE_ANIM = { frameMs: 520 };
//
//function clearFocus() {
//  cy.nodes().removeClass("focus");
//}
//
//function applyFocus(ids) {
//  clearFocus();
//  if (!Array.isArray(ids)) return;
//  for (const id of ids) {
//    const n = cy.getElementById(id);
//    if (n && n.length) n.addClass("focus");
//  }
//}
//
//const LAYER_LAYOUT = {
//  moveMs: 520,
//  fitPadding: 50,
//  minSpan: 240
//};
//
//function isTerminalNode(n) {
//  const lab = (n.data("label") ?? "").toString();
//  return n.hasClass("terminal") || lab === "0" || lab === "1";
//}
//
//async function spreadLayerX(layerNodes, { duration = LAYER_LAYOUT.moveMs } = {}) {
//  const ns = (layerNodes || cy.collection()).filter(n => n.isNode() && !isTerminalNode(n));
//  const n = ns.length;
//  if (n <= 1) return;
//
//  const ext = cy.extent(); // model coords
//  const width = Math.max(ext.x2 - ext.x1, LAYER_LAYOUT.minSpan);
//
//  const ys = ns.map(x => x.position("y"));
//  const y = ys.reduce((a,b)=>a+b,0) / ys.length;
//
//  const sorted = ns.sort((a,b) => a.position("x") - b.position("x"));
//
//  const left = ext.x1;
//  const step = width / (n + 1);
//
//  const anims = [];
//  sorted.forEach((node, i) => {
//    const x = left + step * (i + 1);
//    anims.push(
//      node.animation(
//        { position: { x, y } },
//        { duration, easing: "ease-in-out" }
//      ).play().promise()
//    );
//  });
//
//  await Promise.all(anims);
//}
//
//function fitLayer(layerNodes, { padding = LAYER_LAYOUT.fitPadding } = {}) {
//  const ns = (layerNodes || cy.collection()).filter(n => n.isNode());
//  if (!ns.length) return;
//
//  const neighborhood = ns
//    .union(ns.connectedEdges())
//    .union(ns.connectedNodes());
//
//  cy.fit(neighborhood, padding);
//}
//
//function extentWidthWithMin(minSpan = 240) {
//  const ext = cy.extent();
//  return Math.max(ext.x2 - ext.x1, minSpan);
//}
//
//async function spreadTerminalsX(termNodes, { duration = 700, y = null } = {}) {
//  const ns = (termNodes || cy.collection()).filter(n => n.isNode() && isTerminalNode(n));
//  const n = ns.length;
//  if (n <= 1) return;
//
//  const ext = cy.extent();
//  const width = extentWidthWithMin(LAYER_LAYOUT.minSpan);
//  const left = ext.x1;
//  const step = width / (n + 1);
//
//  const yy = (y != null)
//    ? y
//    : (ns.map(x => x.position("y")).reduce((a,b)=>a+b,0) / n);
//
//  const sorted = ns.sort((a,b) => a.position("x") - b.position("x"));
//
//  const anims = [];
//  sorted.forEach((node, i) => {
//    const x = left + step * (i + 1);
//    anims.push(
//      node.animation({ position: { x, y: yy } }, { duration, easing: "ease-in-out" })
//        .play().promise()
//    );
//  });
//
//  await Promise.all(anims);
//}
//
//async function relayoutTerminalLayerEvenly({ duration = 900 } = {}) {
//  const terms = cy.nodes().filter(isTerminalNode);
//  if (terms.length <= 1) {
//    syncLayerAxis();
//    return;
//  }
//
//  const baseY = lastNonTerminalY() + TERM_ANIM.gapBelow;
//
//  cy.batch(() => {
//    terms.forEach(n => n.position({ x: n.position("x"), y: baseY }));
//  });
//
//  await spreadTerminalsX(terms, { duration, y: baseY });
//
//  syncLayerAxis();
//}
//
//// -----------------------------
//// Silent pre-pass: canonicalize terminals (NO animation)
//// Make sure there is at most one "0" terminal and one "1" terminal by ID.
//// This is a structural prerequisite for Step 2/3 if you use id-equality.
//// -----------------------------
//function canonicalizeTerminalsSilently() {
//  const terms = cy.nodes().filter(isTerminalNode);
//  if (terms.length <= 2) return;
//
//  // group by semantic terminal value ("0"/"1")
//  const groups = new Map(); // "0"/"1" -> Array<Node>
//  terms.forEach(n => {
//    const v = termValue(n);
//    if (v !== "0" && v !== "1") return;
//    if (!groups.has(v)) groups.set(v, []);
//    groups.get(v).push(n);
//  });
//
//  // If already unique, nothing to do
//  const need0 = (groups.get("0") || []).length > 1;
//  const need1 = (groups.get("1") || []).length > 1;
//  if (!need0 && !need1) return;
//
//  cy.batch(() => {
//    for (const v of ["0", "1"]) {
//      const arr = groups.get(v) || [];
//      if (arr.length <= 1) continue;
//
//      const keep = arr[0];
//
//      // Ensure the kept one is styled as terminal (optional but helpful)
//      keep.addClass("terminal");
//      keep.data("label", v);
//
//      for (let i = 1; i < arr.length; i++) {
//        const dup = arr[i];
//
//        // Rewire ALL incoming edges -> keep
//        dup.incomers("edge").forEach(e => {
//          e.move({ target: keep.id() });
//        });
//
//        // Remove duplicate terminal node
//        dup.remove();
//      }
//    }
//  });
//}
//
//function pickRootNode() {
//  const nodes = cy.nodes();
//  const edges = cy.edges();
//  const indeg = new Map();
//  nodes.forEach(n => indeg.set(n.id(), 0));
//  edges.forEach(e => {
//    const t = e.target().id();
//    indeg.set(t, (indeg.get(t) || 0) + 1);
//  });
//  const roots = nodes.filter(n => (indeg.get(n.id()) || 0) === 0);
//  return roots[0] || null;
//}
//
//async function pruneUnreachableSilently() {
//  const root = pickRootNode();
//  if (!root) return;
//
//  const reachableNodes = new Set([root.id()]);
//  const reachableEdges = new Set();
//  const stack = [root];
//
//  while (stack.length) {
//    const n = stack.pop();
//    n.outgoers("edge").forEach(e => {
//      reachableEdges.add(e.id());
//      const t = e.target();
//      if (t && t.length && !reachableNodes.has(t.id())) {
//        reachableNodes.add(t.id());
//        stack.push(t);
//      }
//    });
//  }
//
//  const deadEdges = cy.edges().filter(e => !reachableEdges.has(e.id()));
//  const deadNodes = cy.nodes().filter(n => !reachableNodes.has(n.id()));
//
//  cy.batch(() => {
//    deadEdges.remove();
//    deadNodes.remove();
//  });
//
//  await relayoutTerminalLayerEvenly({ duration: 900 });
//  syncLayerAxis();
//}
//
//// -----------------------------
//// Reduce Step 1 animation: merge duplicate terminals
//// -----------------------------
//const TERM_ANIM = {
//  highlightMs: 260,
//  slideMs: 520,
//  fadeMs: 120,
//  gapBelow: 120,     // terminals always BELOW last non-terminal layer
//  centerGapX: 36     // 0 and 1 separation at bottom center
//};
//
//function termValue(n) {
//  const lab = (n.data("label") ?? "").toString();
//  if (lab === "0" || lab === "1") return lab;
//  // fallback: some backends store value in data.value
//  const v = n.data("value");
//  if (v === 0 || v === 1 || v === "0" || v === "1") return String(v);
//  return lab; // best-effort
//}
//
//function setDimAllExcept(keepEles) {
//  cy.batch(() => {
//    cy.elements().removeClass("dim");
//    if (!keepEles || !keepEles.length) return;
//    const keep = keepEles.union(keepEles.connectedEdges()).union(keepEles.connectedNodes());
//    cy.elements().difference(keep).addClass("dim");
//  });
//}
//
//function clearDim() {
//  cy.elements().removeClass("dim");
//}
//
//function lastNonTerminalY() {
//  const ys = cy.nodes().filter(n => !isTerminalNode(n)).map(n => n.position("y"));
//  if (!ys.length) return 0;
//  return Math.max(...ys);
//}
//
//function graphCenterX() {
//  const ext = cy.extent(); // model coords
//  return (ext.x1 + ext.x2) / 2;
//}
//
//async function animateReduceTerminals() {
//  const terms = cy.nodes().filter(isTerminalNode);
//  if (terms.length <= 2) return; // already only 0/1 (or fewer)
//
//  // group by value (0/1)
//  const groups = new Map(); // "0"/"1" -> collection
//  terms.forEach(n => {
//    const v = termValue(n);
//    if (!groups.has(v)) groups.set(v, cy.collection());
//    groups.set(v, groups.get(v).add(n));
//  });
//
//  const dupGroups = [...groups.entries()].filter(([v, col]) => (v === "0" || v === "1") && col.length > 1);
//  if (!dupGroups.length) return;
//
//  // choose canonical node for each value (keep the first)
//  const canonical = new Map(); // "0"/"1" -> node
//  for (const [v, col] of dupGroups) canonical.set(v, col[0]);
//
//  const focusNodes = cy.collection();
//  dupGroups.forEach(([_, col]) => focusNodes.merge(col));
//
//  // collect incoming edges to those terminals for nicer focus
//  const focusEdges = cy.collection();
//  focusNodes.forEach(n => focusEdges.merge(n.incomers("edge")));
//
//  // 1) highlight duplicates (and dim the rest)
//  setDimAllExcept(focusNodes.union(focusEdges));
//  focusNodes.addClass("focus");
//
//  await sleep(TERM_ANIM.highlightMs);
//
//  // 2) slide horizontally so all duplicates overlap near bottom center
//  const baseY = lastNonTerminalY() + TERM_ANIM.gapBelow;
//  const cx = graphCenterX();
//
//  // two overlap targets (0/1) near center
//  const targetX = {
//    "0": cx - TERM_ANIM.centerGapX,
//    "1": cx + TERM_ANIM.centerGapX
//  };
//
//  // animate ONLY x; force y to baseY to keep last layer invariant
//  const slidePromises = [];
//  for (const [v, col] of dupGroups) {
//    const tx = targetX[v] ?? cx;
//    col.forEach(n => {
//      slidePromises.push(
//        n.animation({
//          position: { x: tx, y: baseY }
//        }, { duration: TERM_ANIM.slideMs, easing: "ease-in-out" }).play().promise()
//      );
//    });
//  }
//  await Promise.all(slidePromises);
//
//  // 3) while overlapped: rewire incoming edges of duplicates -> canonical, then remove duplicates
//  cy.batch(() => {
//    for (const [v, col] of dupGroups) {
//      const keep = canonical.get(v);
//      if (!keep) continue;
//
//      col.forEach(n => {
//        if (n.id() === keep.id()) return;
//
//        // move ALL incoming edges to point to the canonical node
//        n.incomers("edge").forEach(e => {
//          // edge.move is supported in cytoscape 3.x
//          e.move({ target: keep.id() });
//        });
//
//        // remove duplicate terminal node
//        n.remove();
//      });
//
//      // ensure canonical is exactly at final bottom position
//      keep.position({ x: targetX[v] ?? cx, y: baseY });
//    }
//  });
//
//  // 4) clean up highlight/dim
//  focusNodes.removeClass("focus");
//  clearDim();
//
//  const remainingTerms = cy.nodes().filter(isTerminalNode);
//
//  await spreadTerminalsX(remainingTerms, { duration: 900, y: baseY });
//  fitLayer(remainingTerms, { padding: 60 });
//  syncLayerAxis();
//  pruneUnreachableSilently();
//}
//
//// -----------------------------
//// Reduce Step 2 animation: remove redundant tests (low == high)
//// Bottom-up, layer by layer (using axisVars order)
//// -----------------------------
//const REDUNDANT_ANIM = {
//  highlightMs: 420,
//  fadeOutMs: 420,
//  edgeMorphMs: 520,
//  betweenBatchMs: 260
//};
//
//function getNodesAtVarLabel(v) {
//  return cy.nodes().filter(n => isNonTerminal(n) && n.data("label") === v);
//}
//
//function isNonTerminal(n) {
//  return n && n.isNode && n.isNode() && !isTerminalNode(n);
//}
//
//function pickLowHighEdges(node) {
//  const outs = node.outgoers("edge");
//  let low = null;
//  let high = null;
//
//  outs.forEach(e => {
//    const lab = (e.data("label") ?? "").toString();
//    if (lab === "0" || e.hasClass("zero")) low = e;
//    else if (lab === "1" || e.hasClass("one")) high = e;
//  });
//
//  return { low, high };
//}
//
//function edgeClassString(e) {
//  // Preserve styling classes like "zero"/"one"
//  const cls = (e.classes && e.classes()) || [];
//  return Array.isArray(cls) ? cls.join(" ") : String(cls || "");
//}
//
//function makeTempEdgeLike(oldEdge, newTargetId) {
//  const srcId = oldEdge.source().id();
//  const oldId = oldEdge.id();
//  const tmpId = `tmp-${oldId}-${crypto.randomUUID()}`;
//
//  const cls = edgeClassString(oldEdge);
//  const data = {
//    id: tmpId,
//    source: srcId,
//    target: newTargetId,
//    label: oldEdge.data("label")
//  };
//
//  const tmp = cy.add({ group: "edges", data, classes: cls });
//  tmp.style("opacity", 0);
//  return tmp;
//}
//
//async function animateRemoveRedundantTests() {
//  if (!Array.isArray(axisVars) || axisVars.length === 0) return;
//
//  const layers = axisVars.slice().reverse();
//
//  for (const v of layers) {
//    const layerNodes = getNodesAtVarLabel(v);
//    if (!layerNodes.length) continue;
//
//    const groups = new Map();
//
//    layerNodes.forEach(n => {
//      const { low, high } = pickLowHighEdges(n);
//      if (!low || !high) return;
//
//      const lowT = low.target();
//      const highT = high.target();
//      if (!lowT || !highT) return;
//
//      let child = null;
//      let key = null;
//
//      // Case A: same target node
//      if (lowT.id() === highT.id()) {
//        child = lowT;
//        key = `node:${child.id()}`;
//      } else {
//        // Case B: semantic-equal terminals (same value), WITHOUT merging terminals
//        const lowIsTerm = isTerminalNode(lowT);
//        const highIsTerm = isTerminalNode(highT);
//
//        if (lowIsTerm && highIsTerm && termValue(lowT) === termValue(highT)) {
//          // bypass to ONE of them (pick lowT), keep the other untouched
//          child = lowT;
//          key = `term:${termValue(lowT)}`; // group by value
//        } else {
//          return; // not redundant
//        }
//      }
//
//      if (!groups.has(key)) {
//        groups.set(key, {
//          child,
//          nodes: cy.collection(),
//          outEdges: cy.collection(),
//          extraFocus: cy.collection()
//        });
//      }
//
//      const g = groups.get(key);
//      g.nodes = g.nodes.add(n);
//      g.outEdges = g.outEdges.add(low).add(high);
//
//      // show BOTH terminals if they’re different (visual only)
//      if (isTerminalNode(lowT)) g.extraFocus = g.extraFocus.add(lowT);
//      if (isTerminalNode(highT)) g.extraFocus = g.extraFocus.add(highT);
//    });
//
//    if (groups.size === 0) continue;
//
//    for (const { child, nodes, outEdges, extraFocus } of groups.values()) {
//      const token = graphAnimToken;              // ✅ 定义 token
//      const ef = extraFocus || cy.collection();  // ✅ 现在 extraFocus 是解构出来的
//
//      const focus = nodes.union(outEdges).union(child).union(ef);
//      setDimAllExcept(focus);
//      nodes.addClass("focus");
//      child.addClass("focus");
//      ef.addClass("focus");
//
//      await sleep(REDUNDANT_ANIM.highlightMs);
//      if (token !== graphAnimToken) return;
//
//      const tmpEdges = [];
//      const incomingEdges = [];
//      nodes.forEach(n => n.incomers("edge").forEach(e => incomingEdges.push(e)));
//
//      cy.batch(() => {
//        incomingEdges.forEach(e => tmpEdges.push(makeTempEdgeLike(e, child.id())));
//      });
//
//      const morphPromises = [];
//      tmpEdges.forEach(te =>
//        morphPromises.push(
//          te.animation({ style: { opacity: 1 } }, { duration: REDUNDANT_ANIM.edgeMorphMs, easing: "ease-in-out" })
//            .play().promise()
//        )
//      );
//      incomingEdges.forEach(ie =>
//        morphPromises.push(
//          ie.animation({ style: { opacity: 0 } }, { duration: REDUNDANT_ANIM.edgeMorphMs, easing: "ease-in-out" })
//            .play().promise()
//        )
//      );
//
//      const fadePromises = [];
//      outEdges.forEach(e =>
//        fadePromises.push(
//          e.animation({ style: { opacity: 0 } }, { duration: REDUNDANT_ANIM.fadeOutMs, easing: "ease-in-out" })
//            .play().promise()
//        )
//      );
//      nodes.forEach(n =>
//        fadePromises.push(
//          n.animation({ style: { opacity: 0 } }, { duration: REDUNDANT_ANIM.fadeOutMs, easing: "ease-in-out" })
//            .play().promise()
//        )
//      );
//
//      await Promise.all([...morphPromises, ...fadePromises]);
//      if (token !== graphAnimToken) return;
//
//      nodes.removeClass("focus");
//      child.removeClass("focus");
//      ef.removeClass("focus");
//      clearDim();
//
//      cy.batch(() => {
//        incomingEdges.forEach(e => e?.length && e.remove());
//        tmpEdges.forEach(e => e?.length && e.style("opacity", 1));
//        outEdges.forEach(e => e?.length && e.remove());
//        nodes.forEach(n => n?.length && n.remove());
//      });
//
//      pruneUnreachableSilently();
//
//      await new Promise(r => requestAnimationFrame(r));
//      await sleep(REDUNDANT_ANIM.betweenBatchMs);
//    }
//
//    const remaining = getNodesAtVarLabel(v);
//    if (remaining.length) {
//      await spreadLayerX(remaining, { duration: 700 });
//      fitLayer(remaining, { padding: 60 });
//      syncLayerAxis();
//    }
//  }
//}
//
//async function playReduceSteps(steps) {
//  const token = ++graphAnimToken; // cancel any in-flight animation
//  for (const s of steps) {
//    if (token !== graphAnimToken) break;
//
//    document.getElementById("backendInfo").textContent = `Reduce: ${s.title}`;
//
//    setGraphInstant(s.elements);
//    applyFocus(s.focus);
//
//    await sleep(REDUCE_ANIM.frameMs);
//  }
//  clearFocus();
//  document.getElementById("backendInfo").textContent = "Backend: /api/bdd";
//}
//
//// -----------------------------
//// Keyboard
//// -----------------------------
//function insertToFocused(str) {
//  const input = state.focusedInput;
//  if (!input || !document.contains(input)) return;
//
//  input.focus();
//  const start = input.selectionStart ?? input.value.length;
//  const end = input.selectionEnd ?? input.value.length;
//  input.value = input.value.slice(0, start) + str + input.value.slice(end);
//
//  const pos = start + str.length;
//  input.setSelectionRange(pos, pos);
//
//  onLineChanged(state.activeIndex, input);
//}
//
//
//function backspaceFocused() {
//  const input = state.focusedInput;
//  if (!input || !document.contains(input)) return;
//
//  input.focus();
//  const start = input.selectionStart ?? input.value.length;
//  const end = input.selectionEnd ?? input.value.length;
//
//  if (start !== end) {
//    input.value = input.value.slice(0, start) + input.value.slice(end);
//    input.setSelectionRange(start, start);
//  } else if (start > 0) {
//    input.value = input.value.slice(0, start - 1) + input.value.slice(start);
//    input.setSelectionRange(start - 1, start - 1);
//  }
//
//  onLineChanged(state.activeIndex, input);
//}
//
//function clearLineFocused() {
//  const input = state.focusedInput;
//  if (!input || !document.contains(input)) return;
//
//  input.value = "";
//  onLineChanged(state.activeIndex, input);
//}
//
//function addAP() {
//  const next = prompt("New AP name (e.g., a or x1):");
//  if (!next) return;
//  const clean = next.trim();
//  if (!clean) return;
//  if (state.apList.includes(clean)) return;
//  state.apList.push(clean);
//
//  const row = document.getElementById("rowAP");
//  const key = document.createElement("div");
//  key.className = "key";
//  key.dataset.insert = clean;
//  key.textContent = clean;
//  row.insertBefore(key, row.lastElementChild);
//}
//
//// Keyboard event delegation
//document.querySelector(".keyboard").addEventListener("click", (e) => {
//  const key = e.target.closest(".key");
//  if (!key) return;
//
//  if (key.dataset.insert) {
//    insertToFocused(key.dataset.insert);
//    return;
//  }
//  const action = key.dataset.action;
//  if (!action) return;
//
//  if (action === "backspace") backspaceFocused();
//  else if (action === "space") insertToFocused(" ");
//  else if (action === "newLine") { addLine(""); focusActiveInputSoon(); }
//  else if (action === "addAP") addAP();
//});
//
//// -----------------------------
//// Buttons
//// -----------------------------
//document.getElementById("btnAdd").addEventListener("click", () => { addLine(""); focusActiveInputSoon(); });
//document.getElementById("btnClearAll").addEventListener("click", () => clearAll());
//document.getElementById("btnFit").addEventListener("click", () => cy.fit(undefined, 30));
//document.getElementById("btnReduce").addEventListener("click", async () => {
//  if (!state.lastBddPayload) return;
//
//  // Step 1: terminal merge animation
//  await animateReduceTerminals();
//  // Step 2: remove redundant tests (low == high)
//  await animateRemoveRedundantTests();
//});
//
//// -----------------------------
//// Init
//// -----------------------------
//setReduceButtonsEnabled(false);
//renderExprList();
//clearGraph();
//setActiveIndex(0);
//
//// Keep input focused when clicking on the on-screen keyboard
//const keyboardEl = document.querySelector(".keyboard");
//
//keyboardEl.addEventListener("pointerdown", (e) => {
//  const key = e.target.closest(".key");
//  if (!key) return;
//
//  e.preventDefault(); // prevent browser from stealing focus
//}, true);
//
//document.addEventListener("pointerdown", (e) => {
//  const insideExpr = e.target.closest(".expr-item");
//  const insideKeyboard = e.target.closest(".keyboard");
//  const insideCy = e.target.closest("#cy");
//  const insideRight = e.target.closest(".right");
//  if (insideExpr || insideKeyboard || insideCy || insideRight) return;
//
//  if (state.focusedInput && document.contains(state.focusedInput)) {
//    state.focusedInput.blur();
//  }
//  state.focusedInput = null;
//}, true);
//
//cy.on("render", syncLayerAxis);
//cy.on("layoutstop", syncLayerAxis);
//cy.on("pan zoom resize", syncLayerAxis);
