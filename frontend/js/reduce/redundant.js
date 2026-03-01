// frontend/js/reduce/redundant.js
import { sleep } from "../graph/cy.js";

const HIGHLIGHT_MS = 420;
const FADE_MS = 420;
const RELINK_PULSE_MS = 240;

// dim all, then undim focus
function dimAllExcept(cy, keep) {
  cy.batch(() => {
    const keepIds = new Set(keep.map((e) => e.id()));
    cy.elements().forEach((el) => {
      if (keepIds.has(el.id())) el.removeClass("dim");
      else el.addClass("dim");
    });
  });
}

// style-pulse for edges (no new stylesheet rules needed)
function pulseEdges(edges, { widthTo = 6, opacityTo = 1, ms = RELINK_PULSE_MS } = {}) {
  edges.forEach((e) => {
    // start a bit emphasized, then back to normal
    e.stop(true);
    e.style({ opacity: opacityTo, width: widthTo });
    e.animate({ style: { width: 2, opacity: 1 } }, { duration: ms });
  });
}

function collectFocusBundle(cy, focusIds) {
  const idSet = new Set(focusIds || []);
  const nodes = cy.nodes().filter((n) => idSet.has(n.id()));

  // “节点 + hi/lo 线 + 上一层指向它的线” = connectedEdges
  const edges = nodes.connectedEdges();

  return { nodes, edges, bundle: nodes.union(edges) };
}

function buildIdSetsFromSnapshot(snap) {
  const n = new Set((snap?.nodes || []).map((x) => x?.data?.id).filter(Boolean));
  const e = new Set((snap?.edges || []).map((x) => x?.data?.id).filter(Boolean));
  return { n, e };
}

function buildIdSetsFromCy(cy) {
  const n = new Set(cy.nodes().map((x) => x.id()));
  const e = new Set(cy.edges().map((x) => x.id()));
  return { n, e };
}

export async function playReduceRedundantTrace(
  cy,
  trace,
  { setGraph, onAfterEach } = {}
) {
  const steps = trace?.steps ?? [];
  if (!steps.length) return;

  // 当前 cy 已经是 trace.initial（runReduceTrace 先画了）
  // 每个 step.snapshot 是“删除本批 redundant 后”的图

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const snap = step?.snapshot;
    if (!snap) continue;

    const focusIds = step?.focus ?? [];

    // ---------- step 1: highlight focus nodes + hi/lo + parent edges ----------
    const { nodes, edges, bundle } = collectFocusBundle(cy, focusIds);

    // 先 dim 其它元素，只突出 focus bundle
    dimAllExcept(cy, bundle);

    // nodes 加粗边框（你已经有 node.focus 的样式）
    cy.batch(() => nodes.addClass("focus"));

    // edges 直接用 animate 强调一下（不用改 stylesheet）
    edges.forEach((e) => {
      e.stop(true);
      e.animate({ style: { width: 6, opacity: 1 } }, { duration: 120 });
    });

    await sleep(HIGHLIGHT_MS);

    // ---------- step 2: fade out focus nodes + focus edges ----------
    // 你说的“消失改用淡出”
    const fadeTargets = nodes.union(edges);
    fadeTargets.forEach((el) => {
      el.stop(true);
      el.animate({ style: { opacity: 0 } }, { duration: FADE_MS });
    });

    await sleep(FADE_MS);

    // ---------- step 3 + 4: relink + final snapshot 覆盖 ----------
    // 你要“先让上一层的线指向下一层，再 final snapshot 覆盖”
    // 在纯前端很难在“不改图结构”的情况下先 relink 再覆盖，
    // 所以这里用：覆盖 snapshot（它本身就是 relink 结果）+ 给新出现/变化的边做一个 pulse，
    // 视觉上等价于“线改向了”。

    const prev = buildIdSetsFromCy(cy);
    const next = buildIdSetsFromSnapshot(snap);

    await setGraph(snap);
    await sleep(0);

    // pulse: 新出现的边/节点（通常就是 relink 后的新边）
    const newEdgeIds = [];
    next.e.forEach((id) => {
      if (!prev.e.has(id)) newEdgeIds.push(id);
    });

    const newNodeIds = [];
    next.n.forEach((id) => {
      if (!prev.n.has(id)) newNodeIds.push(id);
    });

    const newEdges = cy.collection(newEdgeIds.map((id) => cy.getElementById(id))).filter((x) => x && !x.empty());
    const newNodes = cy.collection(newNodeIds.map((id) => cy.getElementById(id))).filter((x) => x && !x.empty());

    // 轻微强调一下“新连上的线”
    pulseEdges(newEdges, { widthTo: 6, opacityTo: 1, ms: RELINK_PULSE_MS });

    // 新节点也可以轻微“亮一下”
    newNodes.forEach((n) => {
      n.stop(true);
      n.style({ opacity: 0.15 });
      n.animate({ style: { opacity: 1 } }, { duration: RELINK_PULSE_MS });
    });

    // 清理 dim / focus（因为 setGraph 之后 class 会被重置，但保险起见）
    cy.batch(() => {
      cy.elements().removeClass("dim");
      cy.nodes().removeClass("focus");
    });

    await onAfterEach?.(step, { stepIndex: i, stepsLen: steps.length });
  }
}