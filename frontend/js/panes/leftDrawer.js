const LEFT_MIN_PX = 200;
const LEFT_MAX_FRACTION = 0.7;
const LEFT_WIDTH_CSS_VAR = "--left-width";

function applyLeftWidth(dom, widthPx) {
  const width = `${widthPx}px`;
  dom.leftEl?.style.setProperty(LEFT_WIDTH_CSS_VAR, width);
  dom.mainEl?.style.setProperty(LEFT_WIDTH_CSS_VAR, width);
}

function currentLeftWidth(dom) {
  const raw = dom.leftEl ? Number.parseFloat(getComputedStyle(dom.leftEl).getPropertyValue(LEFT_WIDTH_CSS_VAR)) : NaN;
  return Number.isFinite(raw) ? raw : Math.max(LEFT_MIN_PX, dom.leftEl?.offsetWidth ?? LEFT_MIN_PX);
}

function syncLeftDrawerUi(dom) {
  const collapsed = dom.mainEl?.classList.contains("left-collapsed");
  const btn = dom.leftDrawerToggleEl;
  const restoreBtn = dom.leftDrawerRestoreEl;
  if (btn) {
    btn.hidden = !!collapsed;
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.setAttribute("title", "Hide expression list");
    btn.setAttribute("aria-label", "Hide expression list");
  }
  if (restoreBtn) {
    restoreBtn.hidden = !collapsed;
    restoreBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    restoreBtn.setAttribute("title", "Show expression list");
    restoreBtn.setAttribute("aria-label", "Show expression list");
  }
}

function refreshGraphAfterDrawerChange({ cy, axis, smoothFit, fit = true } = {}) {
  requestAnimationFrame(() => {
    cy.resize();
    if (!cy.nodes().length) {
      axis.sync();
      return;
    }
    if (!fit) {
      axis.sync();
      return;
    }
    void smoothFit(cy, undefined, { padding: 30, duration: 260 }).then(() => axis.sync());
  });
}

function relayoutActiveApplyScene({ state, cy, axis, smoothFit, fit = true } = {}) {
  const session = state.applyTraceSession;
  if (!session || !Array.isArray(session.vars) || !session.vars.length || !cy.nodes(".apply-zone").length) {
    refreshGraphAfterDrawerChange({ cy, axis, smoothFit, fit });
    return;
  }
  refreshGraphAfterDrawerChange({ cy, axis, smoothFit, fit });
}

function setLeftDrawerCollapsed({ dom, state, cy, axis, smoothFit }, collapsed, { fit = true } = {}) {
  if (!dom.mainEl) return;
  dom.mainEl.classList.toggle("left-collapsed", collapsed);
  syncLeftDrawerUi(dom);
  relayoutActiveApplyScene({ state, cy, axis, smoothFit, fit });
}

function toggleLeftDrawer(ctx, { fit = true } = {}) {
  if (!ctx.dom.mainEl) return;
  setLeftDrawerCollapsed(ctx, !ctx.dom.mainEl.classList.contains("left-collapsed"), { fit });
}

export function setupLeftDrawer(ctx) {
  const { dom, cy, axis } = ctx;
  const left = dom.leftEl;
  const resizer = dom.resizerEl;
  if (!left || !resizer || !dom.mainEl) return;

  applyLeftWidth(dom, currentLeftWidth(dom));
  syncLeftDrawerUi(dom);

  dom.leftDrawerToggleEl?.addEventListener("click", () => {
    toggleLeftDrawer(ctx, { fit: true });
  });
  dom.leftDrawerRestoreEl?.addEventListener("click", () => {
    toggleLeftDrawer(ctx, { fit: true });
  });

  function getMaxLeftPx() {
    return Math.floor(document.documentElement.clientWidth * LEFT_MAX_FRACTION);
  }

  resizer.addEventListener("pointerdown", (e) => {
    if (dom.mainEl.classList.contains("left-collapsed")) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = left.offsetWidth;
    const maxPx = getMaxLeftPx();

    function onMove(moveEv) {
      const dx = moveEv.clientX - startX;
      let w = startWidth + dx;
      w = Math.max(LEFT_MIN_PX, Math.min(maxPx, w));
      applyLeftWidth(dom, w);
      requestAnimationFrame(() => {
        cy.resize();
        axis.sync();
      });
    }

    function onUp(upEv) {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (upEv.pointerId != null) resizer.releasePointerCapture?.(upEv.pointerId);
      refreshGraphAfterDrawerChange({ ...ctx, fit: true });
    }

    resizer.setPointerCapture(e.pointerId);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}

export function setupCanvasResizeObserver(ctx) {
  const { dom } = ctx;
  if (!dom.cyContainer || typeof ResizeObserver !== "function") return;

  let timer = null;
  const observer = new ResizeObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      relayoutActiveApplyScene({ ...ctx, fit: true });
    }, 80);
  });

  observer.observe(dom.cyContainer);
}
