const BASE_EXPR_NAME_SRC = "[A-Za-z_][A-Za-z0-9_]*";
const RESTRICT_SUFFIX_SRC = `\\[[01]\\/${BASE_EXPR_NAME_SRC}\\]`;
const DERIVED_EXPR_NAME_SRC = `${BASE_EXPR_NAME_SRC}(?:${RESTRICT_SUFFIX_SRC})*`;

const BASE_EXPR_NAME_RE = new RegExp(`^${BASE_EXPR_NAME_SRC}$`);
const DERIVED_EXPR_NAME_RE = new RegExp(`^${DERIVED_EXPR_NAME_SRC}$`);

export function isBaseExprName(name) {
  return BASE_EXPR_NAME_RE.test(String(name || "").trim());
}

export function isDerivedExprName(name) {
  return DERIVED_EXPR_NAME_RE.test(String(name || "").trim());
}

export function isRestrictDerivedAliasName(name) {
  const t = String(name || "").trim();
  return isDerivedExprName(t) && t.includes("[");
}

export function makeRestrictDerivedName(baseName, bit, atomName) {
  const base = String(baseName || "").trim();
  const atom = String(atomName || "").trim();
  if (!isDerivedExprName(base) || !isBaseExprName(atom)) return null;
  const b = String(bit);
  if (b !== "0" && b !== "1") return null;
  return `${base}[${b}/${atom}]`;
}

export function parseDefinitionSlot(text) {
  const t = (text || "").trim();
  const m = t.match(new RegExp(`^(${DERIVED_EXPR_NAME_SRC})\\s*=\\s*(.*)$`));
  if (!m) return null;
  return {
    name: m[1],
    rhs: (m[2] || "").trim()
  };
}

export function parseDefinition(text) {
  const slot = parseDefinitionSlot(text);
  if (!slot || !slot.rhs) return null;
  return slot;
}

const APPLY_OPERATOR_ALIASES = new Map([
  ["and", "∧"],
  ["&&", "∧"],
  ["&", "∧"],
  ["∧", "∧"],
  ["nand", "↑"],
  ["↑", "↑"],
  ["⊼", "↑"],
  ["or", "∨"],
  ["||", "∨"],
  ["|", "∨"],
  ["∨", "∨"],
  ["nor", "↓"],
  ["↓", "↓"],
  ["⊽", "↓"],
  ["xor", "⊕"],
  ["^", "⊕"],
  ["⊕", "⊕"],
  ["implies", "→"],
  ["->", "→"],
  ["→", "→"],
  ["iff", "↔"],
  ["<->", "↔"],
  ["↔", "↔"]
]);

const APPLY_OPERATOR_PREFIXES = new Set(
  [...APPLY_OPERATOR_ALIASES.keys()].flatMap((token) =>
    Array.from({ length: token.length }, (_, i) => token.slice(0, i + 1))
  )
);

export function unwrapApplyOperator(raw) {
  const t = (raw || "").trim();
  if (t.startsWith("<") && t.endsWith(">")) {
    return t.slice(1, -1).trim();
  }
  return t;
}

export function canonicalApplyOperator(raw) {
  const t = unwrapApplyOperator(raw).replace(/\s+/g, "").toLowerCase();
  if (!t) return null;
  return APPLY_OPERATOR_ALIASES.get(t) ?? null;
}

export function sanitizeApplyOperatorDraft(raw) {
  const compact = unwrapApplyOperator(raw).replace(/\s+/g, "").toLowerCase();
  if (!compact) return "";

  const canonical = APPLY_OPERATOR_ALIASES.get(compact);
  if (canonical) return canonical;

  for (let len = compact.length; len > 0; len--) {
    const prefix = compact.slice(0, len);
    if (APPLY_OPERATOR_PREFIXES.has(prefix)) return prefix;
  }

  return "";
}

export function parseApplyCall(text) {
  const t = (text || "").trim();
  const m = t.match(
    new RegExp(
      `^apply\\s*\\(\\s*([^,]+?)\\s*,\\s*(${DERIVED_EXPR_NAME_SRC})\\s*,\\s*(${DERIVED_EXPR_NAME_SRC})\\s*\\)$`,
      "i"
    )
  );
  if (!m) return null;
  const op = canonicalApplyOperator(m[1]);
  if (!op) return null;
  return {
    op,
    leftName: m[2],
    rightName: m[3]
  };
}

export function parseRestrictCall(text) {
  const t = (text || "").trim();
  const m = t.match(
    new RegExp(
      `^restrict\\s*\\(\\s*([01])\\s*,\\s*(${BASE_EXPR_NAME_SRC})\\s*,\\s*(${DERIVED_EXPR_NAME_SRC})\\s*\\)$`,
      "i"
    )
  );
  if (!m) return null;
  return {
    bit: Number(m[1]),
    atomName: m[2],
    bddName: m[3]
  };
}

export function formatApplyCall(text) {
  const parsed = parseApplyCall(text);
  if (!parsed) return null;
  return `apply(<${parsed.op}>, ${parsed.leftName}, ${parsed.rightName})`;
}

