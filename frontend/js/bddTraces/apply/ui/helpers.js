export function uniqueIds(ids = []) {
  return [...new Set((ids ?? []).filter(Boolean))];
}

export function hasCompareBranchIds(branch) {
  return (branch?.compareIds?.length ?? 0) > 0;
}

export function isSameLevelCompareBranch(branch) {
  return String(branch?.caseKey ?? "") === "case2" && hasCompareBranchIds(branch);
}

export function isTerminalCompareBranch(branch) {
  return String(branch?.caseKey ?? "") === "case1" && hasCompareBranchIds(branch);
}

export function isNonSameLevelCompareBranch(branch) {
  const key = String(branch?.caseKey ?? "");
  return (key === "case3" || key === "case4") && hasCompareBranchIds(branch);
}

export function stableApplyPathId(path = "") {
  return String(path).replaceAll(".", "_");
}

export function applyResultNodeIdForPath(path = "") {
  return `M-m_${stableApplyPathId(path)}`;
}

export function applyPathBits(path = "") {
  const parts = String(path ?? "").split(".").filter(Boolean);
  const fromRoot = parts[0] === "root" ? parts.slice(1) : parts;
  return fromRoot.filter((bit) => bit === "0" || bit === "1");
}

export function pairNodeIdsForPath(path = "") {
  const sid = stableApplyPathId(path);
  return {
    leftId: `P-m_${sid}-L`,
    rightId: `P-m_${sid}-R`
  };
}

export function getApplyCompareParentPath(path = "") {
  const parts = String(path).split(".").filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

export function getApplyCompareStepBit(path = "") {
  const parts = String(path).split(".").filter(Boolean);
  return parts.length <= 1 ? null : parts[parts.length - 1];
}

export function mapCompareIdsByZone(ids = []) {
  const out = new Map();
  uniqueIds(ids).forEach((id) => {
    if (String(id).startsWith("L-")) out.set("L", id);
    else if (String(id).startsWith("R-")) out.set("R", id);
  });
  return out;
}

export function applyChildComparePath(path = "", side = "") {
  const bit = side === "low" ? "0" : side === "high" ? "1" : "";
  if (!bit) return null;
  return path ? `${path}.${bit}` : bit;
}
