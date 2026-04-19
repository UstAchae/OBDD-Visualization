import { uniqueIds } from "./helpers.js";

export function createApplyExpandController({
  cy,
  refreshNodeDraggability = () => {},
  applyStageDebug = () => {},
  applyPositionDebug = () => {},
  sampleNodePositions = () => ({}),
  collectApplyPositionSnapshot = () => ({})
}) {
  function setApplyHiddenIds(ids = [], hidden = true) {
    for (const id of uniqueIds(ids)) {
      const ele = cy.getElementById(id);
      if (!ele || ele.empty?.()) continue;
      if (hidden) ele.addClass("apply-hidden-step");
      else ele.removeClass("apply-hidden-step");
    }
    refreshNodeDraggability();
  }

  function clearApplyExpandEdgeStaging(session) {
    if (!session) return;
    session.expandEdgeById = new Map();
    session.expandNodeOriginalPos = new Map();
  }

  function resetApplyExpandEdgeStaging(session) {
    if (!session) return;
    session.expandEdgeById = new Map();
    session.expandRevealByPath = new Map();
    session.expandNodeOriginalPos = new Map();
  }

  function splitRevealIdsByElement(ids = []) {
    const edgeIds = [];
    const nodeIds = [];
    const missingIds = [];
    for (const id of uniqueIds(ids)) {
      const ele = cy.getElementById(id);
      if (ele && !ele.empty?.()) {
        if (ele.isEdge?.()) edgeIds.push(id);
        else nodeIds.push(id);
        continue;
      }
      missingIds.push(id);
      if (String(id).startsWith("e_")) edgeIds.push(id);
      else nodeIds.push(id);
    }
    return {
      edgeIds: uniqueIds(edgeIds),
      nodeIds: uniqueIds(nodeIds),
      missingIds: uniqueIds(missingIds)
    };
  }

  function directEdgeIdsForSide(parentNodeId, sideLabel, preferred = []) {
    const preferredSet = new Set(preferred);
    const candidates = [];
    const fromParent = cy.edges(`.apply-result[source = "${parentNodeId}"]`);
    fromParent.forEach((edge) => {
      const label = String(edge.data("label") ?? "");
      if (label !== sideLabel) return;
      candidates.push(edge.id());
    });
    const allCandidates = uniqueIds(candidates);
    if (!preferredSet.size) return allCandidates;
    const matched = allCandidates.filter((id) => preferredSet.has(id));
    // Fallback: if reveal ids do not contain the direct parent edge, still keep the real clickable edge.
    return matched.length ? matched : allCandidates;
  }

  function targetNodeIdsForEdges(edgeIds = []) {
    const out = [];
    for (const id of uniqueIds(edgeIds)) {
      const edge = cy.getElementById(id);
      if (!edge || edge.empty?.() || !edge.isEdge?.()) continue;
      const target = String(edge.data("target") ?? "");
      if (target) out.push(target);
    }
    return uniqueIds(out);
  }

  function stageDirectEdgeTargetsNearParent(session, parentNodeId, directEdgeIds = []) {
    const parent = cy.getElementById(parentNodeId);
    if (!parent || parent.empty?.()) return [];
    const parentPos = parent.position();
    const stagedTargetIds = [];
    for (const edgeId of uniqueIds(directEdgeIds)) {
      const edge = cy.getElementById(edgeId);
      if (!edge || edge.empty?.() || !edge.isEdge?.()) continue;
      const targetId = String(edge.data("target") ?? "");
      if (!targetId) continue;
      const target = cy.getElementById(targetId);
      if (!target || target.empty?.()) continue;
      const label = String(edge.data("label") ?? "");
      const targetLabel = String(target.data("label") ?? "");
      const targetIsTerminal = target.hasClass("terminal") || targetLabel === "0" || targetLabel === "1";
      const baseDx = targetIsTerminal ? 58 : 42;
      const baseDy = targetIsTerminal ? 52 : 34;
      const dx = label === "0" ? -baseDx : baseDx;
      const dy = baseDy;
      if (!session.expandNodeOriginalPos.has(targetId)) {
        session.expandNodeOriginalPos.set(targetId, { ...target.position() });
      }
      target.position({ x: parentPos.x + dx, y: parentPos.y + dy });
      stagedTargetIds.push(targetId);
    }
    return uniqueIds(stagedTargetIds);
  }

  function restoreStagedNodePositions(session, nodeIds = []) {
    if (!session?.expandNodeOriginalPos) return;
    const before = sampleNodePositions(uniqueIds(nodeIds));
    for (const id of uniqueIds(nodeIds)) {
      const pos = session.expandNodeOriginalPos.get(id);
      if (!pos) continue;
      const node = cy.getElementById(id);
      if (node && !node.empty?.()) node.position(pos);
      session.expandNodeOriginalPos.delete(id);
    }
    const after = sampleNodePositions(uniqueIds(nodeIds));
    applyPositionDebug("restore-staged-node-positions", {
      ids: uniqueIds(nodeIds),
      before,
      after,
      snapshot: collectApplyPositionSnapshot(session)
    });
  }

  function autoExpandApplyPathsForNodeIds(session, nodeIds = []) {
    if (!session) return [];
    const out = [];
    for (const id of uniqueIds(nodeIds)) {
      const path = session.branchMap?.get(id);
      if (!path) continue;
      if (session.expanded?.has(path)) continue;
      const branch = session.branchByPath?.get(path);
      if (!branch || branch.phase !== "expand") continue;
      out.push(path);
    }
    return uniqueIds(out);
  }

  function repositionApplyStagedStubTargetsForNode(session, nodeId) {
    if (!session || !nodeId) return false;
    const directEdgeIds = [];
    for (const [edgeId] of session.expandEdgeById?.entries?.() ?? []) {
      const edge = cy.getElementById(edgeId);
      if (!edge || edge.empty?.() || !edge.isEdge?.()) continue;
      const source = String(edge.data("source") ?? "");
      if (source === nodeId) directEdgeIds.push(edgeId);
    }
    if (!directEdgeIds.length) return false;
    stageDirectEdgeTargetsNearParent(session, nodeId, directEdgeIds);
    return true;
  }

  function setupApplyExpandEdgeStaging(session, branch) {
    const path = String(branch?.path ?? "");
    const parentNodeId = String(branch?.revealNodeId ?? "");
    if (!session || !path || !parentNodeId) return;

    const lowReveal = splitRevealIdsByElement(branch.lowRevealIds ?? []);
    const highReveal = splitRevealIdsByElement(branch.highRevealIds ?? []);
    const lowDirectEdgeIds = directEdgeIdsForSide(parentNodeId, "0", lowReveal.edgeIds);
    const highDirectEdgeIds = directEdgeIdsForSide(parentNodeId, "1", highReveal.edgeIds);
    const lowDirectTargetIds = targetNodeIdsForEdges(lowDirectEdgeIds);
    const highDirectTargetIds = targetNodeIdsForEdges(highDirectEdgeIds);
    const lowHideEdgeIds = uniqueIds(lowReveal.edgeIds.filter((id) => !lowDirectEdgeIds.includes(id)));
    const highHideEdgeIds = uniqueIds(highReveal.edgeIds.filter((id) => !highDirectEdgeIds.includes(id)));

    // Also hide direct edge targets so arrow heads do not point at visible blank outlines.
    const allHideNodeIds = uniqueIds([
      ...lowReveal.nodeIds,
      ...highReveal.nodeIds,
      ...lowDirectTargetIds,
      ...highDirectTargetIds
    ]);
    const allHideEdgeIds = uniqueIds([...lowHideEdgeIds, ...highHideEdgeIds]);
    const allDirectEdgeIds = uniqueIds([...lowDirectEdgeIds, ...highDirectEdgeIds]);

    applyStageDebug("setup", {
      path,
      phase: branch?.phase,
      revealNodeId: parentNodeId,
      lowRevealIds: branch.lowRevealIds ?? [],
      highRevealIds: branch.highRevealIds ?? [],
      lowParsed: lowReveal,
      highParsed: highReveal,
      lowDirectEdgeIds,
      highDirectEdgeIds,
      lowDirectTargetIds,
      highDirectTargetIds,
      lowHideEdgeIds,
      highHideEdgeIds,
      allHideNodeIds,
      allHideEdgeIds,
      allDirectEdgeIds
    });

    if (!allDirectEdgeIds.length) {
      applyStageDebug("setup-no-direct-edges", { path, parentNodeId, branch });
    }
    const pathState = session.expandRevealByPath.get(path) ?? {};
    pathState.hasLow = lowDirectEdgeIds.length > 0;
    pathState.hasHigh = highDirectEdgeIds.length > 0;
    pathState.lowDone = pathState.lowDone ?? lowDirectEdgeIds.length === 0;
    pathState.highDone = pathState.highDone ?? highDirectEdgeIds.length === 0;
    pathState.branch = branch;
    pathState.parentNodeId = parentNodeId;
    session.expandRevealByPath.set(path, pathState);

    if (!pathState.lowDone) {
      const lowStubTargetIds = stageDirectEdgeTargetsNearParent(session, parentNodeId, lowDirectEdgeIds);
      setApplyHiddenIds(uniqueIds([...lowReveal.nodeIds, ...lowDirectTargetIds]), true);
      setApplyHiddenIds(uniqueIds([...lowDirectEdgeIds, ...lowHideEdgeIds]), false);
      setApplyHiddenIds(lowHideEdgeIds, true);
      for (const edgeId of lowDirectEdgeIds) {
        session.expandEdgeById.set(edgeId, {
          path,
          side: "low",
          edgeIds: uniqueIds([...lowDirectEdgeIds, ...lowHideEdgeIds]),
          nodeIds: uniqueIds([...lowReveal.nodeIds, ...lowDirectTargetIds]),
          stagedTargetIds: lowStubTargetIds,
          directTargetIds: uniqueIds(lowDirectTargetIds)
        });
      }
    }

    if (!pathState.highDone) {
      const highStubTargetIds = stageDirectEdgeTargetsNearParent(session, parentNodeId, highDirectEdgeIds);
      setApplyHiddenIds(uniqueIds([...highReveal.nodeIds, ...highDirectTargetIds]), true);
      setApplyHiddenIds(uniqueIds([...highDirectEdgeIds, ...highHideEdgeIds]), false);
      setApplyHiddenIds(highHideEdgeIds, true);
      for (const edgeId of highDirectEdgeIds) {
        session.expandEdgeById.set(edgeId, {
          path,
          side: "high",
          edgeIds: uniqueIds([...highDirectEdgeIds, ...highHideEdgeIds]),
          nodeIds: uniqueIds([...highReveal.nodeIds, ...highDirectTargetIds]),
          stagedTargetIds: highStubTargetIds,
          directTargetIds: uniqueIds(highDirectTargetIds)
        });
      }
    }
  }

  function reapplyAllExpandEdgeStaging(session) {
    if (!session) return;
    session.expandEdgeById = new Map();
    for (const [path, pathState] of session.expandRevealByPath.entries()) {
      if (!pathState) continue;
      const branch = session.branchByPath.get(path) ?? pathState.branch ?? null;
      if (!branch) continue;
      setupApplyExpandEdgeStaging(session, branch);
      const updated = session.expandRevealByPath.get(path);
      if (updated && updated.lowDone && updated.highDone) {
        session.expandRevealByPath.delete(path);
      }
    }
  }

  function stageApplyExpandPathState(session, path, branch) {
    if (!session || !path || !branch) return;
    const phase = String(branch?.phase ?? "");
    if (phase !== "resolve" && phase !== "expand") return;
    const prev = session.expandRevealByPath.get(path) ?? {};
    session.expandRevealByPath.set(path, {
      ...prev,
      path,
      branch,
      lowDone: prev.lowDone ?? false,
      highDone: prev.highDone ?? false
    });
  }

  function revealApplyExpandSideByEdge(session, edgeId) {
    if (!session) return null;
    const meta = session.expandEdgeById?.get(edgeId);
    if (!meta) return null;
    applyStageDebug("reveal-side", { edgeId, meta });

    restoreStagedNodePositions(session, meta.stagedTargetIds ?? []);
    setApplyHiddenIds(meta.edgeIds, false);
    setApplyHiddenIds(meta.nodeIds, false);
    for (const id of meta.edgeIds) session.expandEdgeById.delete(id);

    const pathState = session.expandRevealByPath?.get(meta.path);
    if (pathState) {
      if (meta.side === "low") pathState.lowDone = true;
      if (meta.side === "high") pathState.highDone = true;
      if ((pathState.lowDone || !pathState.hasLow) && (pathState.highDone || !pathState.hasHigh)) {
        session.expandRevealByPath.delete(meta.path);
      }
    }
    return {
      path: meta.path,
      side: meta.side,
      revealedNodeIds: uniqueIds(meta.nodeIds),
      directTargetIds: uniqueIds(meta.directTargetIds)
    };
  }

  return {
    setApplyHiddenIds,
    clearApplyExpandEdgeStaging,
    resetApplyExpandEdgeStaging,
    targetNodeIdsForEdges,
    autoExpandApplyPathsForNodeIds,
    repositionApplyStagedStubTargetsForNode,
    setupApplyExpandEdgeStaging,
    reapplyAllExpandEdgeStaging,
    stageApplyExpandPathState,
    revealApplyExpandSideByEdge
  };
}
