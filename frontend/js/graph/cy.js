import { getAxisVars } from "./layerAxis.js";
import { computeDiscreteObddPosMap, computeDiscreteObddPosMapFromCy } from "./discreteObddLayout.js";
import { layoutApplyZonesSugiyama, syncApplyPairNodes } from "./sugiyamaLayout.js";
import { median } from "./math.js";

let graphAnimToken = 0;
export function getGraphAnimToken() { return graphAnimToken; }
export function bumpGraphAnimToken() { graphAnimToken += 1; return graphAnimToken; }

export function createCy(containerEl) {
  return cytoscape({
    container: containerEl,
    elements: [],
    style: [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "text-valign": "center",
          "text-halign": "center",
          width: 50,
          height: 50,
          "border-width": 2,
          "border-color": "#cfd4df",
          "background-color": "#ffffff",
          "font-size": 13
        }
      },
      {
        selector: "node.apply-zone",
        style: {
          width: 50,
          height: 50,
          "font-size": 13
        }
      },
      {
        selector: "node.apply-drag-handle",
        style: {
          label: "",
          shape: "round-rectangle",
          width: "data(w)",
          height: "data(h)",
          "border-width": 0,
          "background-opacity": 0.001,
          "overlay-opacity": 0,
          "text-opacity": 0,
          cursor: "pointer"
        }
      },
      {
        selector: "node.apply-compare-current",
        style: {
          "border-width": 6,
          "border-color": "#2563eb",
          "background-color": "#ffffff"
        }
      },
      {
        selector: "node.apply-compare-left",
        style: {
          "border-width": 6,
          "border-color": "#2563eb",
          "background-color": "#dbeafe"
        }
      },
      {
        selector: "node.apply-compare-right",
        style: {
          "border-width": 6,
          "border-color": "#f97316",
          "background-color": "#ffedd5"
        }
      },
      {
        selector: "node.apply-compare-left-fill",
        style: {
          "background-color": "#dbeafe"
        }
      },
      {
        selector: "node.apply-compare-right-fill",
        style: {
          "background-color": "#ffedd5"
        }
      },
      {
        selector: "node.apply-compare-terminal-fill-0",
        style: {
          "background-color": "#fca5a5"
        }
      },
      {
        selector: "node.apply-compare-terminal-fill-1",
        style: {
          "background-color": "#86efac"
        }
      },
      {
        selector: "node.apply-compare-same",
        style: {
          "border-width": 6,
          "border-color": "#2563eb"
        }
      },
      { selector: "node.focus", style: { "border-width": 6, "border-color": "#2563eb" } },
      { selector: "node.apply-result", style: { "background-color": "#ffffff", color: "#1f2430" } },
      {
        selector: "node.apply-result.apply-compare-terminal-fill-0",
        style: {
          "background-color": "#fca5a5"
        }
      },
      {
        selector: "node.apply-result.apply-compare-terminal-fill-1",
        style: {
          "background-color": "#86efac"
        }
      },
      {
        selector: "node.apply-slot",
        style: {
          "background-color": "#ffffff",
          "border-color": "#cfd4df",
          "border-style": "dashed",
          color: "transparent"
        }
      },
      {
        selector: "node.apply-pending",
        style: {
          "border-style": "dashed"
        }
      },
      {
        selector: "node.apply-ghost",
        style: {
          opacity: 0,
          width: 2,
          height: 2,
          "border-width": 0,
          "background-opacity": 0,
          "text-opacity": 0
        }
      },
      {
        selector: "node.apply-hidden-step",
        style: {
          opacity: 0,
          "text-opacity": 0,
          "background-opacity": 0,
          "border-opacity": 0,
          "border-width": 0,
          width: 2,
          height: 2,
          "overlay-opacity": 0
        }
      },
      { selector: "edge.apply-hidden-step", style: { opacity: 0 } },
      {
        selector: "node.apply-pair",
        style: {
          width: 50,
          height: 50,
          "font-size": 13,
          "font-weight": 700,
          shape: "ellipse",
          "text-valign": "center",
          "text-halign": "center"
        }
      },
      { selector: "node.apply-pair.focus", style: { "border-width": 5 } },
      {
        selector: "node.terminal",
        style: {
          shape: "round-rectangle",
          width: 56,
          height: 40,
          "border-color": "#b6bccb",
          "font-weight": 700
        }
      },
      {
        selector: "node.apply-zone.terminal",
        style: {
          width: 56,
          height: 40,
          "font-size": 13
        }
      },
      {
        selector: "edge",
        style: {
          "curve-style": "bezier",
          "target-arrow-shape": "triangle",
          "arrow-scale": 0.9,
          width: 2.6,
          "line-color": "#cfd4df",
          "target-arrow-color": "#cfd4df",
          label: "data(label)",
          "font-size": 10,
          "text-rotation": "autorotate",
          "text-margin-y": -8
        }
      },
      { selector: "edge.zero", style: { "line-style": "dashed" } },
      { selector: "edge.one", style: { "line-style": "solid" } },
      { selector: "node.term-hi-0", style: { "border-width": 6, "border-color": "#ef4444" } },
      { selector: "node.term-hi-1", style: { "border-width": 6, "border-color": "#22c55e" } },
      {
        selector: "node.apply-compare-current.terminal",
        style: {
          "border-width": 6,
          "border-color": "#2563eb"
        }
      },
      {
        selector: "node.apply-compare-current.term-hi-0",
        style: {
          "border-width": 6,
          "border-color": "#2563eb"
        }
      },
      {
        selector: "node.apply-compare-current.term-hi-1",
        style: {
          "border-width": 6,
          "border-color": "#2563eb"
        }
      },
      {
        selector: "edge.apply-compare-current",
        style: {
          width: 5,
          "line-color": "#f59e0b",
          "target-arrow-color": "#f59e0b"
        }
      },
      {
        selector: "edge.apply-compare-current.zero",
        style: {
          "line-color": "#d32f2f",
          "target-arrow-color": "#d32f2f"
        }
      },
      {
        selector: "edge.apply-compare-current.one",
        style: {
          "line-color": "#388e3c",
          "target-arrow-color": "#388e3c"
        }
      },
      {
        selector: "edge.apply-compare-left",
        style: {
          width: 5,
          "line-color": "#2563eb",
          "target-arrow-color": "#2563eb"
        }
      },
      {
        selector: "edge.apply-compare-left.zero",
        style: {
          "line-color": "#d32f2f",
          "target-arrow-color": "#d32f2f"
        }
      },
      {
        selector: "edge.apply-compare-left.one",
        style: {
          "line-color": "#388e3c",
          "target-arrow-color": "#388e3c"
        }
      },
      {
        selector: "edge.apply-compare-right",
        style: {
          width: 5,
          "line-color": "#f97316",
          "target-arrow-color": "#f97316"
        }
      },
      {
        selector: "edge.apply-compare-right.zero",
        style: {
          "line-color": "#d32f2f",
          "target-arrow-color": "#d32f2f"
        }
      },
      {
        selector: "edge.apply-compare-right.one",
        style: {
          "line-color": "#388e3c",
          "target-arrow-color": "#388e3c"
        }
      },
      {
        selector: "edge.apply-compare-same",
        style: {
          width: 5,
          "line-color": "#2563eb",
          "target-arrow-color": "#2563eb"
        }
      },
      {
        selector: "edge.apply-compare-same.zero",
        style: {
          "line-color": "#d32f2f",
          "target-arrow-color": "#d32f2f"
        }
      },
      {
        selector: "edge.apply-compare-same.one",
        style: {
          "line-color": "#388e3c",
          "target-arrow-color": "#388e3c"
        }
      },
      {
        selector: "node.apply-compare-middle-trail",
        style: {
          "border-width": 4,
          "border-color": "#2563eb"
        }
      },
      {
        selector: "node.apply-compare-aux-keep",
        style: {
          "border-width": 4,
          "border-color": "#111827"
        }
      },
      {
        selector: "edge.apply-compare-middle-trail",
        style: {
          width: 4,
          "line-color": "#475569",
          "target-arrow-color": "#475569"
        }
      },
      {
        selector: "edge.apply-compare-middle-trail.zero",
        style: {
          "line-color": "#d32f2f",
          "target-arrow-color": "#d32f2f"
        }
      },
      {
        selector: "edge.apply-compare-middle-trail.one",
        style: {
          "line-color": "#388e3c",
          "target-arrow-color": "#388e3c"
        }
      },
      {
        selector: "edge.apply-compare-aux-keep",
        style: {
          width: 4,
          "line-color": "#475569",
          "target-arrow-color": "#475569"
        }
      },
      {
        selector: "edge.apply-compare-aux-keep.zero",
        style: {
          "line-color": "#d32f2f",
          "target-arrow-color": "#d32f2f"
        }
      },
      {
        selector: "edge.apply-compare-aux-keep.one",
        style: {
          "line-color": "#388e3c",
          "target-arrow-color": "#388e3c"
        }
      },
      { selector: "node.restrict-s1-target", style: { "border-width": 6, "border-color": "#2563eb" } },
      { selector: "node.restrict-s1-child", style: { "border-width": 6, "border-color": "#2563eb" } },
      {
        selector: "edge.restrict-s1-branch.zero",
        style: {
          width: 6,
          "line-color": "#d32f2f",
          "target-arrow-color": "#d32f2f"
        }
      },
      {
        selector: "edge.restrict-s1-branch.one",
        style: {
          width: 6,
          "line-color": "#388e3c",
          "target-arrow-color": "#388e3c"
        }
      },
      {
        selector: "edge.restrict-s1-incoming",
        style: {
          width: 6,
          "line-color": "#2563eb",
          "target-arrow-color": "#2563eb"
        }
      },
      { selector: "edge.focus", style: { width: 6, "line-color": "#2563eb", "target-arrow-color": "#2563eb" } },
      { selector: "edge.fadeout", style: { opacity: 0 } },
      { selector: ".fadeout", style: { opacity: 0 } },
      { selector: "node.mg0", style: { "border-width": 6, "border-color": "#2563eb" } },
      { selector: "edge.mg0", style: { width: 5, "line-color": "#2563eb", "target-arrow-color": "#2563eb" } },

      { selector: "node.mg1", style: { "border-width": 6, "border-color": "#f59e0b" } },
      { selector: "edge.mg1", style: { width: 5, "line-color": "#f59e0b", "target-arrow-color": "#f59e0b" } },

      { selector: "node.mg2", style: { "border-width": 6, "border-color": "#10b981" } },
      { selector: "edge.mg2", style: { width: 5, "line-color": "#10b981", "target-arrow-color": "#10b981" } },

      { selector: "node.mg3", style: { "border-width": 6, "border-color": "#ef4444" } },
      { selector: "edge.mg3", style: { width: 5, "line-color": "#ef4444", "target-arrow-color": "#ef4444" } },
      { selector: ".merge-hi-1", style: { "border-width": 6, "border-color": "#f97316", "line-color": "#f97316", "target-arrow-color": "#f97316" } },
      { selector: ".merge-hi-2", style: { "border-width": 6, "border-color": "#a855f7", "line-color": "#a855f7", "target-arrow-color": "#a855f7" } },
      { selector: ".merge-hi-3", style: { "border-width": 6, "border-color": "#06b6d4", "line-color": "#06b6d4", "target-arrow-color": "#06b6d4" } },
      { selector: ".merge-hi-4", style: { "border-width": 6, "border-color": "#84cc16", "line-color": "#84cc16", "target-arrow-color": "#84cc16" } },
      { selector: ".merge-hi-5", style: { "border-width": 6, "border-color": "#ef4444", "line-color": "#ef4444", "target-arrow-color": "#ef4444" } },
      { selector: ".merge-hi-6", style: { "border-width": 6, "border-color": "#3b82f6", "line-color": "#3b82f6", "target-arrow-color": "#3b82f6" } },
    ]
  });
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function cancelAllGraphAnims(cy) {
  bumpGraphAnimToken();
  cy.stop(true);
  cy.elements().stop(true);
}

export function clearGraph(cy) {
  bumpGraphAnimToken();
  cy.stop(true);
  cy.elements().stop(true);
  cy.elements().remove();
  cy.removeScratch("_dragLayerLocks");
}

function usesPresetApplyLayout(elements) {
  const nodes = elements?.nodes ?? [];
  return nodes.some((nd) => String(nd?.classes ?? "").includes("apply-zone"));
}

function isTerminalNodeLike(node) {
  const lab = String(node?.data?.("label") ?? node?.data?.label ?? "");
  return node?.hasClass?.("terminal") || lab === "0" || lab === "1";
}

function isVisibleTerminalNodeLike(node) {
  if (!node || node.empty?.()) return false;
  return isTerminalNodeLike(node) &&
    !node.hasClass("apply-slot") &&
    !node.hasClass("apply-ghost") &&
    !node.hasClass("apply-hidden-step") &&
    !node.hasClass("apply-drag-handle");
}

function isLayerSampleNode(node) {
  if (!node || node.empty?.()) return false;
  return !isTerminalNodeLike(node) &&
    !node.hasClass("apply-pair") &&
    !node.hasClass("apply-slot") &&
    !node.hasClass("apply-ghost") &&
    !node.hasClass("apply-hidden-step");
}

function currentLayerY(cy, vars, varName) {
  const ys = cy
    .nodes()
    .filter((n) => isLayerSampleNode(n) && n.data("label") === varName)
    .map((n) => n.position("y"));
  return median(ys);
}

function currentTerminalY(cy) {
  const ys = cy
    .nodes()
    .filter((n) => isVisibleTerminalNodeLike(n))
    .map((n) => n.position("y"));
  return median(ys);
}

function setDragLayerLocks(cy, vars, fallbackLayerGap = 120) {
  const layerYByLabel = new Map();
  if (Array.isArray(vars)) {
    vars.forEach((v, idx) => {
      layerYByLabel.set(v, currentLayerY(cy, vars, v) ?? ((idx + 1) * fallbackLayerGap));
    });
  }

  cy.scratch("_dragLayerLocks", {
    layerYByLabel,
    terminalY: currentTerminalY(cy) ?? (((vars?.length ?? 0) + 1) * fallbackLayerGap)
  });
}

function getDragLayerLocks(cy) {
  return cy.scratch("_dragLayerLocks") ?? null;
}

function currentRenderedTerminalY(cy) {
  const ys = cy
    .nodes()
    .filter((n) => isVisibleTerminalNodeLike(n))
    .map((n) => n.renderedPosition("y"));
  return median(ys);
}

function currentRenderedVarY(cy, varName) {
  const ys = cy
    .nodes()
    .filter((n) => isLayerSampleNode(n) && n.data("label") === varName)
    .map((n) => n.renderedPosition("y"));
  return median(ys);
}

function readApplyResultPositions(cy) {
  const out = new Map();
  cy.nodes(".apply-result").forEach((n) => {
    out.set(n.id(), { x: n.position("x"), y: n.position("y") });
  });
  return out;
}

function applyResultCenterX(cy) {
  const xs = cy.nodes(".apply-result").map((n) => n.position("x"));
  if (!xs.length) return null;
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

export function syncApplyAuxDragHandles(cy) {
  if (!cy) return;
  const zones = [
    { zoneClass: "apply-left", zoneKey: "L", handleId: "UI-apply-drag-L" },
    { zoneClass: "apply-right", zoneKey: "R", handleId: "UI-apply-drag-R" }
  ];

  for (const { zoneClass, zoneKey, handleId } of zones) {
    const zoneNodes = cy
      .nodes(`.${zoneClass}`)
      .filter((n) => !n.hasClass("apply-hidden-step") && !n.hasClass("apply-ghost") && !n.hasClass("apply-drag-handle"));
    zoneNodes.ungrabify();
    const handle = cy.getElementById(handleId);
    if (!zoneNodes.length) {
      if (handle && !handle.empty?.()) cy.remove(handle);
      continue;
    }

    const bb = zoneNodes.boundingBox({ includeLabels: false, includeOverlays: false });
    const w = Math.max(130, Math.min(260, Math.round(Math.max(140, bb.w * 0.62))));
    const h = Math.max(120, Math.min(220, Math.round(Math.max(128, bb.h * 0.52))));
    const data = {
      id: handleId,
      label: "",
      zone: zoneKey,
      w,
      h
    };
    const pos = {
      x: (bb.x1 + bb.x2) / 2,
      y: (bb.y1 + bb.y2) / 2
    };

    if (!handle || handle.empty?.()) {
      cy.add({
        group: "nodes",
        data,
        position: pos,
        classes: `apply-drag-handle ${zoneClass}`
      });
      cy.getElementById(handleId)?.grabify?.();
      continue;
    }

    handle.data(data);
    handle.position(pos);
    handle.grabify?.();
  }
}

function isApplyAuxHandleSyncNode(node) {
  if (!node || node.empty?.() || !node.isNode?.()) return false;
  return (
    node.hasClass("apply-left") ||
    node.hasClass("apply-right") ||
    node.hasClass("apply-zone") ||
    node.hasClass("apply-hidden-step") ||
    node.hasClass("apply-ghost") ||
    node.hasClass("apply-drag-handle")
  );
}

function installApplyAuxHandleAutoSync(cy) {
  if (!cy || cy.scratch("_applyAuxHandleAutoSyncInstalled")) return;
  cy.scratch("_applyAuxHandleAutoSyncInstalled", true);

  let rafPending = false;
  let syncing = false;
  const raf =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 16);

  const schedule = () => {
    if (rafPending) return;
    rafPending = true;
    raf(() => {
      rafPending = false;
      if (syncing) return;
      syncing = true;
      try {
        syncApplyAuxDragHandles(cy);
      } finally {
        syncing = false;
      }
    });
  };

  cy.on("add remove position data class", "node", (evt) => {
    const node = evt?.target;
    if (!isApplyAuxHandleSyncNode(node)) return;
    schedule();
  });

  cy.on("layoutstop", () => schedule());

  schedule();
}

function runPresetLayout(cy, { fit, padding, vp, vars, onDone }) {
  const layout = cy.layout({ name: "preset", animate: false, fit, padding });
  layout.one("layoutstop", () => {
    if (vp) cy.viewport(vp);
    onDone?.();
  });
  layout.run();
}

export async function finalizeGraphLayout(
  cy,
  vars,
  { fit = true, padding = 30, keepViewport = true, onAfterLayout } = {}
) {
  const vp = keepViewport && !fit ? cy.viewport() : null;
  await new Promise((resolve) => {
    runPresetLayout(cy, {
      fit,
      padding,
      vp,
      vars,
      onDone: () => {
        setDragLayerLocks(cy, vars);
        onAfterLayout?.();
        resolve();
      }
    });
  });
}

export async function computeSnapshotPositionMap(
  liveCy,
  elements,
  vars,
  userX = null,
  {
    preserveApplyResultPositions = false,
    pinnedApplyResultPositions = null,
    pinnedApplyResultCenterX = null,
    zoneLayoutCache = null,
    applyAuxZoneOffsets = null,
    bddLayoutKind = "tree"
  } = {}
) {
  if (!elements?.nodes?.length || !Array.isArray(vars) || !vars.length || typeof document === "undefined") {
    return new Map();
  }

  const liveContainer = liveCy?.container?.();
  const width = Math.max(1, liveContainer?.clientWidth ?? 800);
  const height = Math.max(1, liveContainer?.clientHeight ?? 600);

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "-10000px";
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.pointerEvents = "none";
  host.style.opacity = "0";
  document.body.appendChild(host);

  const cy2 = createCy(host);

  try {
    const preservedResultPositions = preserveApplyResultPositions ? readApplyResultPositions(cy2) : null;
    const preservedResultCenterX = preserveApplyResultPositions ? applyResultCenterX(cy2) : null;

    cy2.add(elements);

    if (usesPresetApplyLayout(elements)) {
      layoutApplyZonesSugiyama(cy2, vars, userX, {
        preserveResultPositions: preserveApplyResultPositions,
        preservedResultPositions,
        preservedResultCenterX,
        pinnedResultPositions: pinnedApplyResultPositions,
        pinnedResultCenterX: pinnedApplyResultCenterX,
        zoneLayoutCache,
        zoneOffsets: applyAuxZoneOffsets
      });
      snapNodesToLayers(cy2, vars);
      syncApplyPairNodes(cy2);
    } else {
      if (bddLayoutKind === "aux_sugiyama") layoutBddAuxSugiyama(cy2, vars, userX, { elements });
      else layoutBddDeterministic(cy2, vars, userX);
      snapNodesToLayers(cy2, vars);
    }

    await finalizeGraphLayout(cy2, vars, {
      fit: false,
      keepViewport: false
    });

    const out = new Map();
    cy2.nodes().forEach((n) => {
      out.set(n.id(), { x: n.position("x"), y: n.position("y") });
    });
    return out;
  } finally {
    cy2.destroy();
    host.remove();
  }
}

export function enableHorizontalDragOnly(cy, { layerGap = 120 } = {}) {
  installApplyAuxHandleAutoSync(cy);

  function isTerminal(n) {
    const lab = String(n.data("label") ?? "");
    return n.hasClass("terminal") || lab === "0" || lab === "1";
  }
  function applyAuxZoneKey(n) {
    if (!n || n.empty?.()) return null;
    if (n.hasClass("apply-drag-handle")) {
      return n.data("zone") === "L"
        ? "apply-left"
        : n.data("zone") === "R"
          ? "apply-right"
          : null;
    }
    if (n.hasClass("apply-left")) return "apply-left";
    if (n.hasClass("apply-right")) return "apply-right";
    return null;
  }
  function pairGroupForNode(n) {
    const m = /^P-m_(.+)-([LR])$/.exec(String(n?.id?.() ?? ""));
    if (!m) return null;
    const anchorId = `M-m_${m[1]}`;
    const anchor = cy.getElementById(anchorId);
    if (!anchor || anchor.empty?.()) return null;
    const left = cy.getElementById(`P-m_${m[1]}-L`);
    const right = cy.getElementById(`P-m_${m[1]}-R`);
    return {
      side: m[2],
      anchor,
      left: left && !left.empty?.() ? left : null,
      right: right && !right.empty?.() ? right : null
    };
  }
  function yForNode(n) {
    if (n.hasClass("apply-pair")) {
      const pair = pairGroupForNode(n);
      if (pair?.anchor) return pair.anchor.position("y");
    }
    const lab = String(n.data("label") ?? "");
    const vars = getAxisVars();
    const idx = vars.indexOf(lab);
    const locks = getDragLayerLocks(cy);
    if (idx >= 0) return locks?.layerYByLabel?.get(lab) ?? ((idx + 1) * layerGap);
    if (isTerminal(n)) return locks?.terminalY ?? ((vars.length + 1) * layerGap);
    return n.position("y");
  }

  cy.on("grab", "node", (evt) => {
    const n = evt.target;
    const zoneKey = applyAuxZoneKey(n);
    if (zoneKey) {
      const zoneNodes = cy.nodes(`.${zoneKey}`);
      const basePositions = {};
      zoneNodes.forEach((node) => {
        const pos = node.position();
        basePositions[node.id()] = { x: pos.x, y: pos.y };
      });
      n.scratch("_applyZoneDrag", {
        zoneKey,
        dragStartX: n.position("x"),
        dragStartY: n.position("y"),
        nodeIds: zoneNodes.map((node) => node.id()),
        basePositions
      });
    }
    if (!n.hasClass("apply-pair")) return;
    const pair = pairGroupForNode(n);
    if (!pair?.anchor) return;
    n.scratch("_applyPairDrag", {
      side: pair.side,
      anchorId: pair.anchor.id(),
      leftId: pair.left?.id?.() ?? null,
      rightId: pair.right?.id?.() ?? null,
      leftDx: pair.left ? pair.left.position("x") - pair.anchor.position("x") : -22,
      rightDx: pair.right ? pair.right.position("x") - pair.anchor.position("x") : 22
    });
  });

  cy.on("drag", "node", (evt) => {
    const n = evt.target;
    const zoneMeta = n.scratch("_applyZoneDrag");
    if (zoneMeta?.zoneKey) {
      const dx = n.position("x") - zoneMeta.dragStartX;
      cy.batch(() => {
        n.position({ x: zoneMeta.dragStartX + dx, y: zoneMeta.dragStartY });
        for (const nodeId of zoneMeta.nodeIds ?? []) {
          const node = cy.getElementById(nodeId);
          const base = zoneMeta.basePositions?.[nodeId];
          if (!node || node.empty?.() || !base) continue;
          node.position({ x: base.x + dx, y: base.y });
        }
      });
      return;
    }
    if (n.hasClass("apply-pair")) {
      const meta = n.scratch("_applyPairDrag");
      const pair = pairGroupForNode(n);
      const anchor = pair?.anchor;
      if (meta && anchor && !anchor.empty?.()) {
        const anchorY = anchor.position("y");
        const left = meta.leftId ? cy.getElementById(meta.leftId) : pair?.left;
        const right = meta.rightId ? cy.getElementById(meta.rightId) : pair?.right;
        const draggedDx = meta.side === "L" ? meta.leftDx : meta.rightDx;
        const anchorX = n.position("x") - draggedDx;
        cy.batch(() => {
          anchor.position({ x: anchorX, y: anchorY });
          if (left && !left.empty?.()) left.position({ x: anchorX + meta.leftDx, y: anchorY });
          if (right && !right.empty?.()) right.position({ x: anchorX + meta.rightDx, y: anchorY });
        });
        return;
      }
    }
    n.position({ x: n.position("x"), y: yForNode(n) });
  });

  cy.on("free", "node", (evt) => {
    evt.target.removeScratch("_applyZoneDrag");
    evt.target.removeScratch("_applyPairDrag");
  });
}

export function disableUserZoom(cy) {
  if (typeof cy.userZoomingEnabled === "function") cy.userZoomingEnabled(false);
  if (typeof cy.boxZoomEnabled === "function") cy.boxZoomEnabled(false);
  if (typeof cy.userPanningEnabled === "function") cy.userPanningEnabled(false);

  const container = cy.container();
  if (!container) return;

  container.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );

  container.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
  container.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
  container.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });
}

export function smoothFit(
  cy,
  eles = undefined,
  { padding = 30, duration = 260, easing = "ease-in-out" } = {}
) {
  if (!cy || !cy.nodes().length) return Promise.resolve();

  cy.stop(true);

  return new Promise((resolve) => {
    cy.animate(
      { fit: { eles, padding } },
      {
        duration,
        easing,
        complete: () => resolve()
      }
    );
  });
}

export function autoFitOnResize(cy, axisSync, { padding = 30, debounceMs = 60 } = {}) {
  let t = null;

  function run() {
    t = null;
    cy.resize();
    if (cy.nodes().length) {
      void smoothFit(cy, undefined, { padding, duration: 240 }).then(() => axisSync?.());
      return;
    }

    axisSync?.();
  }

  function schedule() {
    if (t) clearTimeout(t);
    t = setTimeout(run, debounceMs);
  }
  schedule();
  window.addEventListener("resize", schedule);
  return () => window.removeEventListener("resize", schedule);
}

export function snapNodesToLayers(cy, vars, { layerGap = 120 } = {}) {
  if (!Array.isArray(vars) || !vars.length) return;

  const yOf = new Map();
  vars.forEach((v, i) => yOf.set(v, (i + 1) * layerGap));
  const terminalY = (vars.length + 1) * layerGap;

  cy.batch(() => {
    cy.nodes().forEach((n) => {
      if (n.hasClass("apply-pair")) return;

      const lab = String(n.data("label") ?? "");
      const isTerm = n.hasClass("terminal") || lab === "0" || lab === "1";

      if (isTerm) {
        n.position({ x: n.position("x"), y: terminalY });
        return;
      }

      const y = yOf.get(lab);
      if (y != null) n.position({ x: n.position("x"), y });
    });
  });
}

export function computeDeterministicPosMap(
  elements,
  vars,
  userX = null,
  { xGap = 60, layerGap = 120, termPad = 70, termGap = 160 } = {}
) {
  const nodes = elements?.nodes ?? [];
  const edges = elements?.edges ?? [];
  const n = vars?.length ?? 0;
  if (!n || !nodes.length) return new Map();

  const nodeById = new Map(nodes.map((nd) => [nd.data.id, nd]));
  const out = new Map();
  nodes.forEach((nd) => out.set(nd.data.id, []));
  edges.forEach((e) => {
    const src = e.data.source;
    const tgt = e.data.target;
    if (!out.has(src)) out.set(src, []);
    out.get(src).push({ edge: e, childId: tgt });
  });

  function edgeKind(e) {
    const cls = String(e.classes ?? "");
    if (cls.includes("zero")) return "0";
    if (cls.includes("one")) return "1";
    const lab = String(e.data.label ?? "");
    if (lab === "0" || lab === "1") return lab;
    return null;
  }

  function outChildren(id) {
    let lo = null, hi = null;
    const arr = out.get(id) || [];
    for (const { edge, childId } of arr) {
      const k = edgeKind(edge);
      if (k === "0") lo = childId;
      else if (k === "1") hi = childId;
    }
    return { lo, hi };
  }

  function isTerminalNode(id) {
    const nd = nodeById.get(id);
    if (!nd) return false;
    const lab = String(nd.data.label ?? "");
    const cls = String(nd.classes ?? "");
    return cls.includes("terminal") || lab === "0" || lab === "1";
  }

  function varIndexOf(id) {
    const nd = nodeById.get(id);
    if (!nd) return -1;
    const lab = String(nd.data.label ?? "");
    return vars.indexOf(lab);
  }

  const indeg = new Map(nodes.map((nd) => [nd.data.id, 0]));
  edges.forEach((e) => {
    const t = e.data.target;
    indeg.set(t, (indeg.get(t) || 0) + 1);
  });
  const root = nodes.find((nd) => (indeg.get(nd.data.id) || 0) === 0)?.data?.id;
  if (!root) return new Map();

  const leafCount = Math.pow(2, n);
  const pos = new Map();

  function assign(id, level, l, r) {
    if (pos.has(id)) return;

    const x0 = ((l + r) / 2) * xGap;

    let y;
    if (isTerminalNode(id)) y = (vars.length + 1) * layerGap;
    else {
      const idx = varIndexOf(id);
      const layer = idx >= 0 ? (idx + 1) : (level + 1);
      y = layer * layerGap;
    }

    let x = x0;
    if (userX && userX.has(id)) x = userX.get(id);

    pos.set(id, { x, y });

    if (isTerminalNode(id)) return;

    const { lo, hi } = outChildren(id);
    const mid = (l + r) / 2;
    if (lo) assign(lo, level + 1, l, mid);
    if (hi) assign(hi, level + 1, mid, r);
  }

  assign(root, 0, 0, leafCount);

  const termIds = nodes
    .filter((nd) => {
      const lab = String(nd.data.label ?? "");
      const cls = String(nd.classes ?? "");
      return cls.includes("terminal") || lab === "0" || lab === "1";
    })
    .map((nd) => nd.data.id);

  if (termIds.length <= 2) {
    const xs = [...pos.values()].map((p) => p.x);
    if (xs.length) {
      const x1 = Math.min(...xs), x2 = Math.max(...xs);
      const mid = (x1 + x2) / 2;
      const X0 = Math.min(x1 + termPad, mid - termGap / 2);
      const X1 = Math.max(x2 - termPad, mid + termGap / 2);
      const YT = (vars.length + 1) * layerGap;

      for (const tid of termIds) {
        const nd = nodeById.get(tid);
        const lab = String(nd?.data?.label ?? "");
        if (userX && userX.has(tid)) {
          pos.set(tid, { x: userX.get(tid), y: YT });
        } else if (lab === "0") pos.set(tid, { x: X0, y: YT });
        else if (lab === "1") pos.set(tid, { x: X1, y: YT });
        else {
          const p = pos.get(tid);
          if (p) pos.set(tid, { x: p.x, y: YT });
        }
      }
    }
  }

  return pos;
}

export function terminalTargets(
  cy,
  vars,
  { pad = 70, gap = 160, layerGap = 120 } = {}
) {
  const bb = cy.elements().boundingBox({ includeNodes: true, includeEdges: false });
  const mid = (bb.x1 + bb.x2) / 2;

  const X0 = Math.min(bb.x1 + pad, mid - gap / 2);
  const X1 = Math.max(bb.x2 - pad, mid + gap / 2);
  const YT = currentTerminalY(cy) ?? ((vars.length + 1) * layerGap);

  return { X0, X1, YT };
}

export function alignTerminals(
  cy,
  vars,
  opts = {}
) {
  if (!Array.isArray(vars) || !vars.length) return;

  const { X0, X1, YT } = terminalTargets(cy, vars, opts);

  const terms = cy.nodes().filter((n) => {
    const lab = String(n.data("label") ?? "");
    return n.hasClass("terminal") || lab === "0" || lab === "1";
  });

  const zeros = terms.filter((n) => String(n.data("label")) === "0");
  const ones  = terms.filter((n) => String(n.data("label")) === "1");

  cy.batch(() => {
    zeros.forEach((n) => n.position({ x: X0, y: YT }));
    ones.forEach((n) => n.position({ x: X1, y: YT }));
    terms.forEach((n) => n.position({ x: n.position("x"), y: YT }));
  });

  return { X0, X1, YT };
}

export function layoutBddDeterministic(
  cy,
  vars,
  userX = null,
  {
    xGap = 60,
    layerGap = 120,
    termPad = 70,
    termGap = 160
  } = {}
) {
  const n = vars?.length ?? 0;
  if (!n) return;

  const indeg = new Map();
  cy.nodes().forEach((nd) => indeg.set(nd.id(), 0));
  cy.edges().forEach((e) => {
    const t = e.target().id();
    indeg.set(t, (indeg.get(t) || 0) + 1);
  });
  const roots = cy.nodes().filter((nd) => (indeg.get(nd.id()) || 0) === 0);
  const root = roots[0];
  if (!root || root.empty()) return;

  const leafCount = Math.pow(2, n);
  const pos = new Map();

  function edgeKind(e) {
    if (e.hasClass("zero")) return "0";
    if (e.hasClass("one")) return "1";
    const lab = String(e.data("label") ?? "");
    if (lab === "0" || lab === "1") return lab;
    return null;
  }

  function outChildren(node) {
    let lo = null, hi = null;
    node.outgoers("edge").forEach((e) => {
      const k = edgeKind(e);
      const child = e.target();
      if (!child || child.empty()) return;
      if (k === "0") lo = child;
      else if (k === "1") hi = child;
    });
    return { lo, hi };
  }

  function isTerminalNode(node) {
    const lab = String(node.data("label") ?? "");
    return node.hasClass("terminal") || lab === "0" || lab === "1";
  }

  function varIndexOf(node) {
    const lab = String(node.data("label") ?? "");
    return vars.indexOf(lab);
  }

  function assign(node, level, l, r) {
    const id = node.id();
    const isTerm = isTerminalNode(node);

    const x = ((l + r) / 2) * xGap;

    let y;
    if (isTerm) y = (vars.length + 1) * layerGap;
    else {
      const idx = varIndexOf(node);
      const layer = idx >= 0 ? (idx + 1) : (level + 1);
      y = layer * layerGap;
    }

    if (!pos.has(id)) pos.set(id, { x, y });
    if (isTerm) return;

    const { lo, hi } = outChildren(node);
    const mid = (l + r) / 2;
    if (lo) assign(lo, level + 1, l, mid);
    if (hi) assign(hi, level + 1, mid, r);
  }

  assign(root, 0, 0, leafCount);

  cy.batch(() => {
    cy.nodes().forEach((nd) => {
      const p = pos.get(nd.id());
      if (!p) return;

      let x = p.x;
      const y = p.y;
      if (userX && userX.has(nd.id())) x = userX.get(nd.id());
      nd.position({ x, y });
    });
  });

  const terms = cy.nodes().filter((n) => {
    const lab = String(n.data("label") ?? "");
    return n.hasClass("terminal") || lab === "0" || lab === "1";
  });

  if (terms.length <= 2) {
    const bb = cy.elements().boundingBox({ includeNodes: true, includeEdges: false });
    const mid = (bb.x1 + bb.x2) / 2;
    const X0 = Math.min(bb.x1 + termPad, mid - termGap / 2);
    const X1 = Math.max(bb.x2 - termPad, mid + termGap / 2);
    const YT = (vars.length + 1) * layerGap;

    cy.batch(() => {
      terms.forEach((n) => {
        const id = n.id();
        const lab = String(n.data("label") ?? "");
        if (userX && userX.has(id)) {
          n.position({ x: userX.get(id), y: YT });
          return;
        }
        if (lab === "0") n.position({ x: X0, y: YT });
        else if (lab === "1") n.position({ x: X1, y: YT });
        else n.position({ x: n.position("x"), y: YT });
      });
    });
  }
}

export function layoutBddAuxSugiyama(
  cy,
  vars,
  userX = null,
  opts = {}
) {
  if (!Array.isArray(vars) || !vars.length) return;

  const sourceElements = opts.elements ?? null;
  const pos = sourceElements?.nodes?.length
    ? computeDiscreteObddPosMap(sourceElements, vars, userX, opts)
    : computeDiscreteObddPosMapFromCy(cy, new Set(cy.nodes().map((nd) => nd.id())), vars, userX, opts);
  if (!pos?.size) return;

  cy.batch(() => {
    cy.nodes().forEach((nd) => {
      const p = pos.get(nd.id());
      if (p) nd.position(p);
    });
  });
}

export async function setGraphInstant(
  cy,
  elements,
  vars,
  userX,
  {
    keepViewport = true,
    fit = true,
    padding = 30,
    onAfterLayout,
    skipAutoLayout = false,
    preserveApplyResultPositions = false,
    pinnedApplyResultPositions = null,
    pinnedApplyResultCenterX = null,
    zoneLayoutCache = null,
    applyAuxZoneOffsets = null,
    bddLayoutKind = "tree"
  } = {}
) {
  // Begin a new render transaction and cancel any in-flight graph animations.
  bumpGraphAnimToken();
  cy.stop(true);
  cy.elements().stop(true);

  // Optionally preserve the current viewport (pan/zoom) across snapshot updates.
  const vp = keepViewport && !fit ? cy.viewport() : null;
  const preservedResultPositions = preserveApplyResultPositions ? readApplyResultPositions(cy) : null;
  const preservedResultCenterX = preserveApplyResultPositions ? applyResultCenterX(cy) : null;

  // Full snapshot replacement:
  // remove previous elements, then mount the new backend snapshot.
  cy.elements().remove();
  cy.add(elements);

  // Deterministic positioning pass.
  // Apply snapshots: Sugiyama-style layout per zone (L/M/R), then shared layer Y.
  // Other BDD: recursive interval layout + layer snap.
  if (!skipAutoLayout && Array.isArray(vars) && vars.length) {
    if (usesPresetApplyLayout(elements)) {
      layoutApplyZonesSugiyama(cy, vars, userX, {
        preserveResultPositions: preserveApplyResultPositions,
        preservedResultPositions,
        preservedResultCenterX,
        pinnedResultPositions: pinnedApplyResultPositions,
        pinnedResultCenterX: pinnedApplyResultCenterX,
        zoneLayoutCache,
        zoneOffsets: applyAuxZoneOffsets
      });
      snapNodesToLayers(cy, vars);
      syncApplyPairNodes(cy);
    } else {
      if (bddLayoutKind === "aux_sugiyama") layoutBddAuxSugiyama(cy, vars, userX, { elements });
      else layoutBddDeterministic(cy, vars, userX);
      snapNodesToLayers(cy, vars);
    }
  }

  if (skipAutoLayout) {
    if (fit) cy.fit(cy.elements(), padding);
    if (vp) cy.viewport(vp);
    setDragLayerLocks(cy, vars);
    if (usesPresetApplyLayout(elements)) syncApplyAuxDragHandles(cy);
    cy.elements().style("opacity", 1);
    onAfterLayout?.();
    return;
  }

  // Run preset layout lifecycle so Cytoscape finalizes positions.
  // We still use layoutstop as the synchronization point for follow-up hooks.
  await new Promise((resolve) => {
    runPresetLayout(cy, {
      fit,
      padding,
      vp,
      vars,
      onDone: () => {
        // Ensure all elements are visible and notify external sync hooks.
        setDragLayerLocks(cy, vars);
        if (usesPresetApplyLayout(elements)) syncApplyAuxDragHandles(cy);
        cy.elements().style("opacity", 1);
        onAfterLayout?.();
        resolve();
      }
    });
  });
}

export function setGraphAnimated(
  cy,
  elements,
  anim = {},
  hooks = {},
  vars = null,
  userX = null
) {
  const { stepMs = 80, nodeFadeMs = 120, edgeFadeMs = 120 } = anim || {};
  const {
    keepViewport = true,
    fit = true,
    padding = 30,
    onAfterLayout,
    bddLayoutKind = "tree"
  } = hooks || {};

  const token = bumpGraphAnimToken();
  cy.stop(true);
  cy.elements().stop(true);

  const vp = keepViewport && !fit ? cy.viewport() : null;

  cy.elements().remove();
  cy.add(elements);
  cy.elements().style("opacity", 0);

  if (Array.isArray(vars) && vars.length) {
    if (usesPresetApplyLayout(elements)) {
      layoutApplyZonesSugiyama(cy, vars, userX);
      snapNodesToLayers(cy, vars);
      syncApplyPairNodes(cy);
    } else {
      if (bddLayoutKind === "aux_sugiyama") layoutBddAuxSugiyama(cy, vars, userX, { elements });
      else layoutBddDeterministic(cy, vars, userX);
      snapNodesToLayers(cy, vars);
    }
  }

  const layoutDone = new Promise((resolve) => {
    runPresetLayout(cy, {
      fit,
      padding,
      vp,
      vars,
      onDone: () => {
        setDragLayerLocks(cy, vars);
        onAfterLayout?.();
        resolve();
      }
    });
  });

  layoutDone.then(() => {
    setTimeout(async () => {
      if (token !== getGraphAnimToken()) {
        cy.elements().style("opacity", 1);
        return;
      }

      const nodes = cy.nodes();
      const edges = cy.edges();

      const indeg = new Map();
      nodes.forEach((n) => indeg.set(n.id(), 0));
      edges.forEach((e) => {
        const tgt = e.target().id();
        indeg.set(tgt, (indeg.get(tgt) || 0) + 1);
      });

      const roots = nodes.filter((n) => (indeg.get(n.id()) || 0) === 0);
      const root = roots[0];

      const out = new Map();
      nodes.forEach((n) => out.set(n.id(), []));
      edges.forEach((e) => {
        const src = e.source().id();
        const tgt = e.target().id();
        out.get(src).push({ edge: e, childId: tgt });
      });

      function branchOrder(a, b) {
        const la = String(a.edge.data("label") ?? "");
        const lb = String(b.edge.data("label") ?? "");
        if (la === lb) return 0;
        if (la === "0") return -1;
        if (lb === "0") return 1;
        if (la === "1") return -1;
        if (lb === "1") return 1;
        return la.localeCompare(lb);
      }
      out.forEach((arr) => arr.sort(branchOrder));

      const seenNodes = new Set();
      const seenEdges = new Set();
      const actions = [];

      function dfs(nid) {
        if (!seenNodes.has(nid)) {
          seenNodes.add(nid);
          actions.push({ kind: "node", id: nid });
        }
        const nexts = out.get(nid) || [];
        for (const { edge, childId } of nexts) {
          const eid = edge.id();
          if (!seenEdges.has(eid)) {
            seenEdges.add(eid);
            actions.push({ kind: "edge", id: eid });
          }
          if (!seenNodes.has(childId)) dfs(childId);
        }
      }

      if (root && root.length) dfs(root.id());

      // Fallback: some DAG snapshots (notably apply-generated ones) may not
      // yield a single discoverable root for the reveal walk. Ensure every
      // mounted element still becomes visible.
      nodes.forEach((n) => {
        if (!seenNodes.has(n.id())) actions.push({ kind: "node", id: n.id() });
      });
      edges.forEach((e) => {
        if (!seenEdges.has(e.id())) actions.push({ kind: "edge", id: e.id() });
      });

      if (!actions.length) {
        cy.elements().style("opacity", 1);
        return;
      }

      for (const a of actions) {
        if (token !== getGraphAnimToken()) {
          cy.elements().style("opacity", 1);
          return;
        }
        if (vp) cy.viewport(vp);

        const el = cy.getElementById(a.id);
        if (!el || el.empty()) continue;

        if (a.kind === "node") el.animate({ style: { opacity: 1 } }, { duration: nodeFadeMs });
        else el.animate({ style: { opacity: 1 } }, { duration: edgeFadeMs });

        await sleep(stepMs);
      }
    }, 0);
  });

  return layoutDone;
}