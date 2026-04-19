export function isApplyResultScope(scope) {
  return scope === "apply-result";
}

export function isApplyResultNode(node, { excludeHiddenStep = false } = {}) {
  if (!node || node.empty?.()) return false;
  if (!node.hasClass("apply-result")) return false;
  if (node.hasClass("apply-pair") || node.hasClass("apply-slot") || node.hasClass("apply-ghost")) return false;
  if (excludeHiddenStep && node.hasClass("apply-hidden-step")) return false;
  return true;
}

export function scopeNodes(cy, scope, opts = {}) {
  if (!isApplyResultScope(scope)) return cy.nodes();
  return cy.nodes().filter((n) => isApplyResultNode(n, opts));
}

export function scopeEdges(cy, scope, nodeIds = null, opts = {}) {
  if (!isApplyResultScope(scope)) return cy.edges();
  const ids = nodeIds ?? new Set(scopeNodes(cy, scope, opts).map((n) => n.id()));
  return cy
    .edges(".apply-result")
    .filter((e) => ids.has(e.data("source")) && ids.has(e.data("target")));
}

export function scopeNodeById(cy, scope, id, opts = {}) {
  const direct = cy.getElementById(id);
  if (direct && !direct.empty?.()) {
    if (!isApplyResultScope(scope)) return direct;
    if (isApplyResultNode(direct, opts)) return direct;
  }
  if (isApplyResultScope(scope) && id && !String(id).startsWith("M-")) {
    const prefixed = cy.getElementById(`M-${id}`);
    if (prefixed && !prefixed.empty?.() && isApplyResultNode(prefixed, opts)) return prefixed;
  }
  return null;
}

export function normalizeScopeId(cy, scope, id, opts = {}) {
  const n = scopeNodeById(cy, scope, id, opts);
  return n ? n.id() : null;
}

export function nodeInScopeSnapshot(nd, scope, { excludeHiddenStep = false } = {}) {
  if (!isApplyResultScope(scope)) return true;
  const cls = String(nd?.classes ?? "");
  if (!cls.includes("apply-result")) return false;
  if (cls.includes("apply-pair") || cls.includes("apply-slot") || cls.includes("apply-ghost")) return false;
  if (excludeHiddenStep && cls.includes("apply-hidden-step")) return false;
  return true;
}