export function buildDefMap(expressions) {
  const defs = new Map();
  for (const line of expressions) {
    const d = parseDefinition(line.text);
    if (d) defs.set(d.name, d.rhs);
  }
  return defs;
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

export function trimVariablesToLimit(exprText, caret = 0, maxVars = 5) {
  const source = String(exprText || "");
  const identRe = /[A-Za-z_][A-Za-z0-9_]*/g;
  const keywords = new Set(["true", "false"]);
  const tokens = [];

  for (const match of source.matchAll(identRe)) {
    const name = match[0];
    const lower = name.toLowerCase();
    if (keywords.has(lower)) continue;
    tokens.push({
      name,
      start: match.index ?? 0,
      end: (match.index ?? 0) + name.length
    });
  }

  const seen = new Set();
  let overflow = null;
  for (const token of tokens) {
    if (seen.has(token.name)) continue;
    seen.add(token.name);
    if (seen.size > maxVars) {
      overflow = token;
      break;
    }
  }

  const normalizedCaret = Number.isFinite(caret) ? Math.max(0, Math.min(source.length, caret)) : source.length;
  if (!overflow) {
    return {
      exceeded: false,
      text: source,
      caret: normalizedCaret,
      removedVar: null
    };
  }

  const nextText = source.slice(0, overflow.start) + source.slice(overflow.end);
  let nextCaret = normalizedCaret;
  if (nextCaret > overflow.end) nextCaret -= overflow.end - overflow.start;
  else if (nextCaret > overflow.start) nextCaret = overflow.start;
  nextCaret = Math.max(0, Math.min(nextText.length, nextCaret));

  return {
    exceeded: true,
    text: nextText,
    caret: nextCaret,
    removedVar: overflow.name
  };
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

  if (/[∧∨⊕→↔↑↓⊼⊽]$/.test(s)) return false;
  if (/¬$/.test(s)) return false;
  if (/[∧∨⊕→↔↑↓⊼⊽]{2,}/.test(s)) return false;

  return true;
}

function tokenizeBooleanExpr(expr) {
  const s = String(expr || "");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(") {
      out.push({ type: "LPAREN" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      out.push({ type: "RPAREN" });
      i += 1;
      continue;
    }
    if (s.startsWith("<->", i) || s.startsWith("↔", i)) {
      out.push({ type: "IFF" });
      i += s.startsWith("<->", i) ? 3 : 1;
      continue;
    }
    if (s.startsWith("->", i) || s.startsWith("→", i)) {
      out.push({ type: "IMPLIES" });
      i += s.startsWith("->", i) ? 2 : 1;
      continue;
    }
    if (ch === "↑" || ch === "⊼") {
      out.push({ type: "NAND" });
      i += 1;
      continue;
    }
    if (ch === "↓" || ch === "⊽") {
      out.push({ type: "NOR" });
      i += 1;
      continue;
    }
    if (s.startsWith("&&", i) || ch === "&" || ch === "∧") {
      out.push({ type: "AND" });
      i += s.startsWith("&&", i) ? 2 : 1;
      continue;
    }
    if (s.startsWith("||", i) || ch === "|" || ch === "∨") {
      out.push({ type: "OR" });
      i += s.startsWith("||", i) ? 2 : 1;
      continue;
    }
    if (ch === "^" || ch === "⊕") {
      out.push({ type: "XOR" });
      i += 1;
      continue;
    }
    if (ch === "!" || ch === "¬") {
      out.push({ type: "NOT" });
      i += 1;
      continue;
    }
    const ident = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (ident) {
      out.push({ type: "IDENT", value: ident[0] });
      i += ident[0].length;
      continue;
    }
    return null;
  }
  return out;
}

export function isValidBooleanExpression(expr) {
  const tokens = tokenizeBooleanExpr(expr);
  if (!tokens || tokens.length === 0) return false;
  let pos = 0;

  function peek() {
    return tokens[pos] || null;
  }
  function eat(type) {
    if (peek()?.type !== type) return false;
    pos += 1;
    return true;
  }
  function parsePrimary() {
    if (eat("IDENT")) return true;
    if (eat("LPAREN")) {
      if (!parseIff()) return false;
      return eat("RPAREN");
    }
    return false;
  }
  function parseUnary() {
    while (eat("NOT")) {
      // consume chain of unary not
    }
    return parsePrimary();
  }
  function parseAndLike() {
    if (!parseUnary()) return false;
    while (eat("AND") || eat("NAND")) {
      if (!parseUnary()) return false;
    }
    return true;
  }
  function parseOrLike() {
    if (!parseAndLike()) return false;
    while (eat("OR") || eat("NOR")) {
      if (!parseAndLike()) return false;
    }
    return true;
  }
  function parseXor() {
    if (!parseOrLike()) return false;
    while (eat("XOR")) {
      if (!parseOrLike()) return false;
    }
    return true;
  }
  function parseImplies() {
    if (!parseXor()) return false;
    while (eat("IMPLIES")) {
      if (!parseXor()) return false;
    }
    return true;
  }
  function parseIff() {
    if (!parseImplies()) return false;
    while (eat("IFF")) {
      if (!parseImplies()) return false;
    }
    return true;
  }

  if (!parseIff()) return false;
  return pos === tokens.length;
}