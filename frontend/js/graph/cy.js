import { getAxisVars } from "./layerAxis.js";

let graphAnimToken = 0;
export function getGraphAnimToken() { return graphAnimToken; }
export function bumpGraphAnimToken() { graphAnimToken += 1; return graphAnimToken; }

export function createCy(containerEl) {
  return cytoscape({
    container: containerEl,
    elements: [],
    style: [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "text-valign": "center",
          "text-halign": "center",
          width: 42,
          height: 42,
          "border-width": 2,
          "border-color": "#cfd4df",
          "background-color": "#ffffff",
          "font-size": 12
        }
      },
      { selector: "node.focus", style: { "border-width": 6, "border-color": "#2563eb" } },
      {
        selector: "node.terminal",
        style: {
          shape: "round-rectangle",
          width: 48,
          height: 34,
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
          width: 2,
          "line-color": "#cfd4df",
          "target-arrow-color": "#cfd4df",
          label: "data(label)",
          "font-size": 10,
          "text-rotation": "autorotate",
          "text-margin-y": -8
        }
      },
      { selector: ".dim", style: { opacity: 0.15 } },
      { selector: "edge.dim", style: { opacity: 0.08 } },
      { selector: "edge.zero", style: { "line-style": "dashed" } },
      { selector: "edge.one", style: { "line-style": "solid" } },
      { selector: "node.term-hi-0", style: { "border-width": 6, "border-color": "#ef4444" } },
      { selector: "node.term-hi-1", style: { "border-width": 6, "border-color": "#22c55e" } },
      { selector: "edge.focus", style: { width: 6, "line-color": "#2563eb", "target-arrow-color": "#2563eb" } },
      { selector: "edge.fadeout", style: { opacity: 0 } },
      { selector: ".fadeout", style: { opacity: 0 } },

      { selector: "node.mg0", style: { "border-width": 6, "border-color": "#2563eb" } },
      { selector: "edge.mg0", style: { width: 5, "line-color": "#2563eb", "target-arrow-color": "#2563eb" } },

      { selector: "node.mg1", style: { "border-width": 6, "border-color": "#f59e0b" } },
      { selector: "edge.mg1", style: { width: 5, "line-color": "#f59e0b", "target-arrow-color": "#f59e0b" } },

      { selector: "node.mg2", style: { "border-width": 6, "border-color": "#10b981" } },
      { selector: "edge.mg2", style: { width: 5, "line-color": "#10b981", "target-arrow-color": "#10b981" } },

      { selector: "node.mg3", style: { "border-width": 6, "border-color": "#ef4444" } },
      { selector: "edge.mg3", style: { width: 5, "line-color": "#ef4444", "target-arrow-color": "#ef4444" } },
      { selector: ".merge-hi-1", style: { "border-width": 6, "border-color": "#f97316", "line-color": "#f97316", "target-arrow-color": "#f97316" } },
      { selector: ".merge-hi-2", style: { "border-width": 6, "border-color": "#a855f7", "line-color": "#a855f7", "target-arrow-color": "#a855f7" } },
      { selector: ".merge-hi-3", style: { "border-width": 6, "border-color": "#06b6d4", "line-color": "#06b6d4", "target-arrow-color": "#06b6d4" } },
      { selector: ".merge-hi-4", style: { "border-width": 6, "border-color": "#84cc16", "line-color": "#84cc16", "target-arrow-color": "#84cc16" } },
      { selector: ".merge-hi-5", style: { "border-width": 6, "border-color": "#ef4444", "line-color": "#ef4444", "target-arrow-color": "#ef4444" } },
      { selector: ".merge-hi-6", style: { "border-width": 6, "border-color": "#3b82f6", "line-color": "#3b82f6", "target-arrow-color": "#3b82f6" } },
    ]
  });
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function cancelAllGraphAnims(cy) {
  bumpGraphAnimToken();
  cy.stop(true);
  cy.elements().stop(true);
}

export function clearGraph(cy) {
  bumpGraphAnimToken();
  cy.stop(true);
  cy.elements().stop(true);
  cy.elements().remove();
}

