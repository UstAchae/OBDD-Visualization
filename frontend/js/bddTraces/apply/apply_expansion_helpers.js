import { sleep } from "../../graph/cy.js";

const HIGHLIGHT_MS = 620;
const REVEAL_MS = 520;
export const GAP_MS = 280;

export function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

export function addClassToIds(cy, ids, cls) {
  cy.batch(() => {
    uniqueIds(ids).forEach((id) => cy.getElementById(id)?.addClass(cls));
  });
}

export function removeClassFromIds(cy, ids, cls) {
  cy.batch(() => {
    uniqueIds(ids).forEach((id) => cy.getElementById(id)?.removeClass(cls));
  });
}

export async function pulseFocus(cy, ids, ms = HIGHLIGHT_MS) {
  const uniq = uniqueIds(ids);
  if (!uniq.length) return;
  addClassToIds(cy, uniq, "focus");
  await sleep(ms);
  removeClassFromIds(cy, uniq, "focus");
}

export function hideStepElements(cy, ids) {
  addClassToIds(cy, ids, "apply-hidden-step");
}

export function revealStepElements(cy, ids) {
  removeClassFromIds(cy, ids, "apply-hidden-step");
}

export function mergeClasses(existing, extra) {
  const parts = `${existing ?? ""} ${extra ?? ""}`
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(parts)].join(" ");
}

export function snapshotWithHiddenIds(snapshot, ids) {
  const hidden = new Set(uniqueIds(ids));
  if (!hidden.size || !snapshot) return snapshot;

  const clone = structuredClone(snapshot);
  if (Array.isArray(clone?.nodes)) {
    clone.nodes = clone.nodes.map((node) => {
      const id = node?.data?.id;
      if (!hidden.has(id)) return node;
      return { ...node, classes: mergeClasses(node.classes, "apply-hidden-step") };
    });
  }
  if (Array.isArray(clone?.edges)) {
    clone.edges = clone.edges.map((edge) => {
      const id = edge?.data?.id;
      if (!hidden.has(id)) return edge;
      return { ...edge, classes: mergeClasses(edge.classes, "apply-hidden-step") };
    });
  }
  return clone;
}

export function splitRevealIds(ids) {
  const uniq = uniqueIds(ids);
  return {
    edgeIds: uniq.filter((id) => id.startsWith("e_")),
    nodeIds: uniq.filter((id) => !id.startsWith("e_"))
  };
}

export async function focusAndReveal(cy, focusIds, revealIds, ms = REVEAL_MS) {
  const focus = uniqueIds(focusIds);
  const reveal = uniqueIds(revealIds);
  if (!focus.length) {
    if (reveal.length) {
      revealStepElements(cy, reveal);
      await sleep(ms);
    }
    return;
  }

  addClassToIds(cy, focus, "focus");
  if (reveal.length) revealStepElements(cy, reveal);
  await sleep(ms);
  removeClassFromIds(cy, focus, "focus");
}

export { REVEAL_MS };
