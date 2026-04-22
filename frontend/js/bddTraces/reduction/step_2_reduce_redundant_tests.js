import { computeSnapshotPositionMap, sleep } from "../../graph/cy.js";
import {
  isApplyResultScope,
  nodeInScopeSnapshot,
  normalizeScopeId,
  scopeEdges,
  scopeNodeById,
  scopeNodes
} from "../scope.js";

const HIGHLIGHT_MS = 620;
const PUSH_MS = 860;
const RELINK_PULSE_MS = 380;
const DOWNSTREAM_MOVE_MS = 420;
const ENABLE_INTERFRAME_ANIMATION = true;
const ENABLE_DIM_DURING_REDUNDANT = false;

function dimAllExcept(cy, keep, scopedElements = null) {
  const elems = scopedElements ?? cy.elements();
  cy.batch(() => {
    const keepIds = new Set(keep.map((e) => e.id()));
    elems.forEach((el) => {
      if (keepIds.has(el.id())) el.removeClass("dim");
      else el.addClass("dim");
    });
  });
}

function pulseEdges(edges, { widthTo = 6, opacityTo = 1, ms = RELINK_PULSE_MS } = {}) {
  edges.forEach((e) => {
    e.stop(true);
    e.style({ opacity: opacityTo, width: widthTo });
    e.animate({ style: { width: 2, opacity: 1 } }, { duration: ms });
  });
}

function collectFocusBundle(cy, focusIds, scope) {
  const idSet = new Set((focusIds || []).map((id) => normalizeScopeId(cy, scope, id)).filter(Boolean));
  const scoped = scopeNodes(cy, scope);
  const scopedE = scopeEdges(cy, scope);
  const nodes = scoped.filter((n) => idSet.has(n.id()));
  const loHiEdges = scopedE.filter((e) => idSet.has(e.data("source")));

  return { nodes, loHiEdges, bundle: nodes.union(loHiEdges) };
}

function buildIdSetsFromSnapshot(snap, scope) {
  const n = new Set((snap?.nodes || []).filter((x) => nodeInScopeSnapshot(x, scope)).map((x) => x?.data?.id).filter(Boolean));
  const e = new Set((snap?.edges || []).filter((x) => {
    if (!isApplyResultScope(scope)) return true;
    const cls = String(x?.classes ?? "");
    return cls.includes("apply-result");
  }).map((x) => x?.data?.id).filter(Boolean));
  return { n, e };
}

function buildIdSetsFromCy(cy, scope) {
  const n = new Set(scopeNodes(cy, scope).map((x) => x.id()));
  const e = new Set(scopeEdges(cy, scope).map((x) => x.id()));
  return { n, e };
}

function pickRedirectTarget(node, scopedEdges) {
  let lowTarget = null;
  let highTarget = null;
  let firstTarget = null;

  scopedEdges.filter((e) => e.data("source") === node.id()).forEach((e) => {
    const tgt = e.target();
    if (!tgt || tgt.empty()) return;
    if (!firstTarget) firstTarget = tgt;

    const cls = String(e.classes?.() ?? e.classes ?? "");
    const lab = String(e.data("label") ?? "");
    if (cls.includes("zero") || lab === "0") lowTarget = tgt;
    else if (cls.includes("one") || lab === "1") highTarget = tgt;
  });

  return lowTarget || highTarget || firstTarget;
}

function followChainToSink(cy, node, redundantIdSet, scopedEdges) {
  let current = node;
  for (;;) {
    const next = pickRedirectTarget(current, scopedEdges);
    if (!next || next.empty()) return current;
    if (!redundantIdSet.has(next.id())) return next;
    current = next;
  }
}

function collectAllDescendantIds(cy, startNodes, scopedEdges) {
  const ids = new Set();
  const visited = new Set();
  const queue = [];
  const list = startNodes.toArray ? startNodes.toArray() : Array.from(startNodes);
  for (const n of list) {
    if (!n || (n.empty && n.empty())) continue;
    scopedEdges.filter((e) => e.data("source") === n.id()).forEach((e) => {
      const child = e.target();
      const id = child.id();
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(child);
      }
    });
  }
  while (queue.length) {
    const node = queue.shift();
    ids.add(node.id());
    scopedEdges.filter((e) => e.data("source") === node.id()).forEach((e) => {
      const child = e.target();
      const id = child.id();
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(child);
      }
    });
  }
  return ids;
}

function animateElement(el, properties, options) {
  return el.animation(properties, options).play().promise();
}

