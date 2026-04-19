// frontend/js/bddTraces/reduction/step_3_reduce_non_terminals.js
import { computeSnapshotPositionMap, sleep } from "../../graph/cy.js";
import { isApplyResultScope, nodeInScopeSnapshot, scopeEdges, scopeNodeById, scopeNodes } from "../scope.js";

const HIGHLIGHT_MS = 360;
const MOVE_MS = 520;
const FADE_MS = 260;
const BETWEEN_BATCH_MS = 120;
const ENABLE_INTERFRAME_ANIMATION = true;

function normalizeFocusIds(cy, scope, ids = []) {
  return ids
    .map((id) => scopeNodeById(cy, scope, id))
    .filter((n) => n && !n.empty())
    .map((n) => n.id());
}

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
  const lab = String(n.data("label") ?? "");
  if (n.hasClass("terminal") || lab === "0" || lab === "1") return `T:${lab}`;
  return n.id();
}

function childrenSig(cy, nodeId, scopedEdges) {
  const n = cy.getElementById(nodeId);
  if (!n || n.empty()) return null;

  const lab = String(n.data("label") ?? "");

  let lo = null,
    hi = null;
  scopedEdges.filter((e) => e.data("source") === nodeId).forEach((e) => {
    const k = edgeKind(e);
    const t = e.target();
    if (!t || t.empty()) return;
    if (k === "0") lo = nodeSemanticId(t);
    if (k === "1") hi = nodeSemanticId(t);
  });

  return `${lab}|${lo ?? "?"}|${hi ?? "?"}`;
}

export function inferMergeBatches(cy, step, snap, scope, scopedEdges) {
  const focus = normalizeFocusIds(cy, scope, step?.focus ?? []);
  const snapIds = new Set(
    (snap?.nodes ?? [])
      .filter((n) => nodeInScopeSnapshot(n, scope))
      .map((n) => n?.data?.id)
  );

  const keepIds = focus.filter((id) => snapIds.has(id));
  const dupIds = focus.filter((id) => !snapIds.has(id));

  if (!keepIds.length || !dupIds.length) return [];

  const keepBySig = new Map();
  for (const kid of keepIds) {
    const sig = childrenSig(cy, kid, scopedEdges);
    if (!sig) continue;
    keepBySig.set(sig, kid);
  }

  const batches = [];
  for (const did of dupIds) {
    const sig = childrenSig(cy, did, scopedEdges);
    const kid = sig ? keepBySig.get(sig) : null;
    if (!kid) continue;
    batches.push({ keepId: kid, dupIds: [did] });
  }

  const merged = new Map();
  for (const b of batches) {
    const arr = merged.get(b.keepId) ?? [];
    arr.push(...b.dupIds);
    merged.set(b.keepId, arr);
  }

  return [...merged.entries()].map(([keepId, dups]) => ({ keepId, dupIds: dups }));
}

function addHighlight(cy, ids, cls, scope) {
  cy.batch(() => {
    ids.forEach((id) => {
      const n = scopeNodeById(cy, scope, id);
      if (!n || n.empty()) return;
      n.addClass(cls);
      if (!isApplyResultScope(scope)) n.connectedEdges().addClass(cls);
      else n.connectedEdges(".apply-result").addClass(cls);
    });
  });
}

function removeHighlight(cy, ids, cls, scope) {
  cy.batch(() => {
    ids.forEach((id) => {
      const n = scopeNodeById(cy, scope, id);
      if (!n || n.empty()) return;
      n.removeClass(cls);
      if (!isApplyResultScope(scope)) n.connectedEdges().removeClass(cls);
      else n.connectedEdges(".apply-result").removeClass(cls);
    });
  });
}

async function fadeOutNodes(cy, nodeIds, scope) {
  const nodes = nodeIds
    .map((id) => scopeNodeById(cy, scope, id))
    .filter((n) => n && !n.empty());
  if (!nodes.length) return;

  nodes.forEach((n) => n.animate({ style: { opacity: 0 } }, { duration: FADE_MS }));
  await sleep(FADE_MS);
}

function computeFinalPositionsForSnapshot(cy, snapshot, vars, userX, applyLayout = null) {
  return computeSnapshotPositionMap(cy, snapshot, vars, userX, applyLayout ?? {});
}

export async function playReduceMergeTrace(
  cy,
  trace,
  { setGraph, onAfterEach, ctx, scope = "full", applyLayout = null } = {}
) {
  const vars = ctx?.vars ?? [];
  const steps = trace?.steps ?? [];
  if (!steps.length) return;

  const userX = ctx?.state?.userX ?? null;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const snap = step?.snapshot;
    if (!snap) continue;
    if (!ENABLE_INTERFRAME_ANIMATION) {
      await setGraph(snap, step);
      await sleep(0);
      await onAfterEach?.(step, { stepIndex: i, stepsLen: steps.length });
      continue;
    }

    const finalPos = await computeFinalPositionsForSnapshot(cy, snap, vars, userX, applyLayout);
    const scopedEdges = scopeEdges(cy, scope);

    const batches = inferMergeBatches(cy, step, snap, scope, scopedEdges);

    if (!batches.length) {
      await setGraph(snap, step);
      await sleep(0);
      await onAfterEach?.(step, { stepIndex: i, stepsLen: steps.length });
      continue;
    }
    for (let b = 0; b < batches.length; b += 1) {
      const { keepId, dupIds } = batches[b];
      const keep = scopeNodeById(cy, scope, keepId);
      if (!keep || keep.empty()) continue;

      const keepTgt = finalPos.get(keepId);
      if (!keepTgt) continue;

      const cls = `merge-hi-${(b % 6) + 1}`;
      const allIds = [keepId, ...dupIds];

      addHighlight(cy, allIds, cls, scope);
      await sleep(HIGHLIGHT_MS);

      keep.animate({ position: { x: keepTgt.x, y: keepTgt.y } }, { duration: MOVE_MS });

      dupIds.forEach((id) => {
        const n = scopeNodeById(cy, scope, id);
        if (!n || n.empty()) return;
        n.animate({ position: { x: keepTgt.x, y: keepTgt.y } }, { duration: MOVE_MS });
      });

      await sleep(MOVE_MS);

      await fadeOutNodes(cy, dupIds, scope);

      removeHighlight(cy, allIds, cls, scope);
      await sleep(BETWEEN_BATCH_MS);
    }

    await setGraph(snap, step);
    await sleep(0);
    await onAfterEach?.(step, { stepIndex: i, stepsLen: steps.length });
  }
}
