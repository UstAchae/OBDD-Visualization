import { computeSnapshotPositionMap, sleep, smoothFit } from "../../graph/cy.js";
import { nodeInScopeSnapshot, scopeEdges, scopeNodes } from "../scope.js";

const HIGHLIGHT_MS = 420;
const MOVE_MS = 520;
const FADE_DUPLICATE_TERMINALS_MS = 280;
const ENABLE_INTERFRAME_ANIMATION = true;

export async function playReduceTerminalsTrace(
  cy,
  trace,
  { setGraph, onAfterEach, ctx, scope = "full", applyLayout = null } = {}
) {
  const vars = ctx?.vars ?? [];
  const steps = trace?.steps ?? [];
  if (!steps.length) return;
  if (!ENABLE_INTERFRAME_ANIMATION) {
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const snap = step?.snapshot;
      if (!snap) continue;
      await setGraph(snap, step);
      await sleep(0);
      await onAfterEach?.(step, { stepIndex: i, stepsLen: steps.length });
    }
    return;
  }

  // IMPORTANT:
  // The initial snapshot has already been rendered by runReduceTrace.

  // We will animate ONCE, then jump straight to final snapshot.
  const finalStep = steps.at(-1);
  const finalSnap = finalStep?.snapshot;
  if (!finalSnap) return;

  // collect terminals on CURRENT graph (initial)
  const scopedNodes = scopeNodes(cy, scope, { excludeHiddenStep: true });
  const scopedNodeIds = new Set(scopedNodes.map((n) => n.id()));
  const scopedEdges = scopeEdges(cy, scope, scopedNodeIds, { excludeHiddenStep: true });
  const terms = scopedNodes.filter((n) => {
    const lab = String(n.data("label") ?? "");
    return n.hasClass("terminal") || lab === "0" || lab === "1";
  });

  const zeros = terms.filter((n) => String(n.data("label")) === "0");
  const ones = terms.filter((n) => String(n.data("label")) === "1");

  // highlight both at once
  cy.batch(() => {
    zeros.addClass("term-hi-0");
    ones.addClass("term-hi-1");
  });

  await sleep(HIGHLIGHT_MS);

  // Move terminals to final snapshot target positions so animation path matches authoritative frame.
  const userX = ctx?.state?.userX ?? null;
  const targetPosMap = await computeSnapshotPositionMap(cy, finalSnap, vars, userX, applyLayout ?? {});
  const kept0Id = (finalSnap?.nodes ?? [])
    .filter((nd) => nodeInScopeSnapshot(nd, scope, { excludeHiddenStep: true }))
    .find((nd) => String(nd?.data?.label) === "0")?.data?.id;
  const kept1Id = (finalSnap?.nodes ?? [])
    .filter((nd) => nodeInScopeSnapshot(nd, scope, { excludeHiddenStep: true }))
    .find((nd) => String(nd?.data?.label) === "1")?.data?.id;
  const target0 = kept0Id ? targetPosMap.get(kept0Id) : null;
  const target1 = kept1Id ? targetPosMap.get(kept1Id) : null;

  if (target0) zeros.forEach((n) => n.animate({ position: { x: target0.x, y: target0.y } }, { duration: MOVE_MS }));
  if (target1) ones.forEach((n) => n.animate({ position: { x: target1.x, y: target1.y } }, { duration: MOVE_MS }));

  await sleep(MOVE_MS);

  // remove highlight
  cy.batch(() => {
    zeros.removeClass("term-hi-0");
    ones.removeClass("term-hi-1");
  });

  // Redirect parent edges from duplicate terminals to the kept terminal (same value)
  // so that when we move the kept terminals, all edges follow.
  const snapshotNodeIds = new Set(
    (finalSnap?.nodes ?? [])
      .filter((nd) => nodeInScopeSnapshot(nd, scope, { excludeHiddenStep: true }))
      .map((nd) => nd?.data?.id)
      .filter(Boolean)
  );

  const termsToFade = terms.filter((n) => !snapshotNodeIds.has(n.id()));
  if (termsToFade.length && (kept0Id || kept1Id)) {
    cy.batch(() => {
      termsToFade.forEach((n) => {
        const lab = String(n.data("label") ?? "");
        const targetId = lab === "0" ? kept0Id : lab === "1" ? kept1Id : null;
        if (!targetId) return;
        const nid = n.id();
        scopedEdges
          .filter((e) => e.data("target") === nid)
          .forEach((e) => e.move({ target: targetId }));
      });
    });
  }

  // Fade out duplicate terminals (not in snapshot) to avoid ghosting.
  if (termsToFade.length) {
    const fadePromises = termsToFade.map((n) =>
      n.animation({ style: { opacity: 0 } }, { duration: FADE_DUPLICATE_TERMINALS_MS, easing: "ease-in-out" }).play().promise()
    );
    await Promise.all(fadePromises);
    await sleep(50);
  }

  // Fit viewport to current graph, then apply final snapshot.
  await smoothFit(cy, undefined, { padding: 30, duration: 260 });
  await setGraph(finalSnap, finalStep);
  await sleep(0);

  await onAfterEach?.(finalStep, { stepIndex: steps.length - 1, stepsLen: steps.length });
}
