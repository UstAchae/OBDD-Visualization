export function createBddBarController({
  state,
  dom,
  cy,
  analyzeLine,
  canUndoSkipReduction,
  clearApplyPendingCompareHighlight,
  clearApplyCompareHighlight
}) {
  function getVisibleApplyReduceKinds() {
    const resultNodes = cy
      .nodes(".apply-result")
      .filter(
        (n) =>
          !n.hasClass("apply-pair") &&
          !n.hasClass("apply-slot") &&
          !n.hasClass("apply-ghost") &&
          !n.hasClass("apply-hidden-step")
      );
    if (!resultNodes.length) return [];

    const nodeIds = new Set(resultNodes.map((n) => n.id()));
    const nodeInfo = new Map();
    resultNodes.forEach((n) => {
      const id = n.id();
      const label = String(n.data("label") ?? "");
      const isTerminal = n.hasClass("terminal") || label === "0" || label === "1";
      nodeInfo.set(id, { id, label, isTerminal, low: null, high: null });
    });

    cy
      .edges(".apply-result")
      .forEach((edge) => {
        const source = edge.data("source");
        const target = edge.data("target");
        if (!nodeIds.has(source) || !nodeIds.has(target)) return;
        const kind = String(edge.data("label") ?? "");
        const info = nodeInfo.get(source);
        if (!info || (kind !== "0" && kind !== "1")) return;
        if (kind === "0") info.low = target;
        else info.high = target;
      });

    const terminalCounts = { 0: 0, 1: 0 };
    const mergeGroups = new Map();
    let canRedundant = false;

    nodeInfo.forEach((info) => {
      if (info.isTerminal) {
        if (info.label === "0" || info.label === "1") terminalCounts[info.label] += 1;
        return;
      }
      if (info.low && info.high && info.low === info.high) canRedundant = true;
      if (info.low && info.high) {
        const key = `${info.label}|${info.low}|${info.high}`;
        mergeGroups.set(key, (mergeGroups.get(key) ?? 0) + 1);
      }
    });

    const out = [];
    if (terminalCounts[0] > 1 || terminalCounts[1] > 1) out.push("terminals");
    if (canRedundant) out.push("redundant");
    if ([...mergeGroups.values()].some((count) => count > 1)) out.push("merge");
    return out;
  }

  function getVisibleApplyResultNodeIds() {
    return cy
      .nodes(".apply-result")
      .filter(
        (n) =>
          !n.hasClass("apply-pair") &&
          !n.hasClass("apply-slot") &&
          !n.hasClass("apply-ghost") &&
          !n.hasClass("apply-hidden-step")
      )
      .map((n) => n.id());
  }

  function summarizeReduceKinds(nodeInfo) {
    const terminalCounts = { 0: 0, 1: 0 };
    const mergeGroups = new Map();
    let canRedundant = false;

    nodeInfo.forEach((info) => {
      if (info.isTerminal) {
        if (info.label === "0" || info.label === "1") terminalCounts[info.label] += 1;
        return;
      }
      if (info.low && info.high && info.low === info.high) canRedundant = true;
      if (info.low && info.high) {
        const key = `${info.label}|${info.low}|${info.high}`;
        mergeGroups.set(key, (mergeGroups.get(key) ?? 0) + 1);
      }
    });

    const out = [];
    if (terminalCounts[0] > 1 || terminalCounts[1] > 1) out.push("terminals");
    if (canRedundant) out.push("redundant");
    if ([...mergeGroups.values()].some((count) => count > 1)) out.push("merge");
    return out;
  }

  function getVisibleStandardReduceKinds() {
    const nodes = cy.nodes().filter((n) => !n.hasClass("apply-pair") && !n.hasClass("apply-slot") && !n.hasClass("apply-ghost"));
    if (!nodes.length) return [];

    const nodeIds = new Set(nodes.map((n) => n.id()));
    const nodeInfo = new Map();
    nodes.forEach((n) => {
      const id = n.id();
      const label = String(n.data("label") ?? "");
      const isTerminal = n.hasClass("terminal") || label === "0" || label === "1";
      nodeInfo.set(id, { id, label, isTerminal, low: null, high: null });
    });

    cy.edges().forEach((edge) => {
      const source = edge.data("source");
      const target = edge.data("target");
      if (!nodeIds.has(source) || !nodeIds.has(target)) return;
      const kind = String(edge.data("label") ?? "");
      const info = nodeInfo.get(source);
      if (!info || (kind !== "0" && kind !== "1")) return;
      if (kind === "0") info.low = target;
      else info.high = target;
    });

    return summarizeReduceKinds(nodeInfo);
  }

  function getCanvasReduceKinds() {
    if (!cy.nodes().length) return [];
    const applySession =
      state.applyTraceSession && state.applyTraceSession.idx === state.activeIndex
        ? state.applyTraceSession
        : null;
    if (applySession) {
      const hinted = applySession.availableReduceKinds;
      return Array.isArray(hinted) ? hinted : [];
    }
    if (state.restrictTraceSession && !state.restrictTraceSession.completed) return [];
    if (!state.lastBddPayload) return [];
    return getVisibleStandardReduceKinds();
  }

  function getLayoutVarsForCurrentCanvas() {
    if (Array.isArray(state.applyTraceSession?.vars) && state.applyTraceSession.vars.length) {
      return [...state.applyTraceSession.vars];
    }
    if (Array.isArray(state.restrictTraceSession?.vars) && state.restrictTraceSession.vars.length) {
      return [...state.restrictTraceSession.vars];
    }
    if (Array.isArray(state.lastBddPayload?.vars) && state.lastBddPayload.vars.length) {
      return [...state.lastBddPayload.vars];
    }
    return [];
  }

  function isApplyTraceFullyReducedObdd(enabledKinds = new Set(getCanvasReduceKinds())) {
    const session = state.applyTraceSession;
    if (!session) return true;
    const hasPendingBranchClicks = (session.branchMap?.size ?? 0) > 0;
    const hasPendingEdgeReveals = (session.expandEdgeById?.size ?? 0) > 0;
    const hasPendingReduce = enabledKinds.size > 0;
    return !hasPendingBranchClicks && !hasPendingEdgeReveals && !hasPendingReduce;
  }

  function isRestrictTraceInProgress() {
    return Boolean(state.restrictTraceSession && !state.restrictTraceSession.completed);
  }

  const RESTRICT_STEP_BUTTON_META = [
    { label: "S1", title: "Restrict step 1: redirect incoming edges to lo(n)/hi(n)" },
    { label: "S2", title: "Restrict step 2: remove n and its edges" },
    { label: "S3", title: "Restrict step 3: remove unreachable nodes" }
  ];

  const STANDARD_REDUCE_BUTTON_META = [
    { btn: () => dom.btnReduceTerminals, label: "T", title: "Reduce terminals" },
    { btn: () => dom.btnReduceRedundant, label: "R", title: "Reduce redundant test" },
    { btn: () => dom.btnReduceMerge, label: "NT", title: "Reduce non-terminals" }
  ];

  function setMiniStepButtonState(btn, { label, title, disabled, available, hidden = false }) {
    if (!btn) return;
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.disabled = Boolean(disabled);
    btn.hidden = Boolean(hidden);
    btn.classList.toggle("reduce-available", Boolean(available));
    btn.classList.toggle("reduce-unavailable", !available);
  }

  function applyStandardReduceButtonLabels() {
    STANDARD_REDUCE_BUTTON_META.forEach(({ btn, label, title }) => {
      const ele = btn();
      if (!ele) return;
      ele.textContent = label;
      ele.title = title;
      ele.setAttribute("aria-label", title);
    });
  }

  function refreshAppliableStepsLabel(hasVisibleSteps) {
    if (!dom.bddBarLabel) return;
    dom.bddBarLabel.hidden = !hasVisibleSteps;
  }

  function refreshRestrictStepButtons() {
    const session = state.restrictTraceSession;
    const buttons = [dom.btnReduceTerminals, dom.btnReduceRedundant, dom.btnReduceMerge];
    const nextStepIndex = Number(session?.nextStepIndex ?? 0);
    const stepsLen = Number(session?.trace?.steps?.length ?? 0);
    const busy = Boolean(state.isReducing);
    let hasVisibleSteps = false;

    buttons.forEach((btn, index) => {
      const meta = RESTRICT_STEP_BUTTON_META[index];
      const stepExists = index < stepsLen;
      const stepReady = stepExists && index === nextStepIndex && session?.active && !busy;
      const available = stepReady;
      hasVisibleSteps ||= available;
      setMiniStepButtonState(btn, {
        label: meta.label,
        title: meta.title,
        disabled: !stepReady,
        available,
        hidden: !available
      });
    });

    if (dom.btnLayout) {
      dom.btnLayout.disabled = true;
      dom.btnLayout.hidden = true;
    }
    refreshAppliableStepsLabel(hasVisibleSteps);
  }

  function canAutoLayoutCurrentBdd(enabledKinds = new Set(getCanvasReduceKinds())) {
    if (state.isReducing) return false;
    if (isRestrictTraceInProgress()) return false;
    if (!getLayoutVarsForCurrentCanvas().length) return false;
    if (!cy.nodes().length) return false;
    if (!isApplyTraceFullyReducedObdd(enabledKinds)) return false;
    return enabledKinds.size === 0;
  }

  function setTraceToggleIcon(btn, isPlaying) {
    const icon = isPlaying
      ? '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="6" y="5" width="4.5" height="14" rx="1"></rect><rect x="13.5" y="5" width="4.5" height="14" rx="1"></rect></svg>'
      : '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 5v14l12-7z"></path></svg>';
    btn.innerHTML = icon;
  }

  function refreshBddBarPrimaryButtons() {
    const meta = analyzeLine(state.activeIndex);
    const activeIsApply = meta.kind === "apply";
    const activeIsRestrict = meta.kind === "restrict";
    const canShowTraceToggle = (activeIsApply || activeIsRestrict) && meta.ok;

    if (dom.btnReduce) {
      const inExprMode = !activeIsApply && !activeIsRestrict;
      const canUseReduce = inExprMode && Boolean(state.lastBddPayload) && !state.isReducing;
      const canUndoReduce = inExprMode && canUndoSkipReduction();
      const shouldShow = canUseReduce || canUndoReduce;
      dom.btnReduce.hidden = !shouldShow;
      dom.btnReduce.disabled = !shouldShow;
      if (canUndoReduce) {
        dom.btnReduce.textContent = "Undo Reduction";
        dom.btnReduce.title = "Go back to BDD";
      } else {
        dom.btnReduce.textContent = "Skip Reduction";
        dom.btnReduce.title = "Straight to OBDD";
      }
    }

    if (dom.btnApplyToggle) {
      dom.btnApplyToggle.hidden = !canShowTraceToggle;
      if (canShowTraceToggle) {
        const session = state.restrictTraceSession;
        const isRestrictActive = Boolean(session && session.idx === state.activeIndex && session.active);
        const isPlaying = state.applyTraceSession?.idx === state.activeIndex;
        const isActive = activeIsRestrict ? isRestrictActive : isPlaying;
        setTraceToggleIcon(dom.btnApplyToggle, isActive);
        if (activeIsRestrict) {
          dom.btnApplyToggle.title = isActive ? "Exit Restrict trace" : "Enter Restrict trace";
          dom.btnApplyToggle.setAttribute("aria-label", isActive ? "Exit Restrict trace" : "Enter Restrict trace");
        } else {
          dom.btnApplyToggle.title = isPlaying ? "Pause Apply trace" : "Play Apply trace";
          dom.btnApplyToggle.setAttribute("aria-label", isPlaying ? "Pause Apply trace" : "Play Apply trace");
        }
        dom.btnApplyToggle.disabled = state.isReducing || !meta.ok;
      } else {
        dom.btnApplyToggle.disabled = true;
        dom.btnApplyToggle.innerHTML = "";
        if (document.activeElement === dom.btnApplyToggle) dom.btnApplyToggle.blur();
      }
    }
  }

  function refreshCanvasReduceButtons() {
    if (isRestrictTraceInProgress() && state.restrictTraceSession?.idx === state.activeIndex) {
      refreshRestrictStepButtons();
      refreshBddBarPrimaryButtons();
      return;
    }

    applyStandardReduceButtonLabels();
    const allKinds = ["terminals", "redundant", "merge"];
    const btnByKind = {
      terminals: dom.btnReduceTerminals,
      redundant: dom.btnReduceRedundant,
      merge: dom.btnReduceMerge
    };
    const enabled = new Set(getCanvasReduceKinds());
    const busy = Boolean(state.isReducing);
    const applySession = state.applyTraceSession;

    if (applySession?.suspendCompareHighlight) {
      clearApplyPendingCompareHighlight(applySession);
      applySession.compareHighlightPath = "";
      applySession.compareHighlightIds = [];
      clearApplyCompareHighlight();
    }

    allKinds.forEach((kind) => {
      const btn = btnByKind[kind];
      if (!btn) return;
      const canUseNow = !busy && enabled.has(kind);
      btn.disabled = !canUseNow;
      btn.hidden = !canUseNow;
      btn.classList.toggle("reduce-available", canUseNow);
      btn.classList.toggle("reduce-unavailable", !canUseNow);
    });

    const canLayout = canAutoLayoutCurrentBdd(enabled);
    if (dom.btnLayout) {
      dom.btnLayout.disabled = !canLayout;
      dom.btnLayout.hidden = !canLayout;
    }
    refreshAppliableStepsLabel(enabled.size > 0 || canLayout);
    refreshBddBarPrimaryButtons();
  }

  return {
    getVisibleApplyReduceKinds,
    getVisibleApplyResultNodeIds,
    getCanvasReduceKinds,
    getLayoutVarsForCurrentCanvas,
    isApplyTraceFullyReducedObdd,
    isRestrictTraceInProgress,
    canAutoLayoutCurrentBdd,
    refreshCanvasReduceButtons,
    refreshBddBarPrimaryButtons
  };
}
