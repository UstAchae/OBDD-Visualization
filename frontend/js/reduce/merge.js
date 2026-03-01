// frontend/js/reduce/merge.js
import { sleep } from "../graph/cy.js";

const HIGHLIGHT_MS = 360;
const MOVE_MS = 520;
const FADE_MS = 260;
const BETWEEN_BATCH_MS = 120;

function isTerminal(n) {
  const lab = String(n.data("label") ?? "");
  return n.hasClass("terminal") || lab === "0" || lab === "1";
}

function edgeKind(e) {
  if (e.hasClass("zero")) return "0";
  if (e.hasClass("one")) return "1";
  const lab = String(e.data("label") ?? "");
  if (lab === "0" || lab === "1") return lab;
  return null;
}

function nodeSemanticId(n) {
  // terminals: use value, not unique id
  const lab = String(n.data("label") ?? "");
  if (n.hasClass("terminal") || lab === "0" || lab === "1") return `T:${lab}`;
  return n.id();
}

function childrenSig(cy, nodeId) {
  const n = cy.getElementById(nodeId);
  if (!n || n.empty()) return null;

  const lab = String(n.data("label") ?? "");

  // terminals don't participate in merge focus anyway
  let lo = null, hi = null;
  n.outgoers("edge").forEach((e) => {
    const k = edgeKind(e);
    const t = e.target();
    if (!t || t.empty()) return;
    if (k === "0") lo = nodeSemanticId(t);
    if (k === "1") hi = nodeSemanticId(t);
  });

  return `${lab}|${lo ?? "?"}|${hi ?? "?"}`;
}

// Build batches for ONE step using:
// - step.focus: ids involved in this merge-step (before merge)
// - snapshot.nodes: ids that remain after merge
export function inferMergeBatches(cy, step, snap) {
  const focus = step?.focus ?? [];
  const snapIds = new Set((snap?.nodes ?? []).map(n => n?.data?.id));

  // keep candidates = focus ∩ snapshot
  const keepIds = focus.filter(id => snapIds.has(id));
  const dupIds  = focus.filter(id => !snapIds.has(id));

  if (!keepIds.length || !dupIds.length) return [];

  // group by signature
  const keepBySig = new Map();
  for (const kid of keepIds) {
    const sig = childrenSig(cy, kid);
    if (!sig) continue;
    keepBySig.set(sig, kid);
  }

  const batches = [];
  for (const did of dupIds) {
    const sig = childrenSig(cy, did);
    const kid = sig ? keepBySig.get(sig) : null;
    if (!kid) continue;
    batches.push({ keepId: kid, dupIds: [did] });
  }

  // merge dup lists with same keepId
  const merged = new Map();
  for (const b of batches) {
    const arr = merged.get(b.keepId) ?? [];
    arr.push(...b.dupIds);
    merged.set(b.keepId, arr);
  }

  return [...merged.entries()].map(([keepId, dups]) => ({ keepId, dupIds: dups }));
}

function outChildren(node) {
  let lo = null,
    hi = null;
  node.outgoers("edge").forEach((e) => {
    const k = edgeKind(e);
    const child = e.target();
    if (!child || child.empty()) return;
    if (k === "0") lo = child;
    else if (k === "1") hi = child;
  });
  return { lo, hi };
}

// IMPORTANT: match backend sk(): terminals by value, non-terminals by identity
function childKey(node) {
  if (!node || node.empty()) return null;
  if (isTerminal(node)) {
    const lab = String(node.data("label") ?? "");
    return lab === "1" ? "T1" : "T0";
  }
  return `N:${node.id()}`;
}

function keyOfNode(node) {
  const { lo, hi } = outChildren(node);
  if (!lo || !hi) return null;
  const kLo = childKey(lo);
  const kHi = childKey(hi);
  if (!kLo || !kHi) return null;
  return `${kLo}|${kHi}`;
}

function snapshotNodeIdSet(snapshot) {
  const set = new Set();
  const ns = snapshot?.nodes ?? [];
  for (const n of ns) set.add(String(n?.data?.id ?? ""));
  return set;
}

function addHighlight(cy, ids, cls) {
  cy.batch(() => {
    ids.forEach((id) => {
      const n = cy.getElementById(id);
      if (!n || n.empty()) return;
      n.addClass(cls);
      n.connectedEdges().addClass(cls);
    });
  });
}