export function enableHorizontalDragOnly(cy, { layerGap = 120 } = {}) {
  function isTerminal(n) {
    const lab = String(n.data("label") ?? "");
    return n.hasClass("terminal") || lab === "0" || lab === "1";
  }
  function yForNode(n) {
    const lab = String(n.data("label") ?? "");
    const vars = getAxisVars();
    const idx = vars.indexOf(lab);
    if (idx >= 0) return (idx + 1) * layerGap;
    if (isTerminal(n)) return (vars.length + 1) * layerGap;
    return n.position("y");
  }

  cy.on("drag", "node", (evt) => {
    const n = evt.target;
    n.position({ x: n.position("x"), y: yForNode(n) });
  });
}

export function disableUserZoom(cy) {
  if (typeof cy.userZoomingEnabled === "function") cy.userZoomingEnabled(false);
  if (typeof cy.boxZoomEnabled === "function") cy.boxZoomEnabled(false);
  if (typeof cy.userPanningEnabled === "function") cy.userPanningEnabled(false);

  const container = cy.container();
  if (!container) return;

  container.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );

  container.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
  container.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
  container.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });
}

export function autoFitOnResize(cy, axisSync, { padding = 30, debounceMs = 60 } = {}) {
  let t = null;

  function run() {
    t = null;
    cy.resize();
    if (cy.nodes().length) {
      cy.fit(undefined, padding);
    }

    axisSync?.();
  }

  function schedule() {
    if (t) clearTimeout(t);
    t = setTimeout(run, debounceMs);
  }
  schedule();
  window.addEventListener("resize", schedule);
  return () => window.removeEventListener("resize", schedule);
}

export function snapNodesToLayers(cy, vars, { layerGap = 120 } = {}) {
  if (!Array.isArray(vars) || !vars.length) return;

  const yOf = new Map();
  vars.forEach((v, i) => yOf.set(v, (i + 1) * layerGap));
  const terminalY = (vars.length + 1) * layerGap;

  cy.batch(() => {
    cy.nodes().forEach((n) => {
      const lab = String(n.data("label") ?? "");
      const isTerm = n.hasClass("terminal") || lab === "0" || lab === "1";

      if (isTerm) {
        n.position({ x: n.position("x"), y: terminalY });
        return;
      }

      const y = yOf.get(lab);
      if (y != null) n.position({ x: n.position("x"), y });
    });
  });
}

