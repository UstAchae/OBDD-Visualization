import { LAYER_LAYOUT, TERM_ANIM } from "../config.js";

export function clearFocus(cy) {
  cy.nodes().removeClass("focus");
}

export function applyFocus(cy, ids) {
  clearFocus(cy);
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    const n = cy.getElementById(id);
    if (n && n.length) n.addClass("focus");
  }
}

export function isTerminalNode(n) {
  const lab = (n.data("label") ?? "").toString();
  return n.hasClass("terminal") || lab === "0" || lab === "1";
}

export function isNonTerminal(n) {
  return n && n.isNode && n.isNode() && !isTerminalNode(n);
}

export function termValue(n) {
  const lab = (n.data("label") ?? "").toString();
  if (lab === "0" || lab === "1") return lab;
  const v = n.data("value");
  if (v === 0 || v === 1 || v === "0" || v === "1") return String(v);
  return lab;
}

export function setDimAllExcept(cy, keepEles) {
  cy.batch(() => {
    cy.elements().removeClass("dim");
    if (!keepEles || !keepEles.length) return;
    const keep = keepEles.union(keepEles.connectedEdges()).union(keepEles.connectedNodes());
    cy.elements().difference(keep).addClass("dim");
  });
}

export function clearDim(cy) {
  cy.elements().removeClass("dim");
}

export function lastNonTerminalY(cy) {
  const ys = cy.nodes().filter((n) => !isTerminalNode(n)).map((n) => n.position("y"));
  if (!ys.length) return 0;
  return Math.max(...ys);
}

export function graphCenterX(cy) {
  const ext = cy.extent();
  return (ext.x1 + ext.x2) / 2;
}

export function extentWidthWithMin(cy, minSpan = 240) {
  const ext = cy.extent();
  return Math.max(ext.x2 - ext.x1, minSpan);
}

export async function spreadLayerX(cy, layerNodes, { duration = LAYER_LAYOUT.moveMs } = {}) {
  const ns = (layerNodes || cy.collection()).filter((n) => n.isNode() && !isTerminalNode(n));
  const n = ns.length;
  if (n <= 1) return;

  const ext = cy.extent();
  const width = Math.max(ext.x2 - ext.x1, LAYER_LAYOUT.minSpan);

  const ys = ns.map((x) => x.position("y"));
  const y = ys.reduce((a, b) => a + b, 0) / ys.length;

  const sorted = ns.sort((a, b) => a.position("x") - b.position("x"));
  const left = ext.x1;
  const step = width / (n + 1);

  const anims = [];
  sorted.forEach((node, i) => {
    const x = left + step * (i + 1);
    anims.push(node.animation({ position: { x, y } }, { duration, easing: "ease-in-out" }).play().promise());
  });

  await Promise.all(anims);
}

export function fitLayer(cy, layerNodes, { padding = LAYER_LAYOUT.fitPadding } = {}) {
  const ns = (layerNodes || cy.collection()).filter((n) => n.isNode());
  if (!ns.length) return;

  const neighborhood = ns.union(ns.connectedEdges()).union(ns.connectedNodes());
  cy.fit(neighborhood, padding);
}

export async function spreadTerminalsX(cy, termNodes, { duration = 700, y = null } = {}) {
  const ns = (termNodes || cy.collection()).filter((n) => n.isNode() && isTerminalNode(n));
  const n = ns.length;
  if (n <= 1) return;

  const ext = cy.extent();
  const width = extentWidthWithMin(cy, LAYER_LAYOUT.minSpan);
  const left = ext.x1;
  const step = width / (n + 1);

  const yy =
    y != null ? y : ns.map((x) => x.position("y")).reduce((a, b) => a + b, 0) / n;

  const sorted = ns.sort((a, b) => a.position("x") - b.position("x"));

  const anims = [];
  sorted.forEach((node, i) => {
    const x = left + step * (i + 1);
    anims.push(
      node.animation({ position: { x, y: yy } }, { duration, easing: "ease-in-out" }).play().promise()
    );
  });

  await Promise.all(anims);
}

export async function relayoutTerminalLayerEvenly(cy, { duration = 900 } = {}) {
  const terms = cy.nodes().filter(isTerminalNode);
  if (terms.length <= 1) return;

  const baseY = lastNonTerminalY(cy) + TERM_ANIM.gapBelow;

  cy.batch(() => {
    terms.forEach((n) => n.position({ x: n.position("x"), y: baseY }));
  });

  await spreadTerminalsX(cy, terms, { duration, y: baseY });
}

export function safeFit(cy, eles, padding = 50, { maxZoom = 1.2, minBox = 120 } = {}) {
  const collection = eles && eles.length ? eles : cy.elements();

  const bb = collection.boundingBox({ includeLabels: true });
  const w = bb.w || 0;
  const h = bb.h || 0;

  // If the box is too small (often due to overlap during animations),
  // do not zoom aggressively.
  if (w < minBox && h < minBox) {
    cy.fit(cy.elements(), padding);
    if (cy.zoom() > maxZoom) cy.zoom(maxZoom);
    return;
  }

  cy.fit(collection, padding);
  if (cy.zoom() > maxZoom) cy.zoom(maxZoom);
}
