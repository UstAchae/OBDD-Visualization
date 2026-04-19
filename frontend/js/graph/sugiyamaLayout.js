import { computeDiscreteObddPosMapFromCy } from "./discreteObddLayout.js";

/**
 * Sugiyama-style layered layout for OBDD: fixed layer per variable (and terminal row),
 * barycenter crossing reduction, then horizontal placement. Used for apply snapshots
 * (three zones L / M / R) with shared vertical axis (layerGap).
 */

function zoneKeyForNode(node) {
  if (node.hasClass("apply-left")) return "L";
  if (node.hasClass("apply-result")) return "M";
  if (node.hasClass("apply-right")) return "R";
  return null;
}

function isTerminalLike(node) {
  const lab = String(node.data("label") ?? "");
  return node.hasClass("terminal") || lab === "0" || lab === "1";
}

function baseLayerIndex(node, vars) {
  const nVar = vars.length;
  if (isTerminalLike(node)) return nVar;
  const lab = String(node.data("label") ?? "");
  const idx = vars.indexOf(lab);
  if (idx >= 0) return idx;
  return null;
}

/**
 * Structural layer for nodes without a variable label (slots, ghosts): longest path from roots.
 */
function structuralLayers(ids, edges, vars, cy) {
  const nVar = vars.length;
  const terminalLayer = nVar;
  const idSet = new Set(ids);
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const { s, t } of edges) {
    if (idSet.has(s) && idSet.has(t)) indeg.set(t, (indeg.get(t) || 0) + 1);
  }
  const memo = new Map();

  function layerOf(id) {
    if (memo.has(id)) return memo.get(id);
    const ele = cy.getElementById(id);
    if (ele.empty()) {
      memo.set(id, 0);
      return 0;
    }
    const fixed = baseLayerIndex(ele, vars);
    if (fixed != null) {
      memo.set(id, fixed);
      return fixed;
    }
    const preds = edges.filter((e) => e.t === id && idSet.has(e.s)).map((e) => e.s);
    let L = 0;
    if (preds.length) {
      L = Math.max(...preds.map((p) => layerOf(p) + 1));
    }
    L = Math.min(L, Math.max(0, terminalLayer - 1));
    memo.set(id, L);
    return L;
  }

  for (const id of ids) layerOf(id);
  const out = new Map();
  for (const id of ids) out.set(id, memo.get(id) ?? 0);
  return out;
}

function buildLayers(ids, layerOf) {
  const byLayer = new Map();
  const maxL = Math.max(...[...layerOf.values()]);
  for (let l = 0; l <= maxL; l++) byLayer.set(l, []);
  for (const id of ids) {
    const L = layerOf.get(id) ?? 0;
    if (!byLayer.has(L)) byLayer.set(L, []);
    byLayer.get(L).push(id);
  }
  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  return sortedLayers.map((l) => ({ layer: l, nodes: byLayer.get(l) }));
}

function indexMap(order) {
  const m = new Map();
  order.forEach((id, i) => m.set(id, i));
  return m;
}

function barySort(layerIds, neighborIds, posInNeighbor) {
  const scored = layerIds.map((id) => {
    const ns = neighborIds(id);
    if (!ns.length) return { id, score: -1 };
    const xs = ns.map((j) => posInNeighbor.get(j)).filter((x) => x != null);
    if (!xs.length) return { id, score: -1 };
    return { id, score: xs.reduce((a, b) => a + b, 0) / xs.length };
  });
  scored.sort((a, b) => (a.score === b.score ? a.id.localeCompare(b.id) : a.score - b.score));
  return scored.map((s) => s.id);
}

function average(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function edgeKindOf(edge) {
  const lab = String(edge.data("label") ?? "");
  if (lab === "0" || edge.hasClass("zero")) return "0";
  if (lab === "1" || edge.hasClass("one")) return "1";
  return null;
}

function centeredOrderX(order, xGap) {
  const n = order.length;
  const width = Math.max(0, n - 1) * xGap;
  return order.map((_, i) => -width / 2 + i * xGap);
}

function spreadLayerAroundDesired(order, desiredById, currentX, minGap) {
  if (!order.length) return [];
  const desired = order.map((id) => desiredById.get(id) ?? currentX.get(id) ?? 0);
  const placed = [desired[0]];
  for (let i = 1; i < desired.length; i++) {
    placed[i] = Math.max(desired[i], placed[i - 1] + minGap);
  }
  const avgShift = average(placed.map((x, i) => x - desired[i])) ?? 0;
  for (let i = 0; i < placed.length; i++) {
    placed[i] -= avgShift;
  }
  for (let i = 1; i < placed.length; i++) {
    if (placed[i] < placed[i - 1] + minGap) {
      placed[i] = placed[i - 1] + minGap;
    }
  }
  return placed;
}

function assignHorizontalCoordinates(
  layerBlocks,
  predMap,
  succMap,
  inEdgeMap,
  outEdgeMap,
  xGap,
  branchGap,
  relaxIterations
) {
  const x = new Map();

  for (const block of layerBlocks) {
    const initXs = centeredOrderX(block.nodes, xGap);
    block.nodes.forEach((id, i) => x.set(id, initXs[i]));
  }

  function incomingBranchBias(id) {
    const vals = [];
    for (const { source, kind } of inEdgeMap.get(id) || []) {
      const px = x.get(source);
      if (px == null || !kind) continue;
      vals.push(kind === "0" ? px - branchGap : px + branchGap);
    }
    return average(vals);
  }

  function outgoingMidBias(id) {
    let lowX = null;
    let highX = null;
    for (const { target, kind } of outEdgeMap.get(id) || []) {
      const tx = x.get(target);
      if (tx == null) continue;
      if (kind === "0") lowX = tx;
      if (kind === "1") highX = tx;
    }
    if (lowX != null && highX != null) return (lowX + highX) / 2;
    if (lowX != null) return lowX + branchGap;
    if (highX != null) return highX - branchGap;
    return null;
  }

  function relaxLayer(order, desiredById) {
    const xs = spreadLayerAroundDesired(order, desiredById, x, xGap);
    order.forEach((id, i) => x.set(id, xs[i]));
  }

  for (let it = 0; it < relaxIterations; it++) {
    for (let li = 1; li < layerBlocks.length; li++) {
      const order = layerBlocks[li].nodes;
      const desired = new Map();
      for (const id of order) {
        const predXs = (predMap.get(id) || []).map((pid) => x.get(pid)).filter((v) => v != null);
        const bary = average(predXs);
        const bias = incomingBranchBias(id);
        const wants = [bary, bias, x.get(id)].filter((v) => v != null);
        if (wants.length) desired.set(id, average(wants));
      }
      relaxLayer(order, desired);
    }

    for (let li = layerBlocks.length - 2; li >= 0; li--) {
      const order = layerBlocks[li].nodes;
      const desired = new Map();
      for (const id of order) {
        const succXs = (succMap.get(id) || []).map((cid) => x.get(cid)).filter((v) => v != null);
        const bary = average(succXs);
        const bias = outgoingMidBias(id);
        const wants = [bary, bias, x.get(id)].filter((v) => v != null);
        if (wants.length) desired.set(id, average(wants));
      }
      relaxLayer(order, desired);
    }
  }

  return x;
}

function segmentOverlapAmount(a, b) {
  const eps = 1e-6;
  const ax = a.x2 - a.x1;
  const ay = a.y2 - a.y1;
  const bx = b.x2 - b.x1;
  const by = b.y2 - b.y1;

  const crossDir = ax * by - ay * bx;
  if (Math.abs(crossDir) > eps) return 0;

  const crossOff = ax * (b.y1 - a.y1) - ay * (b.x1 - a.x1);
  if (Math.abs(crossOff) > eps) return 0;

  const useX = Math.abs(ax) >= Math.abs(ay);
  const [a1, a2] = useX
    ? [Math.min(a.x1, a.x2), Math.max(a.x1, a.x2)]
    : [Math.min(a.y1, a.y2), Math.max(a.y1, a.y2)];
  const [b1, b2] = useX
    ? [Math.min(b.x1, b.x2), Math.max(b.x1, b.x2)]
    : [Math.min(b.y1, b.y2), Math.max(b.y1, b.y2)];

  const overlap = Math.min(a2, b2) - Math.max(a1, b1);
  return overlap > 1 ? overlap : 0;
}

function buildSegment(edge, pos) {
  const p1 = pos.get(edge.s);
  const p2 = pos.get(edge.t);
  if (!p1 || !p2) return null;
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

function overlapPenaltyForNode(nodeId, pos, edges) {
  const incident = edges.filter((e) => e.s === nodeId || e.t === nodeId);
  let total = 0;

  for (const e1 of incident) {
    const s1 = buildSegment(e1, pos);
    if (!s1) continue;
    for (const e2 of edges) {
      if (e1 === e2) continue;
      const s2 = buildSegment(e2, pos);
      if (!s2) continue;
      total += segmentOverlapAmount(s1, s2);
    }
  }

  return total;
}

function snapNodesToNearestTerminalColumn(ids, pos, cy, userX, X0, X1, edges, relaxedX, candidateXs) {
  const adjustable = ids.filter((id) => {
    const node = cy.getElementById(id);
    return !node.empty() && !isTerminalLike(node) && !(userX && userX.has(id));
  });

  const byY = [...adjustable].sort((a, b) => (pos.get(a)?.y ?? 0) - (pos.get(b)?.y ?? 0));
  const span = Math.max(1, Math.abs(X1 - X0));
  const candidates = (candidateXs || []).filter((x) => Number.isFinite(x));
  if (!candidates.length) return;

  for (let pass = 0; pass < 3; pass++) {
    for (const id of byY) {
      const cur = pos.get(id);
      if (!cur) continue;
      const rx = relaxedX.get(id) ?? cur.x;

      let bestX = cur.x;
      let bestCost = Infinity;

      for (const candidateX of candidates) {
        pos.set(id, { x: candidateX, y: cur.y });
        const overlapCost = overlapPenaltyForNode(id, pos, edges);
        const distanceCost = Math.abs(rx - candidateX) / span;
        const cost = overlapCost * 1000 + distanceCost;
        if (cost < bestCost) {
          bestCost = cost;
          bestX = candidateX;
        }
      }

      pos.set(id, { x: bestX, y: cur.y });
    }
  }
}

function terminalColumnCandidates(X0, X1, xGap) {
  const left = Math.min(X0, X1);
  const right = Math.max(X0, X1);
  const span = Math.max(1, right - left);
  const columnCount = Math.max(3, Math.round(span / Math.max(1, xGap)) + 1);
  const step = span / Math.max(1, columnCount - 1);
  return Array.from({ length: columnCount }, (_, i) => left + i * step);
}

function buildBfsLayerBlocks(ids, edges, layerOf) {
  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map(ids.map((id) => [id, []]));
  const edgeRank = { "0": 0, "1": 1 };

  for (const { s, t, kind } of edges) {
    indeg.set(t, (indeg.get(t) || 0) + 1);
    out.get(s)?.push({ id: t, kind: kind ?? "" });
  }

  out.forEach((arr) => {
    arr.sort((a, b) => {
      const ra = edgeRank[a.kind] ?? 9;
      const rb = edgeRank[b.kind] ?? 9;
      if (ra !== rb) return ra - rb;
      return a.id.localeCompare(b.id);
    });
  });

  const roots = ids
    .filter((id) => (indeg.get(id) || 0) === 0)
    .sort((a, b) => (layerOf.get(a) ?? 0) - (layerOf.get(b) ?? 0) || a.localeCompare(b));

  const seen = new Set();
  const orderByLayer = new Map();
  const queue = [...roots];

  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);

    const layer = layerOf.get(id) ?? 0;
    if (!orderByLayer.has(layer)) orderByLayer.set(layer, []);
    orderByLayer.get(layer).push(id);

    for (const child of out.get(id) || []) {
      if (!seen.has(child.id)) queue.push(child.id);
    }
  }

  const leftovers = ids
    .filter((id) => !seen.has(id))
    .sort((a, b) => (layerOf.get(a) ?? 0) - (layerOf.get(b) ?? 0) || a.localeCompare(b));

  for (const id of leftovers) {
    const layer = layerOf.get(id) ?? 0;
    if (!orderByLayer.has(layer)) orderByLayer.set(layer, []);
    orderByLayer.get(layer).push(id);
  }

  return [...orderByLayer.keys()]
    .sort((a, b) => a - b)
    .map((layer) => ({ layer, nodes: orderByLayer.get(layer) }));
}

function bfsZoneLayout(cy, idSet, vars, userX, opts) {
  const layerGap = opts.layerGap ?? 120;
  const xGap = opts.xGap ?? 54;
  const termPad = opts.termPad ?? 70;
  const termGap = opts.termGap ?? 160;

  const ids = [...idSet].filter((id) => !cy.getElementById(id).empty());
  if (!ids.length) return new Map();

  const edges = [];
  cy.edges().forEach((e) => {
    const s = e.source().id();
    const t = e.target().id();
    if (idSet.has(s) && idSet.has(t)) edges.push({ s, t, kind: edgeKindOf(e) });
  });

  const layerOf = structuralLayers(ids, edges, vars, cy);
  const layerBlocks = buildBfsLayerBlocks(ids, edges, layerOf);
  const nVar = vars.length;
  const pos = new Map();

  for (const block of layerBlocks) {
    const { layer, nodes } = block;
    const width = Math.max(0, nodes.length - 1) * xGap;
    const y = layer === nVar ? (nVar + 1) * layerGap : (layer + 1) * layerGap;
    nodes.forEach((id, i) => {
      let x = -width / 2 + i * xGap;
      if (userX && userX.has(id)) x = userX.get(id);
      pos.set(id, { x, y });
    });
  }

  const termIds = ids.filter((id) => isTerminalLike(cy.getElementById(id)));
  if (termIds.length <= 2 && termIds.length > 0) {
    const nonTermXs = ids
      .filter((id) => !isTerminalLike(cy.getElementById(id)))
      .map((id) => pos.get(id)?.x ?? 0);
    let x1 = 0;
    let x2 = 0;
    if (nonTermXs.length) {
      x1 = Math.min(...nonTermXs);
      x2 = Math.max(...nonTermXs);
    } else {
      const xs = termIds.map((id) => pos.get(id)?.x ?? 0);
      x1 = Math.min(...xs);
      x2 = Math.max(...xs);
    }
    const mid = (x1 + x2) / 2;
    const X0 = Math.min(x1 + termPad, mid - termGap / 2);
    const X1 = Math.max(x2 - termPad, mid + termGap / 2);
    const YT = (vars.length + 1) * layerGap;

    for (const tid of termIds) {
      const lab = String(cy.getElementById(tid).data("label") ?? "");
      let x = pos.get(tid)?.x ?? 0;
      if (userX && userX.has(tid)) x = userX.get(tid);
      else if (lab === "0") x = X0;
      else if (lab === "1") x = X1;
      pos.set(tid, { x, y: YT });
    }
  }

  return pos;
}

export function computePinnedApplyResultLayout(elements, vars, opts = {}) {
  if (!elements?.nodes?.length || !Array.isArray(vars) || !vars.length || typeof cytoscape !== "function") {
    return new Map();
  }

  const cy = cytoscape({
    headless: true,
    style: [],
    elements: []
  });

  try {
    cy.add(elements);
    const idSet = new Set(cy.nodes(".apply-result").map((n) => n.id()));
    if (!idSet.size) return new Map();
    return computeDiscreteObddPosMapFromCy(cy, idSet, vars, null, {
      xGap: opts.xGap ?? 54,
      layerGap: opts.layerGap ?? 120
    });
  } finally {
    cy.destroy();
  }
}

/**
 * One zone: nodes in idSet, internal edges only. Returns Map id -> {x,y} in local coordinates.
 */
export function sugiyamaZoneLayout(cy, idSet, vars, userX, opts) {
  const layerGap = opts.layerGap ?? 120;
  const xGap = opts.xGap ?? 54;
  const termPad = opts.termPad ?? 70;
  const termGap = opts.termGap ?? 160;
  const snapToTerminalColumns = opts.snapToTerminalColumns ?? false;
  const iterations = opts.iterations ?? 24;
  const coordIterations = opts.coordIterations ?? 10;
  const branchGap = opts.branchGap ?? Math.max(xGap * 0.8, 36);

  const ids = [...idSet].filter((id) => !cy.getElementById(id).empty());
  if (!ids.length) return new Map();

  const edges = [];
  cy.edges().forEach((e) => {
    const s = e.source().id();
    const t = e.target().id();
    if (idSet.has(s) && idSet.has(t)) edges.push({ s, t, kind: edgeKindOf(e) });
  });

  const layerOf = structuralLayers(ids, edges, vars, cy);
  let layerBlocks = buildLayers(ids, layerOf);

  const predMap = new Map(ids.map((id) => [id, []]));
  const succMap = new Map(ids.map((id) => [id, []]));
  const inEdgeMap = new Map(ids.map((id) => [id, []]));
  const outEdgeMap = new Map(ids.map((id) => [id, []]));
  for (const { s, t, kind } of edges) {
    succMap.get(s).push(t);
    predMap.get(t).push(s);
    outEdgeMap.get(s).push({ source: s, target: t, kind });
    inEdgeMap.get(t).push({ source: s, target: t, kind });
  }

  for (let it = 0; it < iterations; it++) {
    const down = it % 2 === 0;
    const orderByLayer = new Map(layerBlocks.map((b) => [b.layer, [...b.nodes]]));

    if (down) {
      for (let li = 1; li < layerBlocks.length; li++) {
        const L = layerBlocks[li].layer;
        const prevL = layerBlocks[li - 1].layer;
        const prevOrder = orderByLayer.get(prevL);
        const posPrev = indexMap(prevOrder);
        const cur = orderByLayer.get(L);
        const next = barySort(
          cur,
          (id) => predMap.get(id).filter((p) => layerOf.get(p) === prevL),
          posPrev
        );
        orderByLayer.set(L, next);
      }
    } else {
      for (let li = layerBlocks.length - 2; li >= 0; li--) {
        const L = layerBlocks[li].layer;
        const nextL = layerBlocks[li + 1].layer;
        const nextOrder = orderByLayer.get(nextL);
        const posNext = indexMap(nextOrder);
        const cur = orderByLayer.get(L);
        const next = barySort(
          cur,
          (id) => succMap.get(id).filter((c) => layerOf.get(c) === nextL),
          posNext
        );
        orderByLayer.set(L, next);
      }
    }

    layerBlocks = layerBlocks.map((b) => ({
      layer: b.layer,
      nodes: orderByLayer.get(b.layer) ?? b.nodes
    }));
  }

  const nVar = vars.length;
  const relaxedX = assignHorizontalCoordinates(
    layerBlocks,
    predMap,
    succMap,
    inEdgeMap,
    outEdgeMap,
    xGap,
    branchGap,
    coordIterations
  );
  const pos = new Map();
  for (const block of layerBlocks) {
    const { layer, nodes } = block;
    const ys = layer === nVar ? (nVar + 1) * layerGap : (layer + 1) * layerGap;
    nodes.forEach((id) => {
      let xf = relaxedX.get(id) ?? 0;
      if (userX && userX.has(id)) xf = userX.get(id);
      pos.set(id, { x: xf, y: ys });
    });
  }

  const termIds = ids.filter((id) => isTerminalLike(cy.getElementById(id)));
  if (termIds.length <= 2 && termIds.length > 0) {
    const nonTermXs = ids
      .filter((id) => !isTerminalLike(cy.getElementById(id)))
      .map((id) => pos.get(id)?.x ?? 0);
    let x1 = 0;
    let x2 = 0;
    if (nonTermXs.length) {
      x1 = Math.min(...nonTermXs);
      x2 = Math.max(...nonTermXs);
    } else {
      const xs = termIds.map((id) => pos.get(id)?.x ?? 0);
      x1 = Math.min(...xs);
      x2 = Math.max(...xs);
    }
    const mid = (x1 + x2) / 2;
    const X0 = Math.min(x1 + termPad, mid - termGap / 2);
    const X1 = Math.max(x2 - termPad, mid + termGap / 2);
    const YT = (vars.length + 1) * layerGap;
    const terminalLabels = new Set(termIds.map((id) => String(cy.getElementById(id).data("label") ?? "")));

    for (const tid of termIds) {
      const lab = String(cy.getElementById(tid).data("label") ?? "");
      let xf = pos.get(tid)?.x ?? 0;
      if (userX && userX.has(tid)) xf = userX.get(tid);
      else if (lab === "0") xf = X0;
      else if (lab === "1") xf = X1;
      pos.set(tid, { x: xf, y: YT });
    }

    if (snapToTerminalColumns && terminalLabels.has("0") && terminalLabels.has("1")) {
      snapNodesToNearestTerminalColumn(
        ids,
        pos,
        cy,
        userX,
        X0,
        X1,
        edges,
        relaxedX,
        terminalColumnCandidates(X0, X1, xGap)
      );
    }
  }

  return pos;
}

function bboxCenterX(posMap) {
  const xs = [...posMap.values()].map((p) => p.x);
  if (!xs.length) return 0;
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

function bboxOfPosMap(posMap) {
  const xs = [...posMap.values()].map((p) => p.x);
  if (!xs.length) return { left: 0, right: 0, width: 0, center: 0 };
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  return { left, right, width: right - left, center: (left + right) / 2 };
}

function desiredApplySpanWidth(cy, vars, layerGap) {
  const container = cy?.container?.();
  const widthPx = container?.clientWidth ?? 0;
  const heightPx = container?.clientHeight ?? 0;
  if (!widthPx || !heightPx || !Array.isArray(vars) || !vars.length) return null;

  const graphHeight = (vars.length + 1) * layerGap;
  const aspect = widthPx / heightPx;
  return graphHeight * aspect * 0.92;
}

function translatePosMap(posMap, dx) {
  const out = new Map();
  for (const [id, p] of posMap) out.set(id, { x: p.x + dx, y: p.y });
  return out;
}

function clonePosMap(posMap) {
  const out = new Map();
  for (const [id, p] of posMap ?? []) out.set(id, { x: p.x, y: p.y });
  return out;
}

function readCurrentZonePositions(cy, idSet) {
  const out = new Map();
  for (const id of idSet) {
    const n = cy.getElementById(id);
    if (n.empty()) continue;
    out.set(id, { x: n.position("x"), y: n.position("y") });
  }
  return out;
}

/**
 * Apply three-zone horizontal spacing (mirrors backend ApplySnap.zoneOffsets intent).
 */
function zoneSpacing(varCount, xGap) {
  const leafCount = Math.pow(2, Math.max(1, varCount));
  const width = leafCount * xGap;
  return Math.max(360, width * 0.7 + 120);
}

function zoneLayoutSignature(cy, idSet, vars, key, { xGap, termGap, iterations }) {
  const nodes = [...idSet]
    .filter((id) => !cy.getElementById(id).empty())
    .map((id) => {
      const n = cy.getElementById(id);
      return `${id}:${String(n.data("label") ?? "")}:${n.hasClass("terminal") ? 1 : 0}`;
    })
    .sort();

  const edges = [];
  cy.edges().forEach((e) => {
    const s = e.source().id();
    const t = e.target().id();
    if (idSet.has(s) && idSet.has(t)) {
      edges.push(`${s}>${edgeKindOf(e) ?? "?"}>${t}`);
    }
  });
  edges.sort();

  return JSON.stringify({
    key,
    vars,
    xGap,
    termGap,
    iterations,
    nodes,
    edges
  });
}

function readCachedZoneLayout(zoneLayoutCache, key, signature) {
  const cached = zoneLayoutCache?.[key];
  if (!cached || cached.signature !== signature || !(cached.pos instanceof Map) || !cached.pos.size) {
    return null;
  }
  return clonePosMap(cached.pos);
}

function storeCachedZoneLayout(zoneLayoutCache, key, signature, posMap) {
  if (!zoneLayoutCache || !(posMap instanceof Map) || !posMap.size) return;
  zoneLayoutCache[key] = {
    signature,
    pos: clonePosMap(posMap)
  };
}

/**
 * Layout L/M/R OBDD zones with Sugiyama, then write positions to cy.
 */
export function layoutApplyZonesSugiyama(cy, vars, userX = null, opts = {}) {
  if (!cy || !Array.isArray(vars) || !vars.length) return;

  const layerGap = opts.layerGap ?? 120;
  const xGap = opts.xGap ?? 54;
  const termPad = opts.termPad ?? 70;
  const termGap = opts.termGap ?? 160;
  const preserveResultPositions = opts.preserveResultPositions ?? false;
  const preservedResultPositions = opts.preservedResultPositions ?? null;
  const preservedResultCenterX = opts.preservedResultCenterX;
  const pinnedResultPositions = opts.pinnedResultPositions ?? null;
  const pinnedResultCenterX = opts.pinnedResultCenterX;
  const zoneLayoutCache = opts.zoneLayoutCache ?? null;
  const zoneOffsets = opts.zoneOffsets ?? null;

  const zones = { L: new Set(), M: new Set(), R: new Set() };
  cy.nodes().forEach((n) => {
    const z = zoneKeyForNode(n);
    if (z) zones[z].add(n.id());
  });

  const spacing = zoneSpacing(vars.length, xGap);
  const hasPinnedResultLayout = pinnedResultPositions instanceof Map && pinnedResultPositions.size > 0;
  const localByZone = new Map();
  const middlePos = new Map();
  if (zones.M.size) {
    if (hasPinnedResultLayout) {
      for (const [id, p] of pinnedResultPositions) {
        if (zones.M.has(id)) middlePos.set(id, p);
      }
    } else if (preserveResultPositions) {
      for (const [id, p] of readCurrentZonePositions(cy, zones.M)) middlePos.set(id, p);
      if (preserveResultPositions && preservedResultPositions instanceof Map) {
        for (const [id, p] of preservedResultPositions) {
          if (zones.M.has(id)) middlePos.set(id, p);
        }
      }
    }
    if (middlePos.size) localByZone.set("M", middlePos);
    else {
      const signature = zoneLayoutSignature(cy, zones.M, vars, "M", {
        xGap,
        termGap,
        iterations: opts.iterations ?? 24
      });
      const cached = readCachedZoneLayout(zoneLayoutCache, "M", signature);
      if (cached) {
        localByZone.set("M", cached);
      } else {
        const computed = computeDiscreteObddPosMapFromCy(cy, zones.M, vars, userX, {
          xGap,
          layerGap
        });
        localByZone.set("M", computed);
        storeCachedZoneLayout(zoneLayoutCache, "M", signature, computed);
      }
    }
  }

  const sugOpts = { layerGap, xGap, termPad, termGap, iterations: opts.iterations ?? 24 };
  for (const key of ["L", "R"]) {
    const idSet = zones[key];
    if (!idSet.size) continue;
    const signature = zoneLayoutSignature(cy, idSet, vars, key, {
      xGap,
      termGap,
      iterations: sugOpts.iterations
    });
    const cached = readCachedZoneLayout(zoneLayoutCache, key, signature);
    if (cached) {
      localByZone.set(key, cached);
      continue;
    }
    const computed = computeDiscreteObddPosMapFromCy(cy, idSet, vars, userX, {
      xGap,
      layerGap
    });
    localByZone.set(key, computed);
    storeCachedZoneLayout(zoneLayoutCache, key, signature, computed);
  }

  const middleCenter = Number.isFinite(pinnedResultCenterX)
    ? pinnedResultCenterX
    : Number.isFinite(preservedResultCenterX)
    ? preservedResultCenterX
    : (localByZone.get("M")?.size ? bboxCenterX(localByZone.get("M")) : 0);

  const merged = new Map();
  const placedMiddle = localByZone.get("M")
    ? translatePosMap(
        localByZone.get("M"),
        middleCenter -
          (
            hasPinnedResultLayout
              ? bboxCenterX(pinnedResultPositions)
              : bboxCenterX(localByZone.get("M"))
          )
      )
    : new Map();
  for (const [id, p] of placedMiddle) merged.set(id, p);

  const middleBox = bboxOfPosMap(placedMiddle);
  const anchorMiddleBox = hasPinnedResultLayout ? bboxOfPosMap(pinnedResultPositions) : middleBox;
  const reserveHalf = anchorMiddleBox.width > 0 ? anchorMiddleBox.width / 2 : spacing / 2;
  const leftBox = bboxOfPosMap(localByZone.get("L") ?? new Map());
  const rightBox = bboxOfPosMap(localByZone.get("R") ?? new Map());
  const minSideGap = Math.max(140, xGap * 4, Math.round(spacing * 0.18));
  const desiredSpan = desiredApplySpanWidth(cy, vars, layerGap);
  const computedSideGap = desiredSpan == null
    ? minSideGap
    : Math.max(
        minSideGap,
        (desiredSpan - anchorMiddleBox.width - leftBox.width - rightBox.width) / 2
      );

  const leftLocal = localByZone.get("L");
  if (leftLocal?.size) {
    const targetRight = middleCenter - reserveHalf - computedSideGap;
    const dx = targetRight - leftBox.right + Number(zoneOffsets?.L ?? 0);
    for (const [id, p] of translatePosMap(leftLocal, dx)) merged.set(id, p);
  }

  const rightLocal = localByZone.get("R");
  if (rightLocal?.size) {
    const targetLeft = middleCenter + reserveHalf + computedSideGap;
    const dx = targetLeft - rightBox.left + Number(zoneOffsets?.R ?? 0);
    for (const [id, p] of translatePosMap(rightLocal, dx)) merged.set(id, p);
  }

  // Keep user-dragged horizontal positions across apply frame updates,
  // even when M-zone uses pinned final-result coordinates.
  if (userX instanceof Map && userX.size) {
    for (const [id, x] of userX.entries()) {
      const current = merged.get(id);
      if (!current || !Number.isFinite(Number(x))) continue;
      const node = cy.getElementById(id);
      // For L/R auxiliary zones, horizontal drag should be controlled by
      // zoneOffsets so per-node stale userX cannot snap the zone back.
      if (!node.empty() && (node.hasClass("apply-left") || node.hasClass("apply-right"))) continue;
      merged.set(id, { ...current, x: Number(x) });
    }
  }

  cy.batch(() => {
    for (const [id, p] of merged) {
      const n = cy.getElementById(id);
      if (!n.empty()) n.position(p);
    }
  });
}

/**
 * Place apply-pair preview nodes beside their M-zone anchor (after snapNodesToLayers).
 */
export function syncApplyPairNodes(cy, { pairDx = 22 } = {}) {
  if (!cy) return;
  cy.nodes(".apply-pair").forEach((pair) => {
    const id = pair.id();
    const m = /^P-m_(.+)-([LR])$/.exec(id);
    if (!m) return;
    const anchor = cy.getElementById(`M-m_${m[1]}`);
    if (anchor.empty()) return;
    const side = m[2];
    const dx = side === "L" ? -pairDx : pairDx;
    pair.position({ x: anchor.position("x") + dx, y: anchor.position("y") });
  });
}
