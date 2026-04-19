export function createLineAnalysisSync({
  state,
  fetchAnalyzeLine,
  localAnalyzeLine,
  refreshLineUi = () => {},
  refreshPrimaryButtons = () => {}
}) {
  let lineAnalysisTimer = null;

  function analyzeLine(idx) {
    const cached = state.lineAnalysisCache.get(idx);
    if (cached) return cached;
    return localAnalyzeLine(idx);
  }

  async function refreshAllLineAnalysis(version) {
    const expressions = state.expressions.map((e) => e.text || "");
    const tasks = expressions.map(async (_, idx) => {
      try {
        const resp = await fetchAnalyzeLine(expressions, idx);
        if (!resp.ok) return null;
        return await resp.json().catch(() => null);
      } catch {
        return null;
      }
    });
    const results = await Promise.all(tasks);
    if (version !== state.lineAnalysisVersion) return;

    state.lineAnalysisCache.clear();
    results.forEach((meta, idx) => {
      if (meta && typeof meta === "object") {
        state.lineAnalysisCache.set(idx, meta);
      }
    });

    refreshLineUi();
    refreshPrimaryButtons();
  }

  async function ensureLineAnalysis(idx) {
    const expressions = state.expressions.map((e) => e.text || "");
    try {
      const resp = await fetchAnalyzeLine(expressions, idx);
      if (!resp.ok) return;
      const meta = await resp.json().catch(() => null);
      if (meta && typeof meta === "object") {
        state.lineAnalysisCache.set(idx, meta);
      }
    } catch {
      // Fallback to local analyzer when the server analysis endpoint is unavailable.
    }
  }

  function scheduleLineAnalysisRefresh() {
    state.lineAnalysisVersion += 1;
    const version = state.lineAnalysisVersion;
    state.lineAnalysisCache.clear();
    if (lineAnalysisTimer) clearTimeout(lineAnalysisTimer);
    lineAnalysisTimer = setTimeout(() => {
      void refreshAllLineAnalysis(version);
    }, 120);
  }

  return {
    analyzeLine,
    ensureLineAnalysis,
    scheduleLineAnalysisRefresh
  };
}
