function edgeKindOf(edge) {
  const cls = String(edge?.classes ?? "");
  if (cls.includes("zero")) return "0";
  if (cls.includes("one")) return "1";
  const lab = String(edge?.data?.label ?? "");
  if (lab === "0" || lab === "1") return lab;
  return null;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function average(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function isTerminalLabel(label) {
  return label === "0" || label === "1";
}

function layerOfLabel(label, vars) {
  if (isTerminalLabel(label)) return vars.length;
  const idx = vars.indexOf(label);
  return idx >= 0 ? idx : null;
}

function buildGraph(nodes, edges, vars) {
  const nodeById = new Map();
  const out = new Map();
  const inc = new Map();

  for (const nd of nodes) {
    const id = nd?.data?.id;
    if (!id) continue;
    const label = String(nd?.data?.label ?? "");
    const cls = String(nd?.classes ?? "");
    const terminal = cls.includes("terminal") || isTerminalLabel(label);
    const layer = terminal ? vars.length : layerOfLabel(label, vars);
    if (layer == null) continue;
    nodeById.set(id, { id, label, terminal, layer });
    out.set(id, []);
    inc.set(id, []);
  }

  const edgeList = [];
  for (const edge of edges) {
    const source = edge?.data?.source;
    const target = edge?.data?.target;
    if (!nodeById.has(source) || !nodeById.has(target)) continue;
    const kind = edgeKindOf(edge);
    const rec = { source, target, kind };
    edgeList.push(rec);
    out.get(source).push(rec);
    inc.get(target).push(rec);
  }

  const indeg = new Map([...nodeById.keys()].map((id) => [id, 0]));
  edgeList.forEach((e) => indeg.set(e.target, (indeg.get(e.target) || 0) + 1));
  const roots = [...nodeById.keys()].filter((id) => (indeg.get(id) || 0) === 0);

  return { nodeById, edgeList, out, inc, roots };
}

function computeContinuousX(graph, vars, xGap) {
  const { nodeById, out, roots } = graph;
  const pos = new Map();
  const leafCount = Math.pow(2, Math.max(1, vars.length));

  function outChildren(id) {
    let lo = null;
    let hi = null;
    for (const edge of out.get(id) || []) {
      if (edge.kind === "0") lo = edge.target;
      else if (edge.kind === "1") hi = edge.target;
    }
    return { lo, hi };
  }

  function assign(id, l, r) {
    if (pos.has(id)) return;
    pos.set(id, ((l + r) / 2) * xGap);
    if (nodeById.get(id)?.terminal) return;
    const { lo, hi } = outChildren(id);
    const mid = (l + r) / 2;
    if (lo) assign(lo, l, mid);
    if (hi) assign(hi, mid, r);
  }

  if (roots.length) {
    roots.forEach((id) => assign(id, 0, leafCount));
  } else {
    [...nodeById.keys()].forEach((id) => pos.set(id, 0));
  }

  return pos;
}

function computeLeafCoverage(graph, vars) {
  const { nodeById, out } = graph;
  const memo = new Map();

  function visit(id) {
    if (memo.has(id)) return memo.get(id);
    const node = nodeById.get(id);
    if (!node) {
      const fallback = { min: 0, max: 0 };
      memo.set(id, fallback);
      return fallback;
    }
    if (node.terminal) {
      const slot = node.label === "0" ? 0 : 1;
      const cov = { min: slot, max: slot };
      memo.set(id, cov);
      return cov;
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const edge of out.get(id) || []) {
      const child = visit(edge.target);
      min = Math.min(min, child.min);
      max = Math.max(max, child.max);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    }
    const cov = { min, max };
    memo.set(id, cov);
    return cov;
  }

  [...nodeById.keys()].forEach((id) => visit(id));
  return memo;
}

function chooseBaseLayer(layerEntries, terminalLayer) {
  return layerEntries
    .slice()
    .sort((a, b) => {
      if (b.nodes.length !== a.nodes.length) return b.nodes.length - a.nodes.length;
      const aTerminal = a.layer === terminalLayer ? 1 : 0;
      const bTerminal = b.layer === terminalLayer ? 1 : 0;
      if (bTerminal !== aTerminal) return bTerminal - aTerminal;
      return b.layer - a.layer;
    })[0]?.layer ?? terminalLayer;
}

function terminalChannelsFromBaseNodes(baseNodes) {
  if (!baseNodes.length) return { left: 1, right: 1 };
  const channels = baseNodes.map((_, i) => i * 2 + 1);
  if (channels.length === 1) {
    return { left: channels[0], right: channels[0] };
  }

  const leftCount = Math.max(1, Math.floor(channels.length / 2));
  const rightCount = Math.max(1, channels.length - leftCount);
  const left = average(channels.slice(0, leftCount)) ?? channels[0];
  const right = average(channels.slice(channels.length - rightCount)) ?? channels[channels.length - 1];
  return { left, right };
}

function orderLayers(graph, continuousX, coverage) {
  const { nodeById, edgeList } = graph;
  const byLayer = new Map();
  for (const node of nodeById.values()) {
    if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
    byLayer.get(node.layer).push(node.id);
  }

  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  const orderByLayer = new Map();
  for (const layer of layers) {
    const ids = byLayer.get(layer) || [];
    ids.sort((a, b) => {
      const ca = coverage.get(a) ?? { min: 0, max: 0 };
      const cb = coverage.get(b) ?? { min: 0, max: 0 };
      if (ca.min !== cb.min) return ca.min - cb.min;
      if (ca.max !== cb.max) return ca.max - cb.max;
      const xa = continuousX.get(a) ?? 0;
      const xb = continuousX.get(b) ?? 0;
      if (xa !== xb) return xa - xb;
      return a.localeCompare(b);
    });
    orderByLayer.set(layer, ids);
  }

  const preds = new Map([...nodeById.keys()].map((id) => [id, []]));
  const succs = new Map([...nodeById.keys()].map((id) => [id, []]));
  edgeList.forEach((e) => {
    succs.get(e.source)?.push(e.target);
    preds.get(e.target)?.push(e.source);
  });

  function indexMap(ids) {
    const map = new Map();
    ids.forEach((id, i) => map.set(id, i));
    return map;
  }

  function sortByNeighbor(ids, getNeighbors, posMap) {
    return ids
      .slice()
      .sort((a, b) => {
        const na = getNeighbors(a).map((id) => posMap.get(id)).filter((v) => v != null);
        const nb = getNeighbors(b).map((id) => posMap.get(id)).filter((v) => v != null);
        const ba = na.length ? average(na) : null;
        const bb = nb.length ? average(nb) : null;
        if (ba != null && bb != null && ba !== bb) return ba - bb;
        if (ba != null && bb == null) return -1;
        if (ba == null && bb != null) return 1;
        const ca = coverage.get(a) ?? { min: 0, max: 0 };
        const cb = coverage.get(b) ?? { min: 0, max: 0 };
        if (ca.min !== cb.min) return ca.min - cb.min;
        if (ca.max !== cb.max) return ca.max - cb.max;
        return a.localeCompare(b);
      });
  }

  for (let it = 0; it < 6; it++) {
    for (let i = 1; i < layers.length; i++) {
      const prev = indexMap(orderByLayer.get(layers[i - 1]) || []);
      orderByLayer.set(
        layers[i],
        sortByNeighbor(orderByLayer.get(layers[i]) || [], (id) => preds.get(id) || [], prev)
      );
    }
    for (let i = layers.length - 2; i >= 0; i--) {
      const next = indexMap(orderByLayer.get(layers[i + 1]) || []);
      orderByLayer.set(
        layers[i],
        sortByNeighbor(orderByLayer.get(layers[i]) || [], (id) => succs.get(id) || [], next)
      );
    }
  }

  return { layers, orderByLayer };
}

function buildCandidateAssignments(order, channelCount, preferred) {
  const m = order.length;
  const out = [];
  if (!m) return out;
  const choice = [];

  function dfs(idx, start) {
    if (idx === m) {
      let score = 0;
      for (let i = 0; i < m; i++) score += Math.abs(choice[i] - preferred[i]) * 3;
      score -= (choice[m - 1] - choice[0]) * 0.4;
      out.push({ channels: choice.slice(), score });
      return;
    }
    const remain = m - idx - 1;
    for (let c = start; c <= channelCount - 1 - remain; c++) {
      choice[idx] = c;
      dfs(idx + 1, c + 1);
    }
  }

  dfs(0, 0);
  return out;
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
  return overlap > eps ? overlap : 0;
}

function buildChannelPosMap(graph, channels) {
  const pos = new Map();
  for (const [id, ch] of channels) {
    const node = graph.nodeById.get(id);
    if (!node || ch == null) continue;
    pos.set(id, { x: ch, y: node.layer });
  }
  return pos;
}

function buildSegment(edge, pos) {
  const p1 = pos.get(edge.source);
  const p2 = pos.get(edge.target);
  if (!p1 || !p2) return null;
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

function overlapPenalty(edges, pos) {
  let total = 0;
  for (let i = 0; i < edges.length; i++) {
    const s1 = buildSegment(edges[i], pos);
    if (!s1) continue;
    for (let j = i + 1; j < edges.length; j++) {
      const s2 = buildSegment(edges[j], pos);
      if (!s2) continue;
      total += segmentOverlapAmount(s1, s2);
    }
  }
  return total;
}

function shareEndpoint(e1, e2) {
  return (
    e1.source === e2.source ||
    e1.source === e2.target ||
    e1.target === e2.source ||
    e1.target === e2.target
  );
}

function orientation(ax, ay, bx, by, cx, cy) {
  return ((bx - ax) * (cy - ay)) - ((by - ay) * (cx - ax));
}

function properSegmentIntersectionCount(edges, pos) {
  const eps = 1e-6;
  let total = 0;
  for (let i = 0; i < edges.length; i++) {
    const e1 = edges[i];
    const s1 = buildSegment(e1, pos);
    if (!s1) continue;
    for (let j = i + 1; j < edges.length; j++) {
      const e2 = edges[j];
      if (shareEndpoint(e1, e2)) continue;
      const s2 = buildSegment(e2, pos);
      if (!s2) continue;
      if (segmentOverlapAmount(s1, s2) > eps) continue;

      const o1 = orientation(s1.x1, s1.y1, s1.x2, s1.y2, s2.x1, s2.y1);
      const o2 = orientation(s1.x1, s1.y1, s1.x2, s1.y2, s2.x2, s2.y2);
      const o3 = orientation(s2.x1, s2.y1, s2.x2, s2.y2, s1.x1, s1.y1);
      const o4 = orientation(s2.x1, s2.y1, s2.x2, s2.y2, s1.x2, s1.y2);

      if ((o1 * o2) < -eps && (o3 * o4) < -eps) total += 1;
    }
  }
  return total;
}

function terminalAlignmentMetrics(ids, map, coverage, terminalChannels) {
  let misses = 0;
  let distance = 0;
  for (const id of ids) {
    const actual = map.get(id);
    if (actual == null) continue;
    const deltas = [terminalChannels.left, terminalChannels.right]
      .filter((v) => v != null)
      .map((target) => Math.abs(actual - target));
    if (!deltas.length) continue;
    const delta = Math.min(...deltas);
    if (delta > 1e-6) misses += 1;
    distance += delta;
  }
  return { misses, distance };
}

function anglePenaltyForAlignedNodes(graph, channels, ids, terminalChannels, xGap, layerGap) {
  let total = 0;
  const targets = [terminalChannels.left, terminalChannels.right].filter((v) => v != null);
  if (!targets.length) return total;

  for (const id of ids) {
    const node = graph.nodeById.get(id);
    const selfCh = channels.get(id);
    if (!node || selfCh == null) continue;
    if (!targets.some((target) => Math.abs(selfCh - target) <= 1e-6)) continue;

    let low = null;
    let high = null;
    for (const edge of graph.out.get(id) || []) {
      if (edge.kind === "0") low = edge.target;
      else if (edge.kind === "1") high = edge.target;
    }
    if (!low || !high || !channels.has(low) || !channels.has(high)) continue;

    const lowNode = graph.nodeById.get(low);
    const highNode = graph.nodeById.get(high);
    if (!lowNode || !highNode) continue;

    const v1x = (channels.get(low) - selfCh) * xGap;
    const v1y = (lowNode.layer - node.layer) * layerGap;
    const v2x = (channels.get(high) - selfCh) * xGap;
    const v2y = (highNode.layer - node.layer) * layerGap;
    const n1 = Math.hypot(v1x, v1y);
    const n2 = Math.hypot(v2x, v2y);
    if (n1 <= 1e-6 || n2 <= 1e-6) continue;

    const cos = clamp(((v1x * v2x) + (v1y * v2y)) / (n1 * n2), -1, 1);
    const angle = Math.acos(cos);
    total += Math.PI - angle;
  }

  return total;
}

function compareCandidateMetrics(a, b) {
  const keys = [
    "overlap",
    "crossing",
    "terminalMisses",
    "anglePenalty",
    "terminalDistance",
    "branch",
    "preference"
  ];
  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (Math.abs(av - bv) > 1e-6) return av - bv;
  }
  return 0;
}

function crossingPenalty(edges, srcChannels, dstChannels) {
  let total = 0;
  for (let i = 0; i < edges.length; i++) {
    const e1 = edges[i];
    const s1 = srcChannels.get(e1.source);
    const t1 = dstChannels.get(e1.target);
    if (s1 == null || t1 == null) continue;
    for (let j = i + 1; j < edges.length; j++) {
      const e2 = edges[j];
      const s2 = srcChannels.get(e2.source);
      const t2 = dstChannels.get(e2.target);
      if (s2 == null || t2 == null) continue;
      if ((s1 < s2 && t1 > t2) || (s1 > s2 && t1 < t2)) total += 16;
    }
  }
  return total;
}

function branchPenalty(edges, srcChannels, dstChannels) {
  let total = 0;
  for (const edge of edges) {
    const s = srcChannels.get(edge.source);
    const t = dstChannels.get(edge.target);
    if (s == null || t == null) continue;
    if (edge.kind === "0" && t > s) total += (t - s) * 6;
    if (edge.kind === "1" && t < s) total += (s - t) * 6;
  }
  return total;
}

function edgePenaltyTotals(graph, channels, pos) {
  const edges = graph.edgeList.filter((edge) => channels.has(edge.source) && channels.has(edge.target));
  return {
    crossing: properSegmentIntersectionCount(edges, pos),
    branch: branchPenalty(edges, channels, channels)
  };
}

function evaluateChannelMetrics(
  graph,
  channels,
  movableIds,
  coverage,
  terminalChannels,
  preference = 0,
  xGap = 1,
  layerGap = 1
) {
  const pos = buildChannelPosMap(graph, channels);
  const edges = graph.edgeList.filter((edge) => channels.has(edge.source) && channels.has(edge.target));
  const alignment = terminalAlignmentMetrics(movableIds, channels, coverage, terminalChannels);
  const penalties = edgePenaltyTotals(graph, channels, pos);
  return {
    overlap: overlapPenalty(edges, pos),
    crossing: penalties.crossing,
    terminalMisses: alignment.misses,
    anglePenalty: anglePenaltyForAlignedNodes(graph, channels, movableIds, terminalChannels, xGap, layerGap),
    terminalDistance: alignment.distance,
    branch: penalties.branch,
    preference
  };
}

function assignChannels(graph, vars, continuousX, coverage, xGap, layerGap) {
  const { nodeById, edgeList } = graph;
  const { layers, orderByLayer } = orderLayers(graph, continuousX, coverage);
  const layerEntries = layers.map((layer) => ({ layer, nodes: orderByLayer.get(layer) || [] }));
  const baseLayer = chooseBaseLayer(layerEntries, vars.length);
  const baseNodes = orderByLayer.get(baseLayer) || [];
  const k = Math.max(1, baseNodes.length);
  const channelCount = Math.max(3, k * 2 + 1);
  const terminalChannels = terminalChannelsFromBaseNodes(baseNodes);
  const assigned = new Map();

  const baseMin = Math.min(...baseNodes.map((id) => continuousX.get(id) ?? 0));
  const baseMax = Math.max(...baseNodes.map((id) => continuousX.get(id) ?? 0));
  function preferredChannel(id) {
    const x = continuousX.get(id) ?? 0;
    const span = baseMax - baseMin;
    if (!Number.isFinite(span) || span <= 1e-6) return (channelCount - 1) / 2;
    return clamp(((x - baseMin) / span) * (channelCount - 1), 0, channelCount - 1);
  }

  const baseChannelMap = new Map();
  baseNodes.forEach((id, i) => baseChannelMap.set(id, i * 2 + 1));
  assigned.set(baseLayer, baseChannelMap);

  const terminalIds = orderByLayer.get(vars.length) || [];
  if (terminalIds.length) {
    assigned.set(
      vars.length,
      new Map(
        terminalIds.map((id) => {
          const node = nodeById.get(id);
          const channel = node?.label === "0"
            ? terminalChannels.left
            : node?.label === "1"
            ? terminalChannels.right
            : average([terminalChannels.left, terminalChannels.right].filter((v) => v != null)) ?? ((channelCount - 1) / 2);
          return [id, channel];
        })
      )
    );
  }

  function assignedLayerChannelMap() {
    const out = new Map();
    for (const layerMap of assigned.values()) {
      for (const [id, ch] of layerMap) out.set(id, ch);
    }
    return out;
  }

  function preferredChannelsForLayer(ids) {
    return ids.map((id) => {
      const cov = coverage.get(id) ?? { min: 0, max: 1 };
      const covPref = terminalChannels.left + (((cov.min + cov.max) / 2) * (terminalChannels.right - terminalChannels.left));
      const neighborChannels = [];
      for (const edge of edgeList) {
        if (edge.source === id) {
          for (const layerMap of assigned.values()) {
            const ch = layerMap.get(edge.target);
            if (ch != null) neighborChannels.push(ch);
          }
        } else if (edge.target === id) {
          for (const layerMap of assigned.values()) {
            const ch = layerMap.get(edge.source);
            if (ch != null) neighborChannels.push(ch);
          }
        }
      }
      const neighborPref = average(neighborChannels);
      const basePref = preferredChannel(id);
      const terminalPref =
        cov.min === cov.max
          ? (cov.min === 0 ? terminalChannels.left : terminalChannels.right)
          : null;
      return average([basePref, covPref, covPref, neighborPref, terminalPref].filter((v) => v != null)) ?? basePref;
    });
  }

  const unresolvedLayers = layers.filter((layer) => {
    if (assigned.has(layer)) return false;
    return (orderByLayer.get(layer) || []).length > 0;
  });

  const candidatesByLayer = new Map();
  unresolvedLayers.forEach((layer) => {
    const ids = orderByLayer.get(layer) || [];
    const pref = preferredChannelsForLayer(ids);
    const candidates = buildCandidateAssignments(ids, channelCount, pref)
      .sort((a, b) => a.score - b.score);
    candidatesByLayer.set(layer, candidates);
  });

  const searchLayers = unresolvedLayers
    .slice()
    .sort((a, b) => {
      const ca = candidatesByLayer.get(a)?.length ?? 0;
      const cb = candidatesByLayer.get(b)?.length ?? 0;
      if (ca !== cb) return ca - cb;
      return a - b;
    });

  const fixedChannels = assignedLayerChannelMap();
  let bestChannels = new Map(fixedChannels);
  let bestMetrics = null;

  function dfs(idx, currentChannels, movableIds, preference) {
    const lowerBound = evaluateChannelMetrics(
      graph,
      currentChannels,
      movableIds,
      coverage,
      terminalChannels,
      preference,
      xGap,
      layerGap
    );
    if (bestMetrics && compareCandidateMetrics(lowerBound, bestMetrics) > 0) return;

    if (idx >= searchLayers.length) {
      bestChannels = new Map(currentChannels);
      bestMetrics = lowerBound;
      return;
    }

    const layer = searchLayers[idx];
    const ids = orderByLayer.get(layer) || [];
    const candidates = candidatesByLayer.get(layer) || [];

    for (const candidate of candidates) {
      const nextChannels = new Map(currentChannels);
      ids.forEach((id, i) => nextChannels.set(id, candidate.channels[i]));
      dfs(idx + 1, nextChannels, [...movableIds, ...ids], preference + candidate.score);
    }
  }

  dfs(0, fixedChannels, [], 0);

  const assignedByLayer = new Map();
  for (const layer of layers) {
    const ids = orderByLayer.get(layer) || [];
    assignedByLayer.set(
      layer,
      new Map(ids.map((id) => [id, bestChannels.get(id)]).filter(([, ch]) => ch != null))
    );
  }

  return { orderByLayer, assigned: assignedByLayer, channelCount, baseLayer, baseNodes, terminalChannels };
}

function terminalTargetsFromPos(posMap, graph, vars, xGap, channelCount, terminalChannels) {
  const terminalIds = [...graph.nodeById.values()].filter((n) => n.terminal).map((n) => n.id);
  const y = (vars.length + 1);
  if (!terminalIds.length) return;
  if (terminalIds.length === 1) {
    const id = terminalIds[0];
    const center = average([terminalChannels?.left, terminalChannels?.right].filter((v) => v != null))
      ?? ((channelCount - 1) / 2);
    posMap.set(id, { x: center * xGap, y });
    return;
  }
  for (const id of terminalIds) {
    const node = graph.nodeById.get(id);
    const channel = node?.label === "0"
      ? (terminalChannels?.left ?? 0)
      : node?.label === "1"
      ? (terminalChannels?.right ?? (channelCount - 1))
      : ((channelCount - 1) / 2);
    posMap.set(id, { x: channel * xGap, y });
  }
}

export function computeDiscreteObddPosMap(
  elements,
  vars,
  userX = null,
  { xGap = 60, layerGap = 120 } = {}
) {
  const nodes = elements?.nodes ?? [];
  const edges = elements?.edges ?? [];
  if (!Array.isArray(vars) || !vars.length || !nodes.length) return new Map();

  const graph = buildGraph(nodes, edges, vars);
  if (!graph.nodeById.size) return new Map();

  const continuousX = computeContinuousX(graph, vars, xGap);
  const coverage = computeLeafCoverage(graph, vars);
  const { assigned, channelCount, terminalChannels } = assignChannels(graph, vars, continuousX, coverage, xGap, layerGap);
  const pos = new Map();
  const centerOffset = ((channelCount - 1) * xGap) / 2;

  for (const node of graph.nodeById.values()) {
    const channel = assigned.get(node.layer)?.get(node.id);
    const x = (channel ?? (channelCount - 1) / 2) * xGap - centerOffset;
    const y = (node.layer + 1) * layerGap;
    pos.set(node.id, {
      x: userX && userX.has(node.id) ? userX.get(node.id) : x,
      y
    });
  }

  const terminalIds = [...graph.nodeById.values()].filter((n) => n.terminal).map((n) => n.id);
  if (terminalIds.length <= 2) {
    terminalTargetsFromPos(pos, graph, vars, xGap, channelCount, terminalChannels);
    for (const node of graph.nodeById.values()) {
      if (!node.terminal) continue;
      const existing = pos.get(node.id);
      if (!existing) continue;
      pos.set(node.id, {
        x: userX && userX.has(node.id) ? userX.get(node.id) : existing.x - centerOffset,
        y: (vars.length + 1) * layerGap
      });
    }
  } else {
    for (const node of graph.nodeById.values()) {
      if (!node.terminal) continue;
      const existing = pos.get(node.id);
      if (!existing) continue;
      pos.set(node.id, {
        x: userX && userX.has(node.id) ? userX.get(node.id) : existing.x,
        y: (vars.length + 1) * layerGap
      });
    }
  }

  return pos;
}

export function computeDiscreteObddPosMapFromCy(
  cy,
  idSet,
  vars,
  userX = null,
  opts = {}
) {
  const ids = [...idSet].filter((id) => !cy.getElementById(id).empty());
  if (!ids.length) return new Map();

  const nodes = ids.map((id) => {
    const n = cy.getElementById(id);
    return {
      data: { id, label: String(n.data("label") ?? "") },
      classes: n.classes()?.join(" ") ?? ""
    };
  });

  const edges = [];
  cy.edges().forEach((e) => {
    const s = e.source().id();
    const t = e.target().id();
    if (idSet.has(s) && idSet.has(t)) {
      edges.push({
        data: { source: s, target: t, label: String(e.data("label") ?? "") },
        classes: e.classes()?.join(" ") ?? ""
      });
    }
  });

  return computeDiscreteObddPosMap({ nodes, edges }, vars, userX, opts);
}