export async function playReduceRedundantTrace(
  cy,
  trace,
  { setGraph, onAfterEach, vars, ctx, scope = "full", applyLayout = null } = {}
) {
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

    const focusIds = step?.focus ?? [];
    const normalizedFocusIds = focusIds.map((id) => normalizeScopeId(cy, scope, id)).filter(Boolean);
    const focusIdSet = new Set(normalizedFocusIds);

    const { nodes, loHiEdges, bundle } = collectFocusBundle(cy, normalizedFocusIds, scope);
    const scopedE = scopeEdges(cy, scope);
    const scopedElements = scopeNodes(cy, scope).union(scopedE);

    const oldIncoming = cy.collection();
    const seenOldIncoming = new Set();
    const redirectTargetByEdgeId = new Map();
    nodes.forEach((n) => {
      const target = followChainToSink(cy, n, focusIdSet, scopedE);
      if (!target || target.empty()) return;
      const targetId = target.id();
      scopedE.filter((e) => e.data("target") === n.id()).forEach((e) => {
        const eid = e.id();
        if (seenOldIncoming.has(eid)) return;
        if (focusIdSet.has(e.source().id())) return;
        seenOldIncoming.add(eid);
        oldIncoming.merge(e);
        redirectTargetByEdgeId.set(eid, targetId);
      });
    });

    if (ENABLE_DIM_DURING_REDUNDANT) {
      dimAllExcept(cy, bundle.union(oldIncoming), scopedElements);
    }

    cy.batch(() => {
      nodes.addClass("focus");
      loHiEdges.addClass("focus");
    });
    pulseEdges(loHiEdges, { widthTo: 6, opacityTo: 1, ms: 160 });

    await sleep(HIGHLIGHT_MS);

    const moveAndFadePromises = [];
    nodes.forEach((n) => {
      n.stop(true);
      moveAndFadePromises.push(
        animateElement(
          n,
          { style: { opacity: 0 } },
          { duration: PUSH_MS, easing: "ease-in-out" }
        )
      );
    });
    loHiEdges.forEach((e) => {
      e.stop(true);
      moveAndFadePromises.push(
        animateElement(
          e,
          { style: { opacity: 0 } },
          { duration: PUSH_MS, easing: "ease-in-out" }
        )
      );
    });
    await Promise.all(moveAndFadePromises);
    await sleep(80);

    cy.batch(() => {
      oldIncoming.removeClass("dim");
      oldIncoming.addClass("focus");

      oldIncoming.forEach((e) => {
        const targetId = redirectTargetByEdgeId.get(e.id());
        if (!targetId) return;
        e.move({ target: targetId });
      });
    });

    const redirectPromises = [];
    oldIncoming.forEach((e) => {
      e.stop(true);
      redirectPromises.push(
        animateElement(
          e,
          { style: { opacity: 1, width: 6 } },
          { duration: RELINK_PULSE_MS, easing: "ease-in-out" }
        )
      );
    });

    await Promise.all(redirectPromises);
    await sleep(80);

    const targetPosMap = await computeSnapshotPositionMap(
      cy,
      snap,
      vars ?? [],
      userX,
      applyLayout ?? {}
    );
    if (targetPosMap.size && nodes.length) {
      const downstreamIds = collectAllDescendantIds(cy, nodes, scopedE);
      const toMove = scopeNodes(cy, scope).filter((n) => downstreamIds.has(n.id()) && targetPosMap.has(n.id()));
      const movePromises = [];
      toMove.forEach((node) => {
        const id = node.id();
        const target = targetPosMap.get(id);
        if (!target) return;
        const pos = node.position();
        if (pos.x === target.x && pos.y === target.y) return;
        node.stop(true);
        movePromises.push(
          animateElement(
            node,
            { position: { x: target.x, y: target.y } },
            { duration: DOWNSTREAM_MOVE_MS, easing: "ease-in-out" }
          )
        );
      });
      if (movePromises.length) {
        await Promise.all(movePromises);
        await sleep(60);
      }
    }

    const prev = buildIdSetsFromCy(cy, scope);
    const next = buildIdSetsFromSnapshot(snap, scope);

    await setGraph(snap, step);
    await sleep(0);

    const newEdgeIds = [];
    next.e.forEach((id) => {
      if (!prev.e.has(id)) newEdgeIds.push(id);
    });

    const newNodeIds = [];
    next.n.forEach((id) => {
      if (!prev.n.has(id)) newNodeIds.push(id);
    });

    const newEdges = cy.collection(newEdgeIds.map((id) => cy.getElementById(id))).filter((x) => x && !x.empty());
    const newNodes = cy.collection(newNodeIds.map((id) => scopeNodeById(cy, scope, id))).filter((x) => x && !x.empty());

    pulseEdges(newEdges, { widthTo: 6, opacityTo: 1, ms: RELINK_PULSE_MS });

    newNodes.forEach((n) => {
      n.stop(true);
      n.style({ opacity: 0.15 });
      n.animate({ style: { opacity: 1 } }, { duration: RELINK_PULSE_MS });
    });

    cy.batch(() => {
      scopedElements.removeClass("dim");
      scopedElements.removeClass("focus");
    });

    await onAfterEach?.(step, { stepIndex: i, stepsLen: steps.length });
  }
}