export function computeDeterministicPosMap(
  elements,
  vars,
  userX = null,
  { xGap = 60, layerGap = 120, termPad = 70, termGap = 160 } = {}
) {
  const nodes = elements?.nodes ?? [];
  const edges = elements?.edges ?? [];
  const n = vars?.length ?? 0;
  if (!n || !nodes.length) return new Map();

  const nodeById = new Map(nodes.map((nd) => [nd.data.id, nd]));
  const out = new Map();
  nodes.forEach((nd) => out.set(nd.data.id, []));
  edges.forEach((e) => {
    const src = e.data.source;
    const tgt = e.data.target;
    if (!out.has(src)) out.set(src, []);
    out.get(src).push({ edge: e, childId: tgt });
  });

  function edgeKind(e) {
    const cls = String(e.classes ?? "");
    if (cls.includes("zero")) return "0";
    if (cls.includes("one")) return "1";
    const lab = String(e.data.label ?? "");
    if (lab === "0" || lab === "1") return lab;
    return null;
  }

  function outChildren(id) {
    let lo = null, hi = null;
    const arr = out.get(id) || [];
    for (const { edge, childId } of arr) {
      const k = edgeKind(edge);
      if (k === "0") lo = childId;
      else if (k === "1") hi = childId;
    }
    return { lo, hi };
  }

  function isTerminalNode(id) {
    const nd = nodeById.get(id);
    if (!nd) return false;
    const lab = String(nd.data.label ?? "");
    const cls = String(nd.classes ?? "");
    return cls.includes("terminal") || lab === "0" || lab === "1";
  }

  function varIndexOf(id) {
    const nd = nodeById.get(id);
    if (!nd) return -1;
    const lab = String(nd.data.label ?? "");
    return vars.indexOf(lab);
  }

  // root by indegree
  const indeg = new Map(nodes.map((nd) => [nd.data.id, 0]));
  edges.forEach((e) => {
    const t = e.data.target;
    indeg.set(t, (indeg.get(t) || 0) + 1);
  });
  const root = nodes.find((nd) => (indeg.get(nd.data.id) || 0) === 0)?.data?.id;
  if (!root) return new Map();

  const leafCount = Math.pow(2, n);
  const pos = new Map();

  function assign(id, level, l, r) {
    if (pos.has(id)) return;

    const x0 = ((l + r) / 2) * xGap;

    let y;
    if (isTerminalNode(id)) y = (vars.length + 1) * layerGap;
    else {
      const idx = varIndexOf(id);
      const layer = idx >= 0 ? (idx + 1) : (level + 1);
      y = layer * layerGap;
    }

    let x = x0;
    if (userX && userX.has(id)) x = userX.get(id);

    pos.set(id, { x, y });

    if (isTerminalNode(id)) return;

    const { lo, hi } = outChildren(id);
    const mid = (l + r) / 2;
    if (lo) assign(lo, level + 1, l, mid);
    if (hi) assign(hi, level + 1, mid, r);
  }

  assign(root, 0, 0, leafCount);

  // 只在 terminals <= 2 时，把 0/1 拉开（和你现有逻辑一致）
  const termIds = nodes
    .filter((nd) => {
      const lab = String(nd.data.label ?? "");
      const cls = String(nd.classes ?? "");
      return cls.includes("terminal") || lab === "0" || lab === "1";
    })
    .map((nd) => nd.data.id);

  if (termIds.length <= 2) {
    // 这里用 pos 的 x 范围来估 bb（简单版）
    const xs = [...pos.values()].map((p) => p.x);
    if (xs.length) {
      const x1 = Math.min(...xs), x2 = Math.max(...xs);
      const mid = (x1 + x2) / 2;
      const X0 = Math.min(x1 + termPad, mid - termGap / 2);
      const X1 = Math.max(x2 - termPad, mid + termGap / 2);
      const YT = (vars.length + 1) * layerGap;

      for (const tid of termIds) {
        const nd = nodeById.get(tid);
        const lab = String(nd?.data?.label ?? "");
        if (userX && userX.has(tid)) {
          pos.set(tid, { x: userX.get(tid), y: YT });
        } else if (lab === "0") pos.set(tid, { x: X0, y: YT });
        else if (lab === "1") pos.set(tid, { x: X1, y: YT });
        else {
          const p = pos.get(tid);
          if (p) pos.set(tid, { x: p.x, y: YT });
        }
      }
    }
  }

  return pos;
}

export function terminalTargets(
  cy,
  vars,
  { pad = 70, gap = 160, layerGap = 120 } = {}
) {
  const bb = cy.elements().boundingBox({ includeNodes: true, includeEdges: false });
  const mid = (bb.x1 + bb.x2) / 2;

  const X0 = Math.min(bb.x1 + pad, mid - gap / 2);
  const X1 = Math.max(bb.x2 - pad, mid + gap / 2);
  const YT = (vars.length + 1) * layerGap;

  return { X0, X1, YT };
}

export function alignTerminals(
  cy,
  vars,
  opts = {}
) {
  if (!Array.isArray(vars) || !vars.length) return;

  const { X0, X1, YT } = terminalTargets(cy, vars, opts);

  const terms = cy.nodes().filter((n) => {
    const lab = String(n.data("label") ?? "");
    return n.hasClass("terminal") || lab === "0" || lab === "1";
  });

  const zeros = terms.filter((n) => String(n.data("label")) === "0");
  const ones  = terms.filter((n) => String(n.data("label")) === "1");

  cy.batch(() => {
    zeros.forEach((n) => n.position({ x: X0, y: YT }));
    ones.forEach((n) => n.position({ x: X1, y: YT }));
    terms.forEach((n) => n.position({ x: n.position("x"), y: YT }));
  });

  return { X0, X1, YT };
}

function setDraggingEnabled(enabled) {
  if (enabled) cy.nodes().grabify();
  else cy.nodes().ungrabify();
}
function hasAnyReduceApplied() {
  return (state.appliedReduce?.length ?? 0) > 0;
}