function removeHighlight(cy, ids, cls) {
  cy.batch(() => {
    ids.forEach((id) => {
      const n = cy.getElementById(id);
      if (!n || n.empty()) return;
      n.removeClass(cls);
      n.connectedEdges().removeClass(cls);
    });
  });
}

async function fadeOutNodes(cy, nodeIds) {
  const nodes = nodeIds
    .map((id) => cy.getElementById(id))
    .filter((n) => n && !n.empty());
  if (!nodes.length) return;

  nodes.forEach((n) => n.animate({ style: { opacity: 0 } }, { duration: FADE_MS }));
  await sleep(FADE_MS);
}

/**
 * Hidden-cy: compute final positions for snapshot using the same layout logic as your main render.
 * This version mirrors your layoutBddDeterministic essentials + terminal align (<=2).
 */
function computeFinalPositionsForSnapshot(snapshot, vars, userX) {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-10000px";
  el.style.top = "-10000px";
  el.style.width = "800px";
  el.style.height = "600px";
  el.style.pointerEvents = "none";
  el.style.opacity = "0";
  document.body.appendChild(el);

  const cy2 = cytoscape({
    container: el,
    elements: [],
    style: [
      { selector: "node", style: { width: 10, height: 10, opacity: 0 } },
      { selector: "edge", style: { width: 1, opacity: 0 } }
    ]
  });

  cy2.add(snapshot);

  // pick root (indegree==0)
  const indeg = new Map();
  cy2.nodes().forEach((nd) => indeg.set(nd.id(), 0));
  cy2.edges().forEach((e) => {
    const t = e.target().id();
    indeg.set(t, (indeg.get(t) || 0) + 1);
  });
  const root = cy2.nodes().filter((nd) => (indeg.get(nd.id()) || 0) === 0)[0];

  const n = vars?.length ?? 0;
  const leafCount = Math.pow(2, n);
  const xGap = 60;
  const layerGap = 120;
  const termPad = 70;
  const termGap = 160;

  const pos = new Map();

  function varIndexOf(node) {
    const lab = String(node.data("label") ?? "");
    return vars.indexOf(lab);
  }

  function assign(node, level, l, r) {
    const id = node.id();
    const term = isTerminal(node);

    let x = ((l + r) / 2) * xGap;
    let y;

    if (term) y = (vars.length + 1) * layerGap;
    else {
      const idx = varIndexOf(node);
      const layer = idx >= 0 ? idx + 1 : level + 1;
      y = layer * layerGap;
    }

    if (userX && userX.has(id)) x = userX.get(id);

    if (!pos.has(id)) pos.set(id, { x, y });
    if (term) return;

    const { lo, hi } = outChildren(node);
    const mid = (l + r) / 2;
    if (lo) assign(lo, level + 1, l, mid);
    if (hi) assign(hi, level + 1, mid, r);
  }

  if (root && root.length) assign(root, 0, 0, leafCount);

  cy2.batch(() => {
    cy2.nodes().forEach((nd) => {
      const p = pos.get(nd.id());
      if (!p) return;
      nd.position({ x: p.x, y: p.y });
    });
  });

  // align terminals only if <=2 (same as your real layout)
  const terms = cy2.nodes().filter((nd) => isTerminal(nd));
  if (terms.length > 0 && terms.length <= 2) {
    const bb = cy2.elements().boundingBox({ includeNodes: true, includeEdges: false });
    const mid = (bb.x1 + bb.x2) / 2;
    const X0 = Math.min(bb.x1 + termPad, mid - termGap / 2);
    const X1 = Math.max(bb.x2 - termPad, mid + termGap / 2);
    const YT = (vars.length + 1) * layerGap;

    cy2.batch(() => {
      terms.forEach((nd) => {
        const id = nd.id();
        const lab = String(nd.data("label") ?? "");
        if (userX && userX.has(id)) {
          nd.position({ x: userX.get(id), y: YT });
        } else if (lab === "0") nd.position({ x: X0, y: YT });
        else if (lab === "1") nd.position({ x: X1, y: YT });
        else nd.position({ x: nd.position("x"), y: YT });
      });
    });
  }

  const out = new Map();
  cy2.nodes().forEach((nd) => out.set(nd.id(), { x: nd.position("x"), y: nd.position("y") }));

  cy2.destroy();
  document.body.removeChild(el);
  return out;
}

/**
 * Infer merge batches for this step using:
 * - step.focus: ids involved in merges (keep + dups)
 * - snapshot nodes: which ids survive (keep) vs disappear (dups)
 * - current graph structure: map dup -> keep by matching key(low,high) under backend semantics
 */
function inferBatchesFromStep(cy, step, snapshot) {
  const focus = step?.focus ?? [];
  if (!focus.length) return [];

  const aliveInSnap = snapshotNodeIdSet(snapshot);
  const keeps = focus.filter((id) => aliveInSnap.has(id));
  const dups = focus.filter((id) => !aliveInSnap.has(id));

  if (!keeps.length || !dups.length) return [];

  // Build key -> keepId mapping from current graph nodes that are in keeps
  const keyToKeep = new Map();
  for (const kid of keeps) {
    const kn = cy.getElementById(kid);
    if (!kn || kn.empty()) continue;
    const k = keyOfNode(kn);
    if (!k) continue;
    // if multiple keeps share key (shouldn't), keep first
    if (!keyToKeep.has(k)) keyToKeep.set(k, kid);
  }

  // Assign each dup to its keep by key
  const keepToDups = new Map();
  for (const did of dups) {
    const dn = cy.getElementById(did);
    if (!dn || dn.empty()) continue;
    const k = keyOfNode(dn);
    const keepId = k ? keyToKeep.get(k) : null;
    if (!keepId) continue;

    if (!keepToDups.has(keepId)) keepToDups.set(keepId, []);
    keepToDups.get(keepId).push(did);
  }

  // to batches: [{keepId, dupIds}]
  const batches = [];
  for (const [keepId, dupIds] of keepToDups.entries()) {
    if (dupIds.length) batches.push({ keepId, dupIds });
  }

  // stable order
  batches.sort((a, b) => a.keepId.localeCompare(b.keepId));
  return batches;
}

export async function playReduceMergeTrace(cy, trace, { setGraph, onAfterEach, ctx } = {}) {
  const vars = ctx?.vars ?? [];
  const steps = trace?.steps ?? [];
  if (!steps.length) return;

  // If you ever want userX, pass ctx: { vars, state } from main.js
  const userX = ctx?.state?.userX ?? null;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const snap = step?.snapshot;
    if (!snap) continue;

    const finalPos = computeFinalPositionsForSnapshot(snap, vars, userX);

    // IMPORTANT: use the stable infer based on childrenSig + terminal semantic
    const batches = inferMergeBatches(cy, step, snap);

    // If cannot infer, fall back to authoritative snapshot
    if (!batches.length) {
      await setGraph(snap);
      await sleep(0);
      await onAfterEach?.(step, { stepIndex: i, stepsLen: steps.length });
      continue;
    }

    for (let b = 0; b < batches.length; b += 1) {
      const { keepId, dupIds } = batches[b];
      const keep = cy.getElementById(keepId);
      if (!keep || keep.empty()) continue;

      const keepTgt = finalPos.get(keepId);
      if (!keepTgt) continue;

      const cls = `merge-hi-${(b % 6) + 1}`;
      const allIds = [keepId, ...dupIds];

      // 1) highlight keep+dups + their incident edges
      addHighlight(cy, allIds, cls);
      await sleep(HIGHLIGHT_MS);

      // 2) move KEEP to its final position first (this fixes “one node didn’t move”)
      keep.animate({ position: { x: keepTgt.x, y: keepTgt.y } }, { duration: MOVE_MS });

      // 3) move DUPS to keep’s final position (so alignment matches snapshot)
      dupIds.forEach((id) => {
        const n = cy.getElementById(id);
        if (!n || n.empty()) return;
        n.animate({ position: { x: keepTgt.x, y: keepTgt.y } }, { duration: MOVE_MS });
      });

      await sleep(MOVE_MS);

      // 4) fade out dups (do not remove yet)
      await fadeOutNodes(cy, dupIds);

      // 5) clear highlight
      removeHighlight(cy, allIds, cls);
      await sleep(BETWEEN_BATCH_MS);
    }

    // 6) authoritative snapshot overlay
    await setGraph(snap);
    await sleep(0);
    await onAfterEach?.(step, { stepIndex: i, stepsLen: steps.length });
  }
}