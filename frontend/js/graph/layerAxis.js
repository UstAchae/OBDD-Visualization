import { median } from "./math.js";

let axisVars = [];
let axisOnReorder = null;
let dragVar = null;

export function getAxisVars() {
  return axisVars.slice();
}

export function setAxisVars(vars) {
  axisVars = Array.isArray(vars) ? vars.slice() : [];
}

function axisLocalY(layerAxisEl, clientY) {
  const rect = layerAxisEl.getBoundingClientRect();
  return clientY - rect.top;
}

function isLayerSampleNode(node) {
  return !node.hasClass("terminal") &&
    !node.hasClass("apply-pair") &&
    !node.hasClass("apply-slot") &&
    !node.hasClass("apply-ghost") &&
    !node.hasClass("apply-hidden-step");
}

function isVisibleTerminalSampleNode(node) {
  if (!node || node.empty?.()) return false;
  return (node.hasClass("terminal") || node.data("label") === "0" || node.data("label") === "1") &&
    !node.hasClass("apply-slot") &&
    !node.hasClass("apply-ghost") &&
    !node.hasClass("apply-hidden-step") &&
    !node.hasClass("apply-drag-handle");
}

function levelRenderedYFromGraph(cy, varName) {
  const ys = cy
    .nodes()
    .filter((n) => isLayerSampleNode(n) && n.data("label") === varName)
    .map((n) => n.renderedPosition("y"));
  if (!ys.length) return null;
  return median(ys);
}

function terminalRenderedYFromGraph(cy) {
  const ys = cy
    .nodes()
    .filter((n) => isVisibleTerminalSampleNode(n))
    .map((n) => n.renderedPosition("y"));
  if (!ys.length) return null;
  return median(ys);
}

function renderedYToAxisTop(cy, layerAxisEl, renderedY) {
  const cyRect = cy.container().getBoundingClientRect();
  const axisRect = layerAxisEl.getBoundingClientRect();
  return renderedY + (cyRect.top - axisRect.top);
}

function tickTop(el) {
  const top = Number.parseFloat(el?.style?.top ?? "");
  return Number.isFinite(top) ? top : 0;
}

function reorderedVarsFromDrop(layerAxisEl, varName, draggedTop) {
  const others = axisVars.filter((v) => v !== varName);
  const insertAt = others.filter((name) => {
    const el = layerAxisEl.querySelector(`.layer-tick[data-kind="var"][data-var="${CSS.escape(name)}"]`);
    return el && tickTop(el) < draggedTop;
  }).length;
  const next = others.slice();
  next.splice(insertAt, 0, varName);
  return next;
}

function bindDrag(layerAxisEl, cy, tick, varName) {
  tick.addEventListener("pointerdown", (downEv) => {
    if (downEv.button !== 0 || !axisOnReorder) return;
    downEv.preventDefault();
    downEv.stopPropagation();

    const startTop = tickTop(tick);
    const pointerOffset = startTop - axisLocalY(layerAxisEl, downEv.clientY);
    dragVar = varName;
    tick.classList.add("dragging");

    const onMove = (moveEv) => {
      const nextTop = axisLocalY(layerAxisEl, moveEv.clientY) + pointerOffset;
      tick.style.top = `${nextTop}px`;
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      tick.classList.remove("dragging");

      const nextVars = reorderedVarsFromDrop(layerAxisEl, varName, tickTop(tick));
      dragVar = null;

      const changed =
        nextVars.length === axisVars.length &&
        nextVars.some((v, i) => v !== axisVars[i]);

      if (changed) axisOnReorder?.(nextVars);
      else syncLayerAxis(layerAxisEl, cy);
    };

    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
  });
}

export function renderLayerAxis(layerAxisEl, vars, cy, { onReorder = null } = {}) {
  setAxisVars(vars);
  axisOnReorder = onReorder;
  if (!layerAxisEl) return;

  layerAxisEl.innerHTML = "";

  for (const v of axisVars) {
    const tick = document.createElement("div");
    tick.className = "layer-tick";
    tick.dataset.kind = "var";
    tick.dataset.var = v;
    tick.innerHTML = `<span class="layer-dot"></span><span class="layer-label">${v}</span>`;
    bindDrag(layerAxisEl, cy, tick, v)
    layerAxisEl.appendChild(tick);
  }

  const t = document.createElement("div");
  t.className = "layer-tick";
  t.dataset.kind = "terminal";
  t.innerHTML = `<span class="layer-dot"></span><span class="layer-label">0/1</span>`;
  layerAxisEl.appendChild(t);

  syncLayerAxis(layerAxisEl, cy);
}

export function syncLayerAxis(layerAxisEl, cy) {
  if (!layerAxisEl) return;

  for (const v of axisVars) {
    const ry = levelRenderedYFromGraph(cy, v);
    const el = layerAxisEl.querySelector(
      `.layer-tick[data-kind="var"][data-var="${CSS.escape(v)}"]`
    );
    if (!el) continue;

    if (ry == null) el.style.display = "none";
    else if (dragVar !== v) {
      el.style.display = "";
      el.style.top = `${renderedYToAxisTop(cy, layerAxisEl, ry)}px`;
    } else {
      el.style.display = "";
    }
  }

  const tryY = terminalRenderedYFromGraph(cy);
  const tel = layerAxisEl.querySelector(`.layer-tick[data-kind="terminal"]`);
  if (tel) {
    if (tryY == null) tel.style.display = "none";
    else {
      tel.style.display = "";
      tel.style.top = `${renderedYToAxisTop(cy, layerAxisEl, tryY)}px`;
    }
  }
}
