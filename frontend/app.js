// -----------------------------
// Config
// -----------------------------
const ANIM = {
  stepMs: 50,       // delay between each reveal
  nodeFadeMs: 90,  // node fade duration
  edgeFadeMs: 90   // edge fade duration
};

// -----------------------------
// State
// -----------------------------
const state = {
  apList: ["p", "q", "r", "s"],
  expressions: [
    { id: crypto.randomUUID(), text: "", order: [] },
  ],
  activeIndex: 0,
  selectedForApply: new Set(),
  focusedInput: null,
  ttTimer: null,
  bddTimer: null,

};

// -----------------------------
// DOM
// -----------------------------
const exprListEl = document.getElementById("exprList");
const selectedInfo = document.getElementById("selectedInfo");

// -----------------------------
// Cytoscape init
// -----------------------------
const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: [],
  style: [
    {
      selector: "node",
      style: {
        "label": "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "width": 42,
        "height": 42,
        "border-width": 2,
        "border-color": "#cfd4df",
        "background-color": "#ffffff",
        "font-size": 12
      }
    },
    {
      selector: "node.terminal",
      style: {
        "shape": "round-rectangle",
        "width": 48,
        "height": 34,
        "border-color": "#b6bccb",
        "font-weight": 700
      }
    },
    {
      selector: "edge",
      style: {
        "curve-style": "bezier",
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.9,
        "width": 2,
        "line-color": "#cfd4df",
        "target-arrow-color": "#cfd4df",
        "label": "data(label)",
        "font-size": 10,
        "text-rotation": "autorotate",
        "text-margin-y": -8
      }
    },
    { selector: "edge.zero", style: { "line-style": "dashed" } },
    { selector: "edge.one", style: { "line-style": "solid" } }
  ],
  layout: { name: "breadthfirst", directed: true, spacingFactor: 1.25 }
});

let graphAnimToken = 0;

function setGraphInstant(elements) {
  cy.stop();
  cy.elements().stop();
  cy.elements().remove();
  cy.add(elements);
  cy.layout({ name: "breadthfirst", directed: true, spacingFactor: 1.35 }).run();
  cy.fit(undefined, 30);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setGraphAnimated(
  elements,
  { stepMs = 80, nodeFadeMs = 120, edgeFadeMs = 120 } = {}
) {
  const token = ++graphAnimToken;

  // Stop ongoing animations/layouts
  cy.stop();
  cy.elements().stop();

  // Reset graph
  cy.elements().remove();
  cy.add(elements);

  // Hide everything first (still present for layout)
  cy.elements().style("opacity", 0);

  // Layout once (no animation)
  cy.layout({
    name: "breadthfirst",
    directed: true,
    spacingFactor: 1.35,
    animate: false,
    fit: true,
    padding: 30
  }).run();

  // Run after layout; keep viewport stable during the reveal
  setTimeout(async () => {
    if (token !== graphAnimToken) return;

    const vp = cy.viewport();
    const nodes = cy.nodes();
    const edges = cy.edges();

    // Build incoming count to find root (node with indegree 0)
    const indeg = new Map();
    nodes.forEach((n) => indeg.set(n.id(), 0));
    edges.forEach((e) => {
      const tgt = e.target().id();
      indeg.set(tgt, (indeg.get(tgt) || 0) + 1);
    });

    const roots = nodes.filter((n) => (indeg.get(n.id()) || 0) === 0);
    const root = roots[0];

    if (!root) {
      // Fallback: just reveal everything
      cy.elements().animate({ style: { opacity: 1 } }, { duration: nodeFadeMs });
      return;
    }

    // Outgoing adjacency: nodeId -> [{ edge, childNode }]
    const out = new Map();
    nodes.forEach((n) => out.set(n.id(), []));

    edges.forEach((e) => {
      const src = e.source().id();
      const tgt = e.target().id();
      out.get(src).push({ edge: e, child: cy.getElementById(tgt) });
    });

    // Optional: ensure low(0) branch reveals before high(1)
    function branchOrder(a, b) {
      const la = (a.edge.data("label") ?? "").toString();
      const lb = (b.edge.data("label") ?? "").toString();
      // Expect "0"/"1" labels; adjust if your labels differ
      if (la === lb) return 0;
      if (la === "0") return -1;
      if (lb === "0") return 1;
      if (la === "1") return -1;
      if (lb === "1") return 1;
      return la.localeCompare(lb);
    }

    out.forEach((arr) => arr.sort(branchOrder));

    // Build a strict action list: node -> edge -> node -> edge -> node...
    const seenNodes = new Set();
    const seenEdges = new Set();
    const actions = [];

    function dfs(n) {
      const nid = n.id();
      if (!seenNodes.has(nid)) {
        seenNodes.add(nid);
        actions.push({ kind: "node", id: nid });
      }

      const nexts = out.get(nid) || [];
      for (const { edge, child } of nexts) {
        const eid = edge.id();

        if (!seenEdges.has(eid)) {
          seenEdges.add(eid);
          actions.push({ kind: "edge", id: eid });
        }

        // Always reveal the child node after its connecting edge
        const cid = child.id();
        if (!seenNodes.has(cid)) {
          seenNodes.add(cid);
          actions.push({ kind: "node", id: cid });
          dfs(child);
        } else {
          // Node already seen; still continue DFS is optional
          // dfs(child);
        }
      }
    }

    dfs(root);

    // Playback
    for (const a of actions) {
      if (token !== graphAnimToken) return;

      // Keep viewport stable (no focus-jump)
      cy.viewport(vp);

      if (a.kind === "node") {
        const el = cy.getElementById(a.id);
        el.animate({ style: { opacity: 1 } }, { duration: nodeFadeMs });
      } else {
        const el = cy.getElementById(a.id);
        el.animate({ style: { opacity: 1 } }, { duration: edgeFadeMs });
      }

      await sleep(stepMs);
    }
  }, 0);
}

function clearGraph() {
  graphAnimToken++; // cancel any in-flight animation
  cy.stop();
  cy.elements().stop();
  cy.elements().remove();
}


// -----------------------------
// Parsing definitions + expansion
// -----------------------------
function parseDefinition(text) {
  const t = (text || "").trim();
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (!m) return null;
  const name = m[1];
  const rhs = (m[2] || "").trim();
  if (!rhs) return null;
  return { name, rhs };
}

function buildDefMap() {
  const defs = new Map();
  for (const line of state.expressions) {
    const d = parseDefinition(line.text);
    if (d) defs.set(d.name, d.rhs);
  }
  return defs;
}

function expandExpr(text, defs) {
  const tokens = (text || "").split(/(\b[A-Za-z_][A-Za-z0-9_]*\b)/g);

  const expanding = new Set();

  function expandName(name) {
    if (!defs.has(name)) return name;
    if (expanding.has(name)) {
      throw new Error(`Cyclic definition detected: ${name}`);
    }
    expanding.add(name);
    const rhs = defs.get(name);
    const out = `(${expand(rhs)})`;
    expanding.delete(name);
    return out;
  }

  function expand(s) {
    const parts = (s || "").split(/(\b[A-Za-z_][A-Za-z0-9_]*\b)/g);
    return parts.map(p => {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
        if (p.toLowerCase() === "true" || p.toLowerCase() === "false") return p;
        return expandName(p);
      }
      return p;
    }).join("");
  }

  return tokens.map(p => {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
      if (p.toLowerCase() === "true" || p.toLowerCase() === "false") return p;
      return expandName(p);
    }
    return p;
  }).join("");
}

function inferVars(exprText) {
  const matches = (exprText || "").match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const out = [];
  const seen = new Set();
  for (const m of matches) {
    const k = m.toLowerCase();
    if (k === "true" || k === "false") continue;
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

function syncOrder(exprText, currentOrder) {
  const used = inferVars(exprText);
  if (used.length === 0) return [];

  const order = Array.isArray(currentOrder) ? [...currentOrder] : [];
  const kept = order.filter(v => used.includes(v));
  const appended = used.filter(v => !kept.includes(v));
  return kept.concat(appended);
}


// -----------------------------
// Expressions UI (inline inputs)
// -----------------------------
function focusIndex(idx, placeCursorAtEnd = true) {
  queueMicrotask(() => {
    const item = exprListEl.querySelector(`.expr-item[data-index="${idx}"]`);
    const input = item?.querySelector(".expr-input");
    if (!input) return;

    input.focus();
    state.focusedInput = input;

    if (placeCursorAtEnd) {
      const n = input.value.length;
      input.setSelectionRange(n, n);
    }
  });
}

function updateSelectedInfo() {
  const active = state.expressions[state.activeIndex];
  if (!active) {
    selectedInfo.textContent = "No selection";
    return;
  }
  const applyPick = [...state.selectedForApply].map(i => i + 1).join(", ");
  selectedInfo.textContent =
    `Selected: #${state.activeIndex + 1}` + (applyPick ? ` | Apply: [${applyPick}]` : "");
}

function updateActiveClass() {
  const items = exprListEl.querySelectorAll(".expr-item");
  items.forEach((el) => {
    const idx = Number(el.dataset.index);
    el.classList.toggle("active", idx === state.activeIndex);
  });
}

function updateOrderBarOnly(idx) {
  const item = exprListEl.querySelector(`.expr-item[data-index="${idx}"]`);
  if (!item) return;

  const bar = item.querySelector(".order-bar");
  if (!bar) return;

  bar.innerHTML = "";
  const expr = state.expressions[idx];
  const order = expr.order || [];

  if (order.length === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";

  for (const v of order) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.draggable = true;
    chip.dataset.var = v;

    const label = document.createElement("span");
    label.textContent = v;
    chip.appendChild(label);

    chip.addEventListener("dragstart", (e) => {
      chip.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", v);
      bar.dataset.dragVar = v;
    });

    chip.addEventListener("dragend", () => {
      chip.classList.remove("dragging");
      clearDropTargets(bar);
      delete bar.dataset.dragVar;
    });

    chip.addEventListener("dragover", (e) => {
      e.preventDefault();
      const dragVar = bar.dataset.dragVar;
      if (!dragVar || dragVar === v) return;
      chip.classList.add("drop-target");
      e.dataTransfer.dropEffect = "move";
    });

    chip.addEventListener("dragleave", () => {
      chip.classList.remove("drop-target");
    });

    chip.addEventListener("drop", (e) => {
      e.preventDefault();
      const dragVar = e.dataTransfer.getData("text/plain") || bar.dataset.dragVar;
      if (!dragVar || dragVar === v) return;

      // If you want the dragged line to become active:
      if (state.activeIndex !== idx) setActiveIndex(idx);

      reorderVar(idx, dragVar, v);
      updateOrderBarOnly(idx);

      scheduleTruthTable();
      scheduleBdd();

      clearDropTargets(bar);
    });


    bar.appendChild(chip);
  }

  function clearDropTargets(container) {
    const targets = container.querySelectorAll(".chip.drop-target");
    targets.forEach(t => t.classList.remove("drop-target"));
  }
}

function setActiveIndex(idx) {
  if (idx < 0 || idx >= state.expressions.length) return;
  state.activeIndex = idx;
  updateActiveClass();
  updateSelectedInfo();
  focusIndex(idx);
}

function onLineChanged(idx, inputEl, { runNetwork = true } = {}) {
  const e = state.expressions[idx];
  e.text = inputEl.value;
  e.order = syncOrder(e.text, e.order);

  state.activeIndex = idx;
  updateActiveClass();
  updateSelectedInfo();
  updateOrderBarOnly(idx);

  if (runNetwork) {
    scheduleTruthTable();
    scheduleBdd();
  }
}

function renderExprList() {
  exprListEl.innerHTML = "";

  state.expressions.forEach((expr, idx) => {
    const item = document.createElement("div");
    item.className = "expr-item" + (idx === state.activeIndex ? " active" : "");
    item.dataset.index = String(idx);

    const index = document.createElement("div");
    index.className = "expr-index";
    index.textContent = String(idx + 1);

    const mid = document.createElement("div");
    mid.className = "expr-mid";

    const input = document.createElement("input");
    input.className = "expr-input";
    input.id = `expr-${idx}`;
    input.name = `expr-${idx}`;
    input.value = expr.text || "";
    input.placeholder = "";

    input.addEventListener("focus", () => {
      state.focusedInput = input;
      if (state.activeIndex !== idx) {
        state.activeIndex = idx;
        updateActiveClass();
        updateSelectedInfo();
      }
    });

    input.addEventListener("blur", () => {
      if (state.focusedInput === input) state.focusedInput = null;
    });

    input.addEventListener("input", () => {
      onLineChanged(idx, input);
    });

    mid.appendChild(input);

    const orderBar = document.createElement("div");
    orderBar.className = "order-bar";
    mid.appendChild(orderBar);

    const del = document.createElement("button");
    del.className = "expr-del";
    del.textContent = "×";
    del.title = "Delete";
    del.addEventListener("click", (ev) => {
      ev.stopPropagation();
      deleteLine(idx);
    });

    item.addEventListener("click", () => setActiveIndex(idx));
    item.addEventListener("dblclick", () => toggleSelectForApply(idx));

    item.appendChild(index);
    item.appendChild(mid);
    item.appendChild(del);

    exprListEl.appendChild(item);

    updateOrderBarOnly(idx);
  });

  updateSelectedInfo();
}

function focusActiveInputSoon() {
  queueMicrotask(() => {
    const active = exprListEl.querySelector(".expr-item.active .expr-input");
    if (active) active.focus();
  });
}

function addLine(text = "") {
  const order = syncOrder(text, []);
  state.expressions.push({ id: crypto.randomUUID(), text, order });
  renderExprList();
  setActiveIndex(state.expressions.length - 1);
}

function deleteLine(idx) {
  state.expressions.splice(idx, 1);

  if (state.expressions.length === 0) {
    state.expressions.push({ id: crypto.randomUUID(), text: "", order: [] });
  }

  // adjust selectedForApply (same as your logic)
  const newSet = new Set();
  for (const i of state.selectedForApply) {
    if (i === idx) continue;
    newSet.add(i > idx ? i - 1 : i);
  }
  state.selectedForApply = newSet;

  renderExprList();

  const next = Math.max(0, Math.min(idx, state.expressions.length - 1));
  setActiveIndex(next);
}

function reorderVar(exprIndex, dragVar, dropVar) {
  const order = state.expressions[exprIndex].order || [];
  const from = order.indexOf(dragVar);
  const to = order.indexOf(dropVar);
  if (from === -1 || to === -1 || from === to) return;

  order.splice(from, 1);
  order.splice(to, 0, dragVar);
}

function clearAll() {
  state.expressions = [{ id: crypto.randomUUID(), text: "", order: [] }];
  state.activeIndex = 0;
  state.selectedForApply.clear();
  renderExprList();
}

function toggleSelectForApply(idx) {
  if (state.selectedForApply.has(idx)) state.selectedForApply.delete(idx);
  else {
    if (state.selectedForApply.size >= 2) {
      const first = state.selectedForApply.values().next().value;
      state.selectedForApply.delete(first);
    }
    state.selectedForApply.add(idx);
  }
  renderExprList();
}

const TT_DEBOUNCE_MS = 25;
const BDD_DEBOUNCE_MS = 45;

function scheduleTruthTable() {
  if (state.ttTimer) clearTimeout(state.ttTimer);
  state.ttTimer = setTimeout(() => updateTruthTableForActive(true), TT_DEBOUNCE_MS);
}

let bddReqSeq = 0;

function scheduleBdd() {
  if (state.bddTimer) clearTimeout(state.bddTimer);
  state.bddTimer = setTimeout(() => updateBddForActive(true), BDD_DEBOUNCE_MS);
}

function prepareActiveExpr() {
  const active = state.expressions[state.activeIndex];
  const raw = (active?.text || "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  try {
    const defs = buildDefMap();
    let expanded = raw;

    const d = parseDefinition(raw);
    expanded = d ? d.rhs : raw;
    expanded = expandExpr(expanded, defs);

    const vars = syncOrder(expanded, active.order);
    active.order = vars;
    updateOrderBarOnly(state.activeIndex);

    return { ok: true, active, raw, expanded, vars };
  } catch (e) {
    return { ok: false, reason: "expand_failed", error: e };
  }
}

async function updateTruthTableForActive(isLive = true) {
  const prep = prepareActiveExpr();
  if (!prep.ok) return;

  const { expanded, vars } = prep;

  try {
    const ttResp = await fetch("/api/truth-table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expr: expanded, vars })
    });

    if (!ttResp.ok) {
      const txt = await ttResp.text();
      throw new Error(`HTTP ${ttResp.status}: ${txt}`);
    }

    const data = await ttResp.json();

    const rows = data.rows.map(r => {
      const obj = {};
      data.vars.forEach((v, i) => (obj[v] = r.env[i]));
      obj.out = r.out;
      return obj;
    });

    console.table(rows);
  } catch (err) {
    if (!isLive) console.warn(`Truth table request failed: ${err.message}`);
  }
}

async function updateBddForActive(isLive = true) {
  const prep = prepareActiveExpr();

  if (!prep.ok) {
    clearGraph();
    if (!isLive && prep.reason === "expand_failed") {
      console.warn(`Expand failed: ${prep.error?.message ?? prep.error}`);
    }
    return;
  }

  const { expanded, vars } = prep;

  const mySeq = ++bddReqSeq;

  try {
    const resp = await fetch("/api/bdd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expr: expanded, vars })
    });

    // ignore stale
    if (mySeq !== bddReqSeq) return;

    if (!resp.ok) {
      clearGraph();
      if (!isLive) {
        const txt = await resp.text();
        console.warn(`BDD request failed: HTTP ${resp.status}: ${txt}`);
      }
      return;
    }

    const data = await resp.json();

    // ignore stale again after await
    if (mySeq !== bddReqSeq) return;

    if (data?.elements?.nodes && data?.elements?.edges) {
      setGraphAnimated(data.elements, ANIM);
    } else {
      clearGraph();
      if (!isLive) console.warn("BDD response missing elements.");
    }
  } catch (err) {
    if (mySeq === bddReqSeq) clearGraph();
    if (!isLive) console.warn(`BDD request failed: ${err.message}`);
  }
}

// -----------------------------
// Keyboard
// -----------------------------
function insertToFocused(str) {
  const input = state.focusedInput;
  if (!input || !document.contains(input)) return;

  input.focus();
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + str + input.value.slice(end);

  const pos = start + str.length;
  input.setSelectionRange(pos, pos);

  onLineChanged(state.activeIndex, input);
}


function backspaceFocused() {
  const input = state.focusedInput;
  if (!input || !document.contains(input)) return;

  input.focus();
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;

  if (start !== end) {
    input.value = input.value.slice(0, start) + input.value.slice(end);
    input.setSelectionRange(start, start);
  } else if (start > 0) {
    input.value = input.value.slice(0, start - 1) + input.value.slice(start);
    input.setSelectionRange(start - 1, start - 1);
  }

  onLineChanged(state.activeIndex, input);
}

function clearLineFocused() {
  const input = state.focusedInput;
  if (!input || !document.contains(input)) return;

  input.value = "";
  onLineChanged(state.activeIndex, input);
}

function addAP() {
  const next = prompt("New AP name (e.g., a or x1):");
  if (!next) return;
  const clean = next.trim();
  if (!clean) return;
  if (state.apList.includes(clean)) return;
  state.apList.push(clean);

  const row = document.getElementById("rowAP");
  const key = document.createElement("div");
  key.className = "key";
  key.dataset.insert = clean;
  key.textContent = clean;
  row.insertBefore(key, row.lastElementChild);
}

// Keyboard event delegation
document.querySelector(".keyboard").addEventListener("click", (e) => {
  const key = e.target.closest(".key");
  if (!key) return;

  if (key.dataset.insert) {
    insertToFocused(key.dataset.insert);
    return;
  }
  const action = key.dataset.action;
  if (!action) return;

  if (action === "backspace") backspaceFocused();
  else if (action === "space") insertToFocused(" ");
  else if (action === "clearLine") clearLineFocused();
  else if (action === "newLine") { addLine(""); focusActiveInputSoon(); }
  else if (action === "addAP") addAP();
});

// -----------------------------
// Buttons
// -----------------------------
document.getElementById("btnAdd").addEventListener("click", () => { addLine(""); focusActiveInputSoon(); });
document.getElementById("btnClearAll").addEventListener("click", () => clearAll());
document.getElementById("btnFit").addEventListener("click", () => cy.fit(undefined, 30));

// -----------------------------
// Init
// -----------------------------
renderExprList();
clearGraph();
setActiveIndex(0);

// Keep input focused when clicking on the on-screen keyboard
const keyboardEl = document.querySelector(".keyboard");

keyboardEl.addEventListener("pointerdown", (e) => {
  const key = e.target.closest(".key");
  if (!key) return;

  e.preventDefault(); // prevent browser from stealing focus
}, true);

document.addEventListener("pointerdown", (e) => {
  const insideExpr = e.target.closest(".expr-item");
  const insideKeyboard = e.target.closest(".keyboard");
  const insideCy = e.target.closest("#cy");
  const insideRight = e.target.closest(".right");
  if (insideExpr || insideKeyboard || insideCy || insideRight) return;

  if (state.focusedInput && document.contains(state.focusedInput)) {
    state.focusedInput.blur();
  }
  state.focusedInput = null;
}, true);

