import { TERM_ANIM } from "../config.js";
import { sleep } from "../graph/cy.js";
import {
  isTerminalNode,
  termValue,
  setDimAllExcept,
  clearDim,
  lastNonTerminalY,
  graphCenterX,
  spreadTerminalsX,
  fitLayer
} from "./common.js";

function pickRootNode(cy) {
  const nodes = cy.nodes();
  const edges = cy.edges();
  const indeg = new Map();
  nodes.forEach((n) => indeg.set(n.id(), 0));
  edges.forEach((e) => {
    const t = e.target().id();
    indeg.set(t, (indeg.get(t) || 0) + 1);
  });
  const roots = nodes.filter((n) => (indeg.get(n.id()) || 0) === 0);
  return roots[0] || null;
}

async function pruneUnreachableSilently(cy) {
  const root = pickRootNode(cy);
  if (!root) return;

  const reachableNodes = new Set([root.id()]);
  const reachableEdges = new Set();
  const stack = [root];

  while (stack.length) {
    const n = stack.pop();
    n.outgoers("edge").forEach((e) => {
      reachableEdges.add(e.id());
      const t = e.target();
      if (t && t.length && !reachableNodes.has(t.id())) {
        reachableNodes.add(t.id());
        stack.push(t);
      }
    });
  }

  const deadEdges = cy.edges().filter((e) => !reachableEdges.has(e.id()));
  const deadNodes = cy.nodes().filter((n) => !reachableNodes.has(n.id()));

  cy.batch(() => {
    deadEdges.remove();
    deadNodes.remove();
  });
}

export function canonicalizeTerminalsSilently(cy) {
  const terms = cy.nodes().filter(isTerminalNode);
  if (terms.length <= 2) return;

  const groups = new Map();
  terms.forEach((n) => {
    const v = termValue(n);
    if (v !== "0" && v !== "1") return;
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(n);
  });

  const need0 = (groups.get("0") || []).length > 1;
  const need1 = (groups.get("1") || []).length > 1;
  if (!need0 && !need1) return;

  cy.batch(() => {
    for (const v of ["0", "1"]) {
      const arr = groups.get(v) || [];
      if (arr.length <= 1) continue;

      const keep = arr[0];
      keep.addClass("terminal");
      keep.data("label", v);

      for (let i = 1; i < arr.length; i++) {
        const dup = arr[i];
        dup.incomers("edge").forEach((e) => {
          e.move({ target: keep.id() });
        });
        dup.remove();
      }
    }
  });
}

export async function animateReduceTerminals(cy, { onAfter } = {}) {
  const terms = cy.nodes().filter(isTerminalNode);
  if (terms.length <= 2) return;

  const groups = new Map();
  terms.forEach((n) => {
    const v = termValue(n);
    if (!groups.has(v)) groups.set(v, cy.collection());
    groups.set(v, groups.get(v).add(n));
  });

  const dupGroups = [...groups.entries()].filter(
    ([v, col]) => (v === "0" || v === "1") && col.length > 1
  );
  if (!dupGroups.length) return;

  const canonical = new Map();
  for (const [v, col] of dupGroups) canonical.set(v, col[0]);

  const focusNodes = cy.collection();
  dupGroups.forEach(([_, col]) => focusNodes.merge(col));

  const focusEdges = cy.collection();
  focusNodes.forEach((n) => focusEdges.merge(n.incomers("edge")));

  setDimAllExcept(cy, focusNodes.union(focusEdges));
  focusNodes.addClass("focus");

  await sleep(TERM_ANIM.highlightMs);

  const baseY = lastNonTerminalY(cy) + TERM_ANIM.gapBelow;
  const cx = graphCenterX(cy);

  const targetX = {
    "0": cx - TERM_ANIM.centerGapX,
    "1": cx + TERM_ANIM.centerGapX
  };

  const slidePromises = [];
  for (const [v, col] of dupGroups) {
    const tx = targetX[v] ?? cx;
    col.forEach((n) => {
      slidePromises.push(
        n.animation({ position: { x: tx, y: baseY } }, { duration: TERM_ANIM.slideMs, easing: "ease-in-out" })
          .play()
          .promise()
      );
    });
  }
  await Promise.all(slidePromises);

  cy.batch(() => {
    for (const [v, col] of dupGroups) {
      const keep = canonical.get(v);
      if (!keep) continue;

      col.forEach((n) => {
        if (n.id() === keep.id()) return;
        n.incomers("edge").forEach((e) => e.move({ target: keep.id() }));
        n.remove();
      });

      keep.position({ x: targetX[v] ?? cx, y: baseY });
    }
  });

  focusNodes.removeClass("focus");
  clearDim(cy);

  const remainingTerms = cy.nodes().filter(isTerminalNode);
  await spreadTerminalsX(cy, remainingTerms, { duration: 900, y: baseY });
  fitLayer(cy, remainingTerms, { padding: 60 });

  await pruneUnreachableSilently(cy);
  onAfter?.();
}