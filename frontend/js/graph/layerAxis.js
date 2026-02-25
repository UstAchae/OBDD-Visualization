let axisVars = [];

export function getAxisVars() {
  return axisVars.slice();
}

export function setAxisVars(vars) {
  axisVars = Array.isArray(vars) ? vars.slice() : [];
}

function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function levelRenderedYFromGraph(cy, varName) {
  const ys = cy
    .nodes()
    .filter((n) => !n.hasClass("terminal") && n.data("label") === varName)
    .map((n) => n.renderedPosition("y"));
  if (!ys.length) return null;
  return median(ys);
}

function terminalRenderedYFromGraph(cy) {
  const ys = cy
    .nodes()
    .filter((n) => n.hasClass("terminal") || n.data("label") === "0" || n.data("label") === "1")
    .map((n) => n.renderedPosition("y"));
  if (!ys.length) return null;
  return median(ys);
}

function renderedYToAxisTop(cy, layerAxisEl, renderedY) {
  const cyRect = cy.container().getBoundingClientRect();
  const axisRect = layerAxisEl.getBoundingClientRect();
  return renderedY + (cyRect.top - axisRect.top);
}

export function renderLayerAxis(layerAxisEl, vars, cy) {
  setAxisVars(vars);
  if (!layerAxisEl) return;

  layerAxisEl.innerHTML = "";

  for (const v of axisVars) {
    const tick = document.createElement("div");
    tick.className = "layer-tick";
    tick.dataset.kind = "var";
    tick.dataset.var = v;
    tick.innerHTML = `<span class="layer-dot"></span><span>${v}</span>`;
    layerAxisEl.appendChild(tick);
  }

  const t = document.createElement("div");
  t.className = "layer-tick";
  t.dataset.kind = "terminal";
  t.innerHTML = `<span class="layer-dot"></span><span>0/1</span>`;
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
    else {
      el.style.display = "";
      el.style.top = `${renderedYToAxisTop(cy, layerAxisEl, ry)}px`;
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

export function renderLayers(layersListEl, vars) {
  if (!layersListEl) return;

  layersListEl.innerHTML = "";
  if (!Array.isArray(vars) || vars.length === 0) {
    layersListEl.innerHTML = `<div class="small">No variables</div>`;
    return;
  }

  vars.forEach((v, i) => {
    const row = document.createElement("div");
    row.className = "layer-row";
    row.innerHTML = `<span>${v}</span><span class="layer-idx">level ${i + 1}</span>`;
    layersListEl.appendChild(row);
  });
}