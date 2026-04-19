// frontend/js/bddTraces/restriction/restrict_redirect_phase.js
import { sleep } from "../../graph/cy.js";
import {
  REDIRECT_EXTEND_MS,
  REDIRECT_PHASE_MS,
  REDIRECT_RETRACT_MS
} from "./restrict_constants.js";
import { clearFocus, clearRestrictS1Classes, setClassOnElements } from "./restrict_focus_utils.js";

function buildSnapshotRedirectMap(step) {
  const out = new Map();
  for (const edge of step?.snapshot?.edges ?? []) {
    const source = String(edge?.data?.source ?? "");
    const label = String(edge?.data?.label ?? "");
    const target = String(edge?.data?.target ?? "");
    if (!source || !label || !target) continue;
    out.set(`${source}|${label}`, target);
  }
  return out;
}

function buildRedirectParts(cy, step) {
  const focusIds = step?.focus ?? [];
  const incomingEdges = [];
  const targetNodes = [];
  focusIds.forEach((id) => {
    const ele = cy.getElementById(id);
    if (!ele || ele.empty?.()) return;
    if (ele.isEdge?.()) incomingEdges.push(ele);
    else targetNodes.push(ele);
  });

  const redirectMap = buildSnapshotRedirectMap(step);
  const childIdSet = new Set();
  const middleEdgeIdSet = new Set();
  targetNodes.forEach((node) => {
    const nodeId = node.id();
    const redirectedChildIds = new Set();
    incomingEdges.forEach((edge) => {
      const currentTargetId = edge.target()?.id?.();
      if (currentTargetId !== nodeId) return;
      const key = `${String(edge.data("source") ?? "")}|${String(edge.data("label") ?? "")}`;
      const nextTargetId = redirectMap.get(key);
      if (!nextTargetId) return;
      redirectedChildIds.add(nextTargetId);
      childIdSet.add(nextTargetId);
    });

    node.outgoers("edge").forEach((edge) => {
      const targetId = edge.target()?.id?.();
      if (targetId && redirectedChildIds.has(targetId)) middleEdgeIdSet.add(edge.id());
    });
  });

  return {
    incomingEdges,
    targetNodes,
    childNodes: [...childIdSet].map((id) => cy.getElementById(id)).filter((ele) => ele && !ele.empty?.()),
    middleEdges: [...middleEdgeIdSet].map((id) => cy.getElementById(id)).filter((ele) => ele && !ele.empty?.())
  };
}

function retractPoint(sourcePos, targetPos, ratio = 0.28) {
  return {
    x: sourcePos.x + (targetPos.x - sourcePos.x) * ratio,
    y: sourcePos.y + (targetPos.y - sourcePos.y) * ratio
  };
}

export async function playRedirectStep(cy, step, stepIndex) {
  const { incomingEdges, targetNodes, childNodes, middleEdges } = buildRedirectParts(cy, step);
  if (!incomingEdges.length) return;

  clearRestrictS1Classes(cy);
  clearFocus(cy);

  cy.batch(() => setClassOnElements(targetNodes, "restrict-s1-target", true));
  await sleep(REDIRECT_PHASE_MS);

  cy.batch(() => setClassOnElements(middleEdges, "restrict-s1-branch", true));
  await sleep(REDIRECT_PHASE_MS);

  cy.batch(() => setClassOnElements(childNodes, "restrict-s1-child", true));
  await sleep(REDIRECT_PHASE_MS);

  cy.batch(() => {
    setClassOnElements(middleEdges, "restrict-s1-branch", false);
    setClassOnElements(incomingEdges, "restrict-s1-incoming", true);
  });
  await sleep(REDIRECT_PHASE_MS);

  const redirectMap = buildSnapshotRedirectMap(step);
  const ghosts = [];

  cy.batch(() => setClassOnElements(targetNodes, "restrict-s1-target", false));
  cy.batch(() => {
    incomingEdges.forEach((edge, index) => {
      const source = edge.source();
      const target = edge.target();
      if (!source || source.empty?.() || !target || target.empty?.()) return;
      const ghostId = `restrict-redirect-${stepIndex}-${index}-${edge.id()}`;
      cy.add({
        group: "nodes",
        data: { id: ghostId, label: "" },
        position: { ...target.position() },
        classes: "apply-ghost"
      });
      edge.move({ target: ghostId });
      ghosts.push({
        ghost: cy.getElementById(ghostId),
        edge,
        sourcePos: source.position(),
        targetPos: target.position()
      });
    });
  });

  await Promise.allSettled(
    ghosts.map(({ ghost, sourcePos, targetPos }) =>
      ghost
        .animation(
          { position: retractPoint(sourcePos, targetPos) },
          { duration: REDIRECT_RETRACT_MS, easing: "ease-in-out" }
        )
        .play()
        .promise()
    )
  );

  await Promise.allSettled(
    ghosts.map(({ ghost, edge }) => {
      const key = `${String(edge.data("source") ?? "")}|${String(edge.data("label") ?? "")}`;
      const nextTargetId = redirectMap.get(key);
      const nextTarget = nextTargetId ? cy.getElementById(nextTargetId) : null;
      if (!nextTarget || nextTarget.empty?.()) return Promise.resolve();
      return ghost
        .animation(
          { position: { ...nextTarget.position() } },
          { duration: REDIRECT_EXTEND_MS, easing: "ease-in-out" }
        )
        .play()
        .promise();
    })
  );

  cy.batch(() => {
    ghosts.forEach(({ ghost }) => {
      if (ghost && !ghost.empty?.()) cy.remove(ghost);
    });
  });

  clearRestrictS1Classes(cy);
}