export function layoutBddDeterministic(
  cy,
  vars,
  userX = null,
  {
    xGap = 60,
    layerGap = 120,
    termPad = 70,
    termGap = 160
  } = {}
) {
  const n = vars?.length ?? 0;
  if (!n) return;

  // root by indegree
  const indeg = new Map();
  cy.nodes().forEach((nd) => indeg.set(nd.id(), 0));
  cy.edges().forEach((e) => {
    const t = e.target().id();
    indeg.set(t, (indeg.get(t) || 0) + 1);
  });
  const roots = cy.nodes().filter((nd) => (indeg.get(nd.id()) || 0) === 0);
  const root = roots[0];
  if (!root || root.empty()) return;

  const leafCount = Math.pow(2, n);
  const pos = new Map();

  function edgeKind(e) {
    if (e.hasClass("zero")) return "0";
    if (e.hasClass("one")) return "1";
    const lab = String(e.data("label") ?? "");
    if (lab === "0" || lab === "1") return lab;
    return null;
  }

  function outChildren(node) {
    let lo = null, hi = null;
    node.outgoers("edge").forEach((e) => {
      const k = edgeKind(e);
      const child = e.target();
      if (!child || child.empty()) return;
      if (k === "0") lo = child;
      else if (k === "1") hi = child;
    });
    return { lo, hi };
  }

  function isTerminalNode(node) {
    const lab = String(node.data("label") ?? "");
    return node.hasClass("terminal") || lab === "0" || lab === "1";
  }

  function varIndexOf(node) {
    const lab = String(node.data("label") ?? "");
    return vars.indexOf(lab);
  }

  function assign(node, level, l, r) {
    const id = node.id();
    const isTerm = isTerminalNode(node);

    const x = ((l + r) / 2) * xGap;

    let y;
    if (isTerm) y = (vars.length + 1) * layerGap;
    else {
      const idx = varIndexOf(node);
      const layer = idx >= 0 ? (idx + 1) : (level + 1);
      y = layer * layerGap;
    }

    if (!pos.has(id)) pos.set(id, { x, y });
    if (isTerm) return;

    const { lo, hi } = outChildren(node);
    const mid = (l + r) / 2;
    if (lo) assign(lo, level + 1, l, mid);
    if (hi) assign(hi, level + 1, mid, r);
  }

  assign(root, 0, 0, leafCount);

  cy.batch(() => {
    cy.nodes().forEach((nd) => {
      const p = pos.get(nd.id());
      if (!p) return;

      let x = p.x;
      const y = p.y;
      // IMPORTANT: userX should override for ALL nodes (including terminals)
      if (userX && userX.has(nd.id())) x = userX.get(nd.id());
      nd.position({ x, y });
    });
  });

  const terms = cy.nodes().filter((n) => {
    const lab = String(n.data("label") ?? "");
    return n.hasClass("terminal") || lab === "0" || lab === "1";
  });

  // IMPORTANT: only do this when terminals are already reduced (usually exactly 2 nodes)
  // otherwise unreduced tree will collapse all leaves again.
    if (terms.length <= 2) {
      const bb = cy.elements().boundingBox({ includeNodes: true, includeEdges: false });
      const mid = (bb.x1 + bb.x2) / 2;

      const pad = termPad;
      const gap = termGap;
      const X0 = Math.min(bb.x1 + pad, mid - gap / 2);
      const X1 = Math.max(bb.x2 - pad, mid + gap / 2);
      const YT = (vars.length + 1) * layerGap;

      cy.batch(() => {
        terms.forEach((n) => {
          const id = n.id();
          const lab = String(n.data("label") ?? "");

          // If user dragged it before, keep user's X.
          if (userX && userX.has(id)) {
            n.position({ x: userX.get(id), y: YT });
            return;
          }

          if (lab === "0") n.position({ x: X0, y: YT });
          else if (lab === "1") n.position({ x: X1, y: YT });
          else n.position({ x: n.position("x"), y: YT });
        });
      });
    }

    // alignTerminals(cy, vars, { pad: termPad, gap: termGap, layerGap });
}

export async function setGraphInstant(
  cy,
  elements,
  vars,
  userX,
  { keepViewport = true, fit = true, padding = 30, onAfterLayout } = {}
) {
  bumpGraphAnimToken();
  cy.stop(true);
  cy.elements().stop(true);

  const vp = keepViewport ? cy.viewport() : null;

  cy.elements().remove();
  cy.add(elements);

  if (Array.isArray(vars) && vars.length) {
    layoutBddDeterministic(cy, vars, userX);
    snapNodesToLayers(cy, vars);
  }

  const layout = cy.layout({ name: "preset", animate: false, fit, padding });

  await new Promise((resolve) => {
    layout.one("layoutstop", () => {
      if (vp) cy.viewport(vp);
      cy.elements().style("opacity", 1);
      onAfterLayout?.();
      resolve();
    });
    layout.run();
  });
}

export function setGraphAnimated(
  cy,
  elements,
  anim = {},
  hooks = {},
  vars = null,
  userX = null
) {
  const { stepMs = 80, nodeFadeMs = 120, edgeFadeMs = 120 } = anim || {};
  const { keepViewport = true, fit = true, padding = 30, onAfterLayout } = hooks || {};

  const token = bumpGraphAnimToken();
  cy.stop(true);
  cy.elements().stop(true);

  const vp = keepViewport ? cy.viewport() : null;

  cy.elements().remove();
  cy.add(elements);
  cy.elements().style("opacity", 0);

  if (Array.isArray(vars) && vars.length) {
    layoutBddDeterministic(cy, vars, userX);
    snapNodesToLayers(cy, vars);
  }

  const layout = cy.layout({ name: "preset", animate: false, fit, padding });

  const layoutDone = new Promise((resolve) => {
    layout.one("layoutstop", () => {
      if (vp) cy.viewport(vp);
      onAfterLayout?.();
      resolve();
    });
  });

  layout.run();

  layoutDone.then(() => {
    setTimeout(async () => {
      if (token !== getGraphAnimToken()) {
        cy.elements().style("opacity", 1);
        return;
      }

      const nodes = cy.nodes();
      const edges = cy.edges();

      const indeg = new Map();
      nodes.forEach((n) => indeg.set(n.id(), 0));
      edges.forEach((e) => {
        const tgt = e.target().id();
        indeg.set(tgt, (indeg.get(tgt) || 0) + 1);
      });

      const roots = nodes.filter((n) => (indeg.get(n.id()) || 0) === 0);
      const root = roots[0];

      const out = new Map();
      nodes.forEach((n) => out.set(n.id(), []));
      edges.forEach((e) => {
        const src = e.source().id();
        const tgt = e.target().id();
        out.get(src).push({ edge: e, childId: tgt });
      });

      function branchOrder(a, b) {
        const la = String(a.edge.data("label") ?? "");
        const lb = String(b.edge.data("label") ?? "");
        if (la === lb) return 0;
        if (la === "0") return -1;
        if (lb === "0") return 1;
        if (la === "1") return -1;
        if (lb === "1") return 1;
        return la.localeCompare(lb);
      }
      out.forEach((arr) => arr.sort(branchOrder));

      const seenNodes = new Set();
      const seenEdges = new Set();
      const actions = [];

      function dfs(nid) {
        if (!seenNodes.has(nid)) {
          seenNodes.add(nid);
          actions.push({ kind: "node", id: nid });
        }
        const nexts = out.get(nid) || [];
        for (const { edge, childId } of nexts) {
          const eid = edge.id();
          if (!seenEdges.has(eid)) {
            seenEdges.add(eid);
            actions.push({ kind: "edge", id: eid });
          }
          if (!seenNodes.has(childId)) dfs(childId);
        }
      }

      if (root && root.length) dfs(root.id());

      for (const a of actions) {
        if (token !== getGraphAnimToken()) {
          cy.elements().style("opacity", 1);
          return;
        }
        if (vp) cy.viewport(vp);

        const el = cy.getElementById(a.id);
        if (!el || el.empty()) continue;

        if (a.kind === "node") el.animate({ style: { opacity: 1 } }, { duration: nodeFadeMs });
        else el.animate({ style: { opacity: 1 } }, { duration: edgeFadeMs });

        await sleep(stepMs);
      }
    }, 0);
  });

  return layoutDone;
}