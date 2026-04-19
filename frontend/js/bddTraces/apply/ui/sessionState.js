export function parseApplyResultPositions(raw) {
  const out = new Map();
  if (!raw || typeof raw !== "object") return out;
  for (const [id, pos] of Object.entries(raw)) {
    if (!id) continue;
    const normalizedId = String(id).startsWith("M-") ? String(id) : `M-${id}`;
    const x = Number(pos?.x);
    const y = Number(pos?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) out.set(normalizedId, { x, y });
  }
  return out;
}

export function posMapCenterX(posMap) {
  const xs = [...(posMap?.values?.() ?? [])].map((p) => p.x).filter(Number.isFinite);
  if (!xs.length) return null;
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

export function storeApplyFinalLayout(session, data) {
  if (!session) return;
  if (session.finalResultPositions instanceof Map && session.finalResultPositions.size) return;
  const finalResultPositions = parseApplyResultPositions(data?.finalResultPositions);

  if (!finalResultPositions.size) return;
  session.finalResultPositions = finalResultPositions;
  session.finalResultCenterX = posMapCenterX(finalResultPositions);
}

export function storeApplyCurrentResultState(session, payload) {
  if (!session) return;
  const nextState = payload?.resultState ?? payload?.initialResultState ?? null;
  if (nextState) session.currentResultState = nextState;
}
