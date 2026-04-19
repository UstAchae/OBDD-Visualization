import {
  applyChildComparePath,
  applyPathBits,
  applyResultNodeIdForPath,
  getApplyCompareParentPath,
  getApplyCompareStepBit,
  hasCompareBranchIds,
  isNonSameLevelCompareBranch,
  isSameLevelCompareBranch,
  isTerminalCompareBranch,
  mapCompareIdsByZone,
  pairNodeIdsForPath,
  uniqueIds
} from "./helpers.js";

export function createApplyHighlightController({
  cy,
  applyCompareDebug = () => {},
  targetNodeIdsForEdges
}) {
  function findLabeledOutgoingEdge(sourceNode, bit) {
    if (!sourceNode || sourceNode.empty?.()) return null;
    let found = null;
    sourceNode.outgoers("edge").forEach((edge) => {
      if (found) return;
      if (!edge || edge.empty?.()) return;
      if (String(edge.data("label") ?? "") !== String(bit)) return;
      const target = edge.target();
      if (!target || target.empty?.()) return;
      found = { edgeId: edge.id(), targetId: target.id() };
    });
    return found;
  }

  function collectZoneTrailFromPath(session, path = "", zone = "") {
    const fullPath = String(path ?? "");
    const parts = fullPath.split(".").filter(Boolean);
    const prefixes = [];
    for (let i = 0; i < parts.length; i += 1) {
      prefixes.push(parts.slice(0, i + 1).join("."));
    }

    const nodeIds = [];
    const edgeIds = [];
    let prevId = null;

    prefixes.forEach((prefix, index) => {
      const branch = session?.branchByPath?.get(prefix) ?? null;
      const zoneId = mapCompareIdsByZone(branch?.compareIds ?? []).get(zone);
      if (!zoneId) return;
      if (!nodeIds.length) {
        nodeIds.push(zoneId);
        prevId = zoneId;
        return;
      }
      if (zoneId === prevId) return;
      const parent = cy.getElementById(prevId);
      const stepBit = parts[index];
      let matched = null;
      if (parent && !parent.empty?.()) {
        parent.outgoers("edge").forEach((edge) => {
          if (matched || !edge || edge.empty?.()) return;
          if (edge.target()?.id?.() !== zoneId) return;
          const label = String(edge.data("label") ?? "");
          if (stepBit && label !== stepBit) return;
          matched = { edgeId: edge.id(), targetId: zoneId };
        });
      }
      if (!matched && parent && !parent.empty?.()) {
        parent.outgoers("edge").forEach((edge) => {
          if (matched || !edge || edge.empty?.()) return;
          if (edge.target()?.id?.() !== zoneId) return;
          matched = { edgeId: edge.id(), targetId: zoneId };
        });
      }
      if (matched?.edgeId) edgeIds.push(matched.edgeId);
      nodeIds.push(zoneId);
      prevId = zoneId;
    });

    return { nodeIds: uniqueIds(nodeIds), edgeIds: uniqueIds(edgeIds) };
  }

  function collectMiddleTrailFromPath(path = "") {
    const rootId = applyResultNodeIdForPath("root");
    const root = cy.getElementById(rootId);
    if (!root || root.empty?.()) return { nodeIds: [], edgeIds: [] };

    const nodeIds = [rootId];
    const edgeIds = [];
    let currentId = rootId;

    for (const bit of applyPathBits(path)) {
      const current = cy.getElementById(currentId);
      if (!current || current.empty?.()) break;
      const step = findLabeledOutgoingEdge(current, bit);
      if (!step) break;
      edgeIds.push(step.edgeId);
      nodeIds.push(step.targetId);
      currentId = step.targetId;
    }

    return { nodeIds: uniqueIds(nodeIds), edgeIds: uniqueIds(edgeIds) };
  }

  function clearApplyPendingCompareHighlight(session) {
    if (!session) return;
    session.pendingCompareHighlightPath = null;
    session.pendingCompareHighlightIds = [];
    session.pendingCompareFocus = null;
  }

  function isApplyTerminalNodeId(id) {
    const node = cy.getElementById(id);
    if (!node || node.empty?.() || node.isEdge?.()) return false;
    const label = String(node.data("label") ?? "");
    return node.hasClass("terminal") || label === "0" || label === "1";
  }

  function buildTerminalPendingCompareFocus(session, revealResult) {
    const parentPath = String(revealResult?.path ?? "");
    const side = String(revealResult?.side ?? "");
    const trailPath = applyChildComparePath(parentPath, side);
    const parentBranch = parentPath ? session?.branchByPath?.get(parentPath) ?? null : null;
    if (!parentBranch || !hasCompareBranchIds(parentBranch)) return null;

    const primaryIds = side === "low"
      ? uniqueIds(parentBranch.lowPrimaryFocusIds ?? [])
      : uniqueIds(parentBranch.highPrimaryFocusIds ?? []);
    const secondaryIds = side === "low"
      ? uniqueIds(parentBranch.lowSecondaryFocusIds ?? [])
      : uniqueIds(parentBranch.highSecondaryFocusIds ?? []);
    const compareNodeIds = uniqueIds([...primaryIds, ...secondaryIds])
      .filter((id) => String(id).startsWith("L-") || String(id).startsWith("R-"))
      .filter(isApplyTerminalNodeId);
    if (!compareNodeIds.length) return null;

    const stepBit = side === "low" ? "0" : side === "high" ? "1" : "";
    const parentByZone = mapCompareIdsByZone(parentBranch.compareIds);
    const compareIdsByZone = new Map([
      ["L", compareNodeIds.filter((id) => String(id).startsWith("L-"))],
      ["R", compareNodeIds.filter((id) => String(id).startsWith("R-"))]
    ]);
    const selectedByZone = new Map();
    const edgeIds = [];
    const leftEdgeIds = [];
    const rightEdgeIds = [];

    ["L", "R"].forEach((zone) => {
      const sourceId = parentByZone.get(zone);
      const targetCandidates = compareIdsByZone.get(zone) ?? [];
      if (!sourceId || !targetCandidates.length || !stepBit) return;
      const source = cy.getElementById(sourceId);
      if (!source || source.empty?.()) return;
      let matchedTargetId = null;
      source.outgoers("edge").forEach((edge) => {
        if (!edge || edge.empty?.()) return;
        if (String(edge.data("label") ?? "") !== stepBit) return;
        const targetId = edge.target()?.id?.();
        if (!targetId || !targetCandidates.includes(targetId)) return;
        matchedTargetId = targetId;
        edgeIds.push(edge.id());
        if (zone === "L") leftEdgeIds.push(edge.id());
        else rightEdgeIds.push(edge.id());
      });
      if (!matchedTargetId && targetCandidates.length === 1) {
        matchedTargetId = targetCandidates[0];
      }
      if (matchedTargetId) selectedByZone.set(zone, matchedTargetId);
    });

    applyCompareDebug("terminal-fallback-build", {
      parentPath,
      side,
      trailPath,
      stepBit,
      primaryIds,
      secondaryIds,
      compareNodeIds,
      parentCompareIds: uniqueIds(parentBranch.compareIds ?? []),
      parentByZone: Object.fromEntries(parentByZone),
      compareIdsByZone: Object.fromEntries(compareIdsByZone),
      selectedByZone: Object.fromEntries(selectedByZone),
      edgeIds,
      leftEdgeIds,
      rightEdgeIds
    });

    if (!selectedByZone.get("L") || !selectedByZone.get("R")) return null;

    const leftNodeIds = [selectedByZone.get("L")];
    const rightNodeIds = [selectedByZone.get("R")];
    const middleId = applyResultNodeIdForPath(trailPath);
    const middleNodeIds = cy.getElementById(middleId)?.empty?.() ? [] : [middleId];
    return {
      mode: "terminal",
      path: trailPath,
      nodeIds: uniqueIds([...leftNodeIds, ...rightNodeIds, ...middleNodeIds]),
      edgeIds: uniqueIds(edgeIds),
      leftNodeIds: uniqueIds(leftNodeIds),
      rightNodeIds: uniqueIds(rightNodeIds),
      leftEdgeIds: uniqueIds(leftEdgeIds),
      rightEdgeIds: uniqueIds(rightEdgeIds),
      leftPairIds: [],
      rightPairIds: [],
      middleTrailNodeIds: uniqueIds(middleNodeIds),
      middleTrailEdgeIds: []
    };
  }

  function setApplyPendingCompareHighlightFromReveal(session, revealResult) {
    if (!session || !revealResult?.path || !revealResult?.side) {
      clearApplyPendingCompareHighlight(session);
      return false;
    }
    const childPath = applyChildComparePath(revealResult.path, revealResult.side);
    const childBranch = childPath ? session.branchByPath?.get(childPath) ?? null : null;
    if (!childPath || !childBranch || !hasCompareBranchIds(childBranch)) {
      const terminalFallback = buildTerminalPendingCompareFocus(session, revealResult);
      if (terminalFallback) {
        const parentBranch = session.branchByPath?.get(revealResult.path) ?? null;
        session.pendingCompareHighlightPath = null;
        session.pendingCompareHighlightIds = [];
        session.pendingCompareFocus = terminalFallback;
        if (hasCompareBranchIds(parentBranch)) {
          session.compareHighlightPath = String(parentBranch.path ?? revealResult.path ?? "");
          session.compareHighlightIds = uniqueIds(parentBranch.compareIds ?? []);
        } else {
          session.compareHighlightPath = String(revealResult.path ?? "");
          session.compareHighlightIds = [];
        }
        applyCompareDebug("pending-terminal-set", {
          parentPath: revealResult.path,
          side: revealResult.side,
          childPath,
          revealResult,
          focus: terminalFallback
        });
        return true;
      }
      clearApplyPendingCompareHighlight(session);
      applyCompareDebug("pending-miss", {
        parentPath: revealResult?.path ?? "",
        side: revealResult?.side ?? "",
        childPath,
        hasChildBranch: Boolean(childBranch),
        childCaseKey: String(childBranch?.caseKey ?? "")
      });
      return false;
    }
    session.pendingCompareHighlightPath = childPath;
    session.pendingCompareHighlightIds = uniqueIds(childBranch.compareIds);
    session.pendingCompareFocus = null;
    applyCompareDebug("pending-set", {
      parentPath: revealResult.path,
      side: revealResult.side,
      childPath,
      childCaseKey: String(childBranch.caseKey ?? ""),
      compareIds: session.pendingCompareHighlightIds
    });
    return true;
  }

  function collectApplyCompareFocus(
    session,
    {
      path = session?.compareHighlightPath ?? "",
      compareIds = session?.compareHighlightIds ?? [],
      source = "current"
    } = {}
  ) {
    path = String(path ?? "");
    const branch = session?.branchByPath?.get(path) ?? null;
    if (
      !isTerminalCompareBranch(branch) &&
      !isSameLevelCompareBranch(branch) &&
      !isNonSameLevelCompareBranch(branch)
    ) {
      applyCompareDebug(`${source}-focus-skip`, {
        path,
        caseKey: String(branch?.caseKey ?? ""),
        compareIds: uniqueIds(compareIds ?? []),
        hasBranch: Boolean(branch)
      });
      return {
        mode: "none",
        nodeIds: [],
        edgeIds: [],
        leftNodeIds: [],
        rightNodeIds: [],
        leftEdgeIds: [],
        rightEdgeIds: [],
        leftPairIds: [],
        rightPairIds: []
      };
    }

    const currentNodeIds = uniqueIds(
      isSameLevelCompareBranch(branch) || isTerminalCompareBranch(branch)
        ? compareIds
        : (branch?.compareIds ?? [])
    );
    if (!currentNodeIds.length) {
      applyCompareDebug(`${source}-focus-empty`, {
        path,
        compareIds: uniqueIds(compareIds ?? []),
        hasBranch: Boolean(branch)
      });
      return {
        mode: "none",
        nodeIds: [],
        edgeIds: [],
        leftNodeIds: [],
        rightNodeIds: [],
        leftEdgeIds: [],
        rightEdgeIds: [],
        leftPairIds: [],
        rightPairIds: []
      };
    }

    const mode = isTerminalCompareBranch(branch)
      ? "terminal"
      : isSameLevelCompareBranch(branch)
        ? "same-level"
        : "non-same-level";

    const nodeIds = [...currentNodeIds];
    const edgeIds = [];
    const leftNodeIds = [];
    const rightNodeIds = [];
    const leftEdgeIds = [];
    const rightEdgeIds = [];
    const { leftId: pairLeftId, rightId: pairRightId } = pairNodeIdsForPath(path);
    const leftPairIds = cy.getElementById(pairLeftId)?.empty?.() ? [] : [pairLeftId];
    const rightPairIds = cy.getElementById(pairRightId)?.empty?.() ? [] : [pairRightId];
    const currentByZone = mapCompareIdsByZone(currentNodeIds);
    if (currentByZone.get("L")) leftNodeIds.push(currentByZone.get("L"));
    if (currentByZone.get("R")) rightNodeIds.push(currentByZone.get("R"));
    const parentPath = getApplyCompareParentPath(path);
    const stepBit = getApplyCompareStepBit(path);
    const middleNodeIds = [];
    const middleEdgeIds = [];
    const currentMiddleId = applyResultNodeIdForPath(path);
    const currentMiddleNode = cy.getElementById(currentMiddleId);
    if (currentMiddleNode && !currentMiddleNode.empty?.()) middleNodeIds.push(currentMiddleId);
    if (parentPath && stepBit) {
      const parentMiddleId = applyResultNodeIdForPath(parentPath);
      const parentMiddleNode = cy.getElementById(parentMiddleId);
      if (parentMiddleNode && !parentMiddleNode.empty?.()) {
        parentMiddleNode.outgoers("edge").forEach((edge) => {
          if (!edge || edge.empty?.()) return;
          if (edge.target()?.id?.() !== currentMiddleId) return;
          if (String(edge.data("label") ?? "") !== stepBit) return;
          middleEdgeIds.push(edge.id());
        });
      }
    }
    nodeIds.push(...middleNodeIds);
    edgeIds.push(...middleEdgeIds);
    if (!parentPath || !stepBit) {
      const result = {
        mode,
        nodeIds: uniqueIds(nodeIds),
        edgeIds: [],
        leftNodeIds: uniqueIds(leftNodeIds),
        rightNodeIds: uniqueIds(rightNodeIds),
        leftEdgeIds: [],
        rightEdgeIds: [],
        leftPairIds: uniqueIds(leftPairIds),
        rightPairIds: uniqueIds(rightPairIds),
        middleTrailNodeIds: uniqueIds(middleNodeIds),
        middleTrailEdgeIds: []
      };
      applyCompareDebug(`${source}-focus-root`, {
        path,
        parentPath,
        stepBit,
        currentNodeIds,
        result
      });
      return result;
    }

    const parentBranch = session?.branchByPath?.get(parentPath) ?? null;
    if (!hasCompareBranchIds(parentBranch)) {
      const result = {
        mode,
        nodeIds: uniqueIds(nodeIds),
        edgeIds: [],
        leftNodeIds: uniqueIds(leftNodeIds),
        rightNodeIds: uniqueIds(rightNodeIds),
        leftEdgeIds: [],
        rightEdgeIds: [],
        leftPairIds: uniqueIds(leftPairIds),
        rightPairIds: uniqueIds(rightPairIds),
        middleTrailNodeIds: uniqueIds(middleNodeIds),
        middleTrailEdgeIds: uniqueIds(middleEdgeIds)
      };
      applyCompareDebug(`${source}-focus-missing-parent-compare`, {
        path,
        parentPath,
        stepBit,
        parentCaseKey: String(parentBranch?.caseKey ?? ""),
        parentCompareIds: uniqueIds(parentBranch?.compareIds ?? []),
        currentNodeIds,
        result
      });
      return result;
    }

    const parentByZone = mapCompareIdsByZone(parentBranch.compareIds);
    const matchedByZone = [];

    ["L", "R"].forEach((zone) => {
      const sourceId = parentByZone.get(zone);
      const targetId = currentByZone.get(zone);
      if (!sourceId || !targetId) return;

      if (sourceId !== targetId) nodeIds.push(sourceId);

      const source = cy.getElementById(sourceId);
      if (!source || source.empty?.()) return;

      source.outgoers("edge").forEach((edge) => {
        if (!edge || edge.empty?.()) return;
        if (edge.target()?.id?.() !== targetId) return;
        if (String(edge.data("label") ?? "") !== stepBit) return;
        edgeIds.push(edge.id());
        if (zone === "L") leftEdgeIds.push(edge.id());
        else rightEdgeIds.push(edge.id());
        matchedByZone.push({
          zone,
          sourceId,
          targetId,
          edgeId: edge.id(),
          label: String(edge.data("label") ?? "")
        });
      });
    });

    const result = {
      mode,
      path,
      nodeIds: uniqueIds(nodeIds),
      edgeIds: uniqueIds(edgeIds),
      leftNodeIds: uniqueIds(leftNodeIds),
      rightNodeIds: uniqueIds(rightNodeIds),
      leftEdgeIds: uniqueIds(leftEdgeIds),
      rightEdgeIds: uniqueIds(rightEdgeIds),
      leftPairIds: uniqueIds(leftPairIds),
      rightPairIds: uniqueIds(rightPairIds),
      middleTrailNodeIds: uniqueIds(middleNodeIds),
      middleTrailEdgeIds: uniqueIds(middleEdgeIds)
    };
    applyCompareDebug(`${source}-focus`, {
      path,
      parentPath,
      stepBit,
      currentNodeIds,
      parentCompareIds: uniqueIds(parentBranch.compareIds ?? []),
      matchedByZone,
      result
    });
    return result;
  }

  function clearApplyCompareHighlight() {
    const trackedClasses = [
      "apply-compare-current",
      "apply-compare-left",
      "apply-compare-right",
      "apply-compare-same",
      "apply-compare-left-fill",
      "apply-compare-right-fill",
      "apply-compare-terminal-fill-0",
      "apply-compare-terminal-fill-1",
      "apply-compare-middle-trail",
      "apply-compare-aux-keep"
    ];
    const beforeCounts = {};
    trackedClasses.forEach((cls) => {
      beforeCounts[cls] = cy.elements(`.${cls}`).length;
    });
    cy.batch(() => {
      cy
        .elements(
          ".apply-compare-current, .apply-compare-left, .apply-compare-right, .apply-compare-same, .apply-compare-left-fill, .apply-compare-right-fill, .apply-compare-terminal-fill-0, .apply-compare-terminal-fill-1, .apply-compare-middle-trail, .apply-compare-aux-keep"
        )
        .removeClass("apply-compare-current apply-compare-left apply-compare-right apply-compare-same apply-compare-left-fill apply-compare-right-fill apply-compare-terminal-fill-0 apply-compare-terminal-fill-1 apply-compare-middle-trail apply-compare-aux-keep");
      cy.elements().forEach((el) => {
        if (!el || el.empty?.()) return;
        el.removeStyle("opacity");
      });
    });
    applyCompareDebug("clear-highlight", beforeCounts);
  }

  function visibleApplyCompareElements() {
    return cy.elements().filter((el) => {
      if (!el || el.empty?.()) return false;
      if (el.isNode?.()) {
        return (
          el.hasClass("apply-zone") &&
          !el.hasClass("apply-hidden-step") &&
          !el.hasClass("apply-ghost") &&
          !el.hasClass("apply-slot") &&
          !el.hasClass("apply-drag-handle")
        );
      }
      return !el.hasClass("apply-hidden-step");
    });
  }

  function syncApplyCompareHighlight(session) {
    clearApplyCompareHighlight();
    if (!session) return;

    const focus = session.pendingCompareFocus
      ? session.pendingCompareFocus
      : session.pendingCompareHighlightPath
        ? collectApplyCompareFocus(session, {
            path: session.pendingCompareHighlightPath,
            compareIds: session.pendingCompareHighlightIds ?? [],
            source: "pending"
          })
        : collectApplyCompareFocus(session, {
            path: session.compareHighlightPath,
            compareIds: session.compareHighlightIds ?? [],
            source: "current"
          });
    const highlightPath = String(focus.path ?? "");
    const isNonSameLevel = focus.mode === "non-same-level";
    const currentAuxNodeIds = uniqueIds([...(focus.leftNodeIds ?? []), ...(focus.rightNodeIds ?? [])]);
    const currentMiddleNodeIds = uniqueIds(focus.middleTrailNodeIds ?? []);
    const currentPairIds = isNonSameLevel
      ? uniqueIds([...(focus.leftPairIds ?? []), ...(focus.rightPairIds ?? [])])
      : [];
    const currentEdgeIds = uniqueIds([
      ...(focus.leftEdgeIds ?? []),
      ...(focus.rightEdgeIds ?? []),
      ...(focus.middleTrailEdgeIds ?? []),
      ...(focus.edgeIds ?? [])
    ]);
    const leftTrail = highlightPath ? collectZoneTrailFromPath(session, highlightPath, "L") : { nodeIds: [], edgeIds: [] };
    const rightTrail = highlightPath ? collectZoneTrailFromPath(session, highlightPath, "R") : { nodeIds: [], edgeIds: [] };
    const middleTrail = highlightPath ? collectMiddleTrailFromPath(highlightPath) : { nodeIds: [], edgeIds: [] };
    const trailNodeIds = uniqueIds([...leftTrail.nodeIds, ...rightTrail.nodeIds, ...middleTrail.nodeIds]);
    const auxTrailEdgeIds = uniqueIds([...leftTrail.edgeIds, ...rightTrail.edgeIds]);
    const middleTrailEdgeIds = uniqueIds(middleTrail.edgeIds);
    const compareTerminalTargetIds = uniqueIds([
      ...targetNodeIdsForEdges(focus.leftEdgeIds ?? []),
      ...targetNodeIdsForEdges(focus.rightEdgeIds ?? [])
    ]).filter((id) => {
      if (!(isNonSameLevel || focus.mode === "terminal")) return false;
      if (!String(id).startsWith("L-") && !String(id).startsWith("R-")) return false;
      return isApplyTerminalNodeId(id);
    });
    const currentAuxCompareNodeIds = uniqueIds([...currentAuxNodeIds, ...compareTerminalTargetIds]);
    const pathOutlineNodeIds = trailNodeIds.filter(
      (id) =>
        !currentAuxCompareNodeIds.includes(id) &&
        !currentMiddleNodeIds.includes(id) &&
        !currentPairIds.includes(id)
    );
    const keepIds = new Set([
      ...currentAuxCompareNodeIds,
      ...currentMiddleNodeIds,
      ...currentPairIds,
      ...pathOutlineNodeIds,
      ...currentEdgeIds,
      ...auxTrailEdgeIds,
      ...middleTrailEdgeIds
    ]);
    if (!keepIds.size) return;

    cy.batch(() => {
      currentAuxCompareNodeIds.forEach((id) => {
        const node = cy.getElementById(id);
        if (node && !node.empty?.()) {
          node.addClass("apply-compare-current");
          if (isNonSameLevel) {
            if (String(id).startsWith("L-")) node.addClass("apply-compare-left-fill");
            if (String(id).startsWith("R-")) node.addClass("apply-compare-right-fill");
          }
          if (focus.mode === "terminal") {
            const label = String(node.data("label") ?? "");
            if (label === "0") node.addClass("apply-compare-terminal-fill-0");
            if (label === "1") node.addClass("apply-compare-terminal-fill-1");
          }
        }
      });
      currentMiddleNodeIds.forEach((id) => {
        const node = cy.getElementById(id);
        if (node && !node.empty?.()) {
          node.addClass("apply-compare-middle-trail");
          if (focus.mode === "terminal") {
            const label = String(node.data("label") ?? "");
            if (label === "0") node.addClass("apply-compare-terminal-fill-0");
            if (label === "1") node.addClass("apply-compare-terminal-fill-1");
          }
        }
      });
      pathOutlineNodeIds.forEach((id) => {
        const node = cy.getElementById(id);
        if (!node || node.empty?.()) return;
        node.addClass("apply-compare-aux-keep");
      });
      if (isNonSameLevel) {
        (focus.leftPairIds ?? []).forEach((id) => {
          const node = cy.getElementById(id);
          if (node && !node.empty?.()) {
            node.addClass("apply-compare-current");
            node.addClass("apply-compare-left-fill");
          }
        });
        (focus.rightPairIds ?? []).forEach((id) => {
          const node = cy.getElementById(id);
          if (node && !node.empty?.()) {
            node.addClass("apply-compare-current");
            node.addClass("apply-compare-right-fill");
          }
        });
      }
      currentEdgeIds.forEach((id) => {
        const edge = cy.getElementById(id);
        if (edge && !edge.empty?.()) edge.addClass("apply-compare-current");
      });
      auxTrailEdgeIds.forEach((id) => {
        const edge = cy.getElementById(id);
        if (!edge || edge.empty?.()) return;
        if (currentEdgeIds.includes(id)) return;
        edge.addClass("apply-compare-aux-keep");
      });
      middleTrailEdgeIds.forEach((id) => {
        const edge = cy.getElementById(id);
        if (!edge || edge.empty?.()) return;
        if (currentEdgeIds.includes(id)) return;
        edge.addClass("apply-compare-middle-trail");
      });
      visibleApplyCompareElements().forEach((el) => {
        if (keepIds.has(el.id())) el.removeStyle("opacity");
      });
    });
  }

  function setApplyCompareHighlightFromBranch(session, branch, { clearWhenInvalid = true } = {}) {
    if (!session) return false;
    if (
      isTerminalCompareBranch(branch) ||
      isSameLevelCompareBranch(branch) ||
      isNonSameLevelCompareBranch(branch)
    ) {
      clearApplyPendingCompareHighlight(session);
      session.compareHighlightPath = String(branch.path ?? session.compareHighlightPath ?? "");
      session.compareHighlightIds = uniqueIds(branch.compareIds);
      return true;
    }
    if (clearWhenInvalid) {
      clearApplyPendingCompareHighlight(session);
      session.compareHighlightPath = String(branch?.path ?? session.compareHighlightPath ?? "");
      session.compareHighlightIds = [];
    }
    return false;
  }

  function ensureApplyCompareHighlight(session) {
    if (!session) {
      clearApplyCompareHighlight();
      return;
    }
    if (session.suspendCompareHighlight) {
      clearApplyCompareHighlight();
      return;
    }
    if (!session.pendingCompareHighlightPath && !(session.compareHighlightIds?.length ?? 0)) {
      const preferredPath = String(session.compareHighlightPath ?? "root");
      const preferredBranch = session.branchByPath?.get(preferredPath) ?? null;
      setApplyCompareHighlightFromBranch(session, preferredBranch, { clearWhenInvalid: false });
    }
    syncApplyCompareHighlight(session);
  }

  return {
    clearApplyPendingCompareHighlight,
    clearApplyCompareHighlight,
    setApplyPendingCompareHighlightFromReveal,
    setApplyCompareHighlightFromBranch,
    syncApplyCompareHighlight,
    ensureApplyCompareHighlight
  };
}
