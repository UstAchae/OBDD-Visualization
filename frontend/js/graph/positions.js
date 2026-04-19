export function captureNodePositions(cy) {
  const out = new Map();
  cy.nodes().forEach((n) => {
    const p = n.position();
    out.set(n.id(), { x: p.x, y: p.y });
  });
  return out;
}

export function restoreNodePositions(cy, posMap) {
  if (!posMap || !(posMap instanceof Map) || posMap.size === 0) return;
  cy.batch(() => {
    cy.nodes().forEach((n) => {
      const p = posMap.get(n.id());
      if (!p) return;
      n.position({ x: p.x, y: p.y });
    });
  });
}

export async function animateInterframeTransition(cy, fromPosMap, { duration = 260, minDelta = 1 } = {}) {
  if (!(fromPosMap instanceof Map) || fromPosMap.size === 0) return;
  const animations = [];
  cy.batch(() => {
    cy.nodes().forEach((n) => {
      const from = fromPosMap.get(n.id());
      if (!from) return;
      const to = n.position();
      if (!Number.isFinite(from.x) || !Number.isFinite(from.y)) return;
      if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) return;
      if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) < minDelta) return;
      n.position({ x: from.x, y: from.y });
      animations.push(
        n.animation(
          { position: { x: to.x, y: to.y } },
          { duration, easing: "ease-in-out" }
        ).play().promise()
      );
    });
  });
  if (!animations.length) return;
  await Promise.allSettled(animations);
}
