/**
 * Bryant-style reduce traces for the main (non-apply) BDD canvas.
 */
export function createServerReduceTraceRunner({
  state,
  cy,
  axis,
  smoothFit,
  setGraphSnapshot,
  setDraggingEnabled,
  hasAnyReduceApplied,
  persistBddPane,
  expr,
  ctx,
  refreshCanvasReduceButtons
}) {
  async function runReduceTrace({ kind, fetchTrace, playTrace }) {
    if (!state.lastBddPayload) return false;

    if (state.isReducing) {
      console.warn("[reduce] blocked: already reducing", kind);
      return false;
    }

    state.isReducing = true;
    const ownerIdx = state.activeIndex;

    try {
      const applied = state.appliedReduce.slice();
      const { expr: exprStr, vars } = state.lastBddPayload;

      let resp;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 12000);

        resp = await fetchTrace(exprStr, vars, applied, controller.signal);

        clearTimeout(t);
      } catch (e) {
        console.error("[reduce] fetchTrace FAILED", kind, e);
        return false;
      }

      if (resp.status === 204) {
        state.skipReductionApplied = false;
        state.appliedReduce.push(kind);
        setDraggingEnabled(hasAnyReduceApplied());
        persistBddPane(ownerIdx);
        expr.refreshExprUiOnly(ctx, ownerIdx);
        return true;
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        console.error("[reduce] HTTP not ok", resp.status, txt);
        return false;
      }

      const trace = await resp.json().catch((e) => {
        console.error("[reduce] JSON parse failed", e);
        return null;
      });

      if (!trace?.initial) {
        console.error("[reduce] missing trace.initial", trace);
        return false;
      }

      await setGraphSnapshot(trace.initial, vars, { bddLayoutKind: "tree" });

      const steps = trace?.steps ?? [];
      if (steps.length) {
        await playTrace(cy, trace, {
          setGraph: async (els) => setGraphSnapshot(els, vars, { bddLayoutKind: "tree" }),
          onAfterEach: () => axis.sync(),
          vars,
          ctx: { vars, state }
        });

        const finalSnap = steps.at(-1)?.snapshot ?? null;
        if (finalSnap) state.lastBddElements = finalSnap;
      } else {
        state.lastBddElements = trace.initial;
      }

      state.skipReductionApplied = false;
      state.appliedReduce.push(kind);
      setDraggingEnabled(hasAnyReduceApplied());
      await smoothFit(cy, undefined, { padding: 30, duration: 260 });
      axis.sync();

      persistBddPane(ownerIdx);
      expr.refreshExprUiOnly(ctx, ownerIdx);
      return true;
    } finally {
      state.isReducing = false;
      refreshCanvasReduceButtons();
    }
  }

  return { runReduceTrace };
}
