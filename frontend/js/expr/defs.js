export function parseDefinition(text) {
  const t = (text || "").trim();
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (!m) return null;
  const name = m[1];
  const rhs = (m[2] || "").trim();
  if (!rhs) return null;
  return { name, rhs };
}

export function buildDefMap(expressions) {
  const defs = new Map();
  for (const line of expressions) {
    const d = parseDefinition(line.text);
    if (d) defs.set(d.name, d.rhs);
  }
  return defs;
}

export function expandExpr(text, defs) {
  const tokens = (text || "").split(/(\b[A-Za-z_][A-Za-z0-9_]*\b)/g);
  const expanding = new Set();

  function expandName(name) {
    if (!defs.has(name)) return name;
    if (expanding.has(name)) throw new Error(`Cyclic definition detected: ${name}`);
    expanding.add(name);
    const rhs = defs.get(name);
    const out = `(${expand(rhs)})`;
    expanding.delete(name);
    return out;
  }

  function expand(s) {
    const parts = (s || "").split(/(\b[A-Za-z_][A-Za-z0-9_]*\b)/g);
    return parts
      .map((p) => {
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
          const low = p.toLowerCase();
          if (low === "true" || low === "false") return p;
          return expandName(p);
        }
        return p;
      })
      .join("");
  }

  return tokens
    .map((p) => {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
        const low = p.toLowerCase();
        if (low === "true" || low === "false") return p;
        return expandName(p);
      }
      return p;
    })
    .join("");
}

export function inferVars(exprText) {
  const matches = (exprText || "").match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const out = [];
  const seen = new Set();

  for (const m of matches) {
    const k = m.toLowerCase();
    if (k === "true" || k === "false") continue;
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

export function syncOrder(exprText, currentOrder) {
  const used = inferVars(exprText);
  if (used.length === 0) return [];

  const order = Array.isArray(currentOrder) ? [...currentOrder] : [];
  const kept = order.filter((v) => used.includes(v));
  const appended = used.filter((v) => !kept.includes(v));
  return kept.concat(appended);
}

export function shouldRequest(expr) {
  const s = (expr || "").trim();
  if (!s) return false;

  let bal = 0;
  for (const ch of s) {
    if (ch === "(") bal++;
    else if (ch === ")") bal--;
    if (bal < 0) return false;
  }
  if (bal !== 0) return false;

  if (/[∧∨⊕→↔]$/.test(s)) return false;
  if (/¬$/.test(s)) return false;
  if (/[∧∨⊕→↔]{2,}/.test(s)) return false;

  return true;
}