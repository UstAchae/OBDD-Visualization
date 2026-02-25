import { REDUNDANT_ANIM } from "../config.js";
import { sleep, getGraphAnimToken } from "../graph/cy.js";
import { getAxisVars } from "../graph/layerAxis.js";
import {
  isTerminalNode,
  isNonTerminal,
  termValue,
  setDimAllExcept,
  clearDim,
  spreadLayerX,
  fitLayer
} from "./common.js";
import { relayoutTerminalLayerEvenly } from "./common.js";

function getNodesAtVarLabel(cy, v) {
  return cy.nodes().filter((n) => isNonTerminal(n) && n.data("label") === v);
}

function pickLowHighEdges(node) {
  const outs = node.outgoers("edge");
  let low = null;
  let high = null;

  outs.forEach((e) => {
    const lab = (e.data("label") ?? "").toString();
    if (lab === "0" || e.hasClass("zero")) low = e;
    else if (lab === "1" || e.hasClass("one")) high = e;
  });

  return { low, high };
}

function edgeClassString(e) {
  const cls = (e.classes && e.classes()) || [];
  return Array.isArray(cls) ? cls.join(" ") : String(cls || "");
}

function makeTempEdgeLike(cy, oldEdge, newTargetId) {
  const srcId = oldEdge.source().id();
  const oldId = oldEdge.id();
  const tmpId = `tmp-${oldId}-${crypto.randomUUID()}`;

  const cls = edgeClassString(oldEdge);
  const data = {
    id: tmpId,
    source: srcId,
    target: newTargetId,
    label: oldEdge.data("label")
  };

  const tmp = cy.add({ group: "edges", data, classes: cls });
  tmp.style("opacity", 0);
  return tmp;
}

async function pruneUnreachableSilently(cy) {
  const nodes = cy.nodes();
  const edges = cy.edges();
  const indeg = new Map();
  nodes.forEach((n) => indeg.set(n.id(), 0));
  edges.forEach((e) => {
    const t = e.target().id();
    indeg.set(t, (indeg.get(t) || 0) + 1);
  });

  const roots = nodes.filter((n) => (indeg.get(n.id()) || 0) === 0);
  const root = roots[0] || null;
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

  await relayoutTerminalLayerEvenly(cy, { duration: 900 });
}

export async function animateRemoveRedundantTests(cy, { onAfterBatch } = {}) {
  const axisVars = getAxisVars();
  if (!Array.isArray(axisVars) || axisVars.length === 0) return;

  const layers = axisVars.slice().reverse();

  for (const v of layers) {
    const layerNodes = getNodesAtVarLabel(cy, v);
    if (!layerNodes.length) continue;

    const groups = new Map();

    layerNodes.forEach((n) => {
      const { low, high } = pickLowHighEdges(n);
      if (!low || !high) return;

      const lowT = low.target();
      const highT = high.target();
      if (!lowT || !highT) return;

      let child = null;
      let key = null;

      if (lowT.id() === highT.id()) {
        child = lowT;
        key = `node:${child.id()}`;
      } else {
        const lowIsTerm = isTerminalNode(lowT);
        const highIsTerm = isTerminalNode(highT);

        if (lowIsTerm && highIsTerm && termValue(lowT) === termValue(highT)) {
          child = lowT;
          key = `term:${termValue(lowT)}`;
        } else {
          return;
        }
      }

      if (!groups.has(key)) {
        groups.set(key, {
          child,
          nodes: cy.collection(),
          outEdges: cy.collection(),
          extraFocus: cy.collection()
        });
      }

      const g = groups.get(key);
      g.nodes = g.nodes.add(n);
      g.outEdges = g.outEdges.add(low).add(high);

      if (isTerminalNode(lowT)) g.extraFocus = g.extraFocus.add(lowT);
      if (isTerminalNode(highT)) g.extraFocus = g.extraFocus.add(highT);
    });

    if (groups.size === 0) continue;

    for (const { child, nodes, outEdges, extraFocus } of groups.values()) {
      const token = getGraphAnimToken();
      const ef = extraFocus || cy.collection();

      const focus = nodes.union(outEdges).union(child).union(ef);
      setDimAllExcept(cy, focus);
      nodes.addClass("focus");
      child.addClass("focus");
      ef.addClass("focus");

      await sleep(REDUNDANT_ANIM.highlightMs);
      if (token !== getGraphAnimToken()) return;

      const tmpEdges = [];
      const incomingEdges = [];
      nodes.forEach((n) => n.incomers("edge").forEach((e) => incomingEdges.push(e)));

      cy.batch(() => {
        incomingEdges.forEach((e) => tmpEdges.push(makeTempEdgeLike(cy, e, child.id())));
      });

      const morphPromises = [];
      tmpEdges.forEach((te) =>
        morphPromises.push(
          te.animation({ style: { opacity: 1 } }, { duration: REDUNDANT_ANIM.edgeMorphMs, easing: "ease-in-out" })
            .play()
            .promise()
        )
      );
      incomingEdges.forEach((ie) =>
        morphPromises.push(
          ie.animation({ style: { opacity: 0 } }, { duration: REDUNDANT_ANIM.edgeMorphMs, easing: "ease-in-out" })
            .play()
            .promise()
        )
      );

      const fadePromises = [];
      outEdges.forEach((e) =>
        fadePromises.push(
          e.animation({ style: { opacity: 0 } }, { duration: REDUNDANT_ANIM.fadeOutMs, easing: "ease-in-out" })
            .play()
            .promise()
        )
      );
      nodes.forEach((n) =>
        fadePromises.push(
          n.animation({ style: { opacity: 0 } }, { duration: REDUNDANT_ANIM.fadeOutMs, easing: "ease-in-out" })
            .play()
            .promise()
        )
      );

      await Promise.all([...morphPromises, ...fadePromises]);
      if (token !== getGraphAnimToken()) return;

      nodes.removeClass("focus");
      child.removeClass("focus");
      ef.removeClass("focus");
      clearDim(cy);

      cy.batch(() => {
        incomingEdges.forEach((e) => e?.length && e.remove());
        tmpEdges.forEach((e) => e?.length && e.style("opacity", 1));
        outEdges.forEach((e) => e?.length && e.remove());
        nodes.forEach((n) => n?.length && n.remove());
      });

      await pruneUnreachableSilently(cy);
      onAfterBatch?.();

      await new Promise((r) => requestAnimationFrame(r));
      await sleep(REDUNDANT_ANIM.betweenBatchMs);
    }

    const remaining = getNodesAtVarLabel(cy, v);
    if (remaining.length) {
      await spreadLayerX(cy, remaining, { duration: 700 });
      fitLayer(cy, remaining, { padding: 60 });
    }
  }
}