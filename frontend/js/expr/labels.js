import { canonicalApplyOperator } from "./defs.js";

function stripOuterParens(text) {
  let s = (text || "").trim();
  let changed = true;
  while (changed && s.startsWith("(") && s.endsWith(")")) {
    changed = false;
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      if (depth === 0 && i < s.length - 1) {
        wraps = false;
        break;
      }
      if (depth < 0) {
        wraps = false;
        break;
      }
    }
    if (wraps) {
      s = s.slice(1, -1).trim();
      changed = true;
    }
  }
  return s;
}

function canonicalOperatorLabel(raw) {
  return canonicalApplyOperator(raw) ?? "<>";
}

function applyBadgeLabel(text) {
  const m = (text || "").trim().match(/^apply\s*\(\s*([^,\)]*)/i);
  if (!m) return "apply";
  return canonicalOperatorLabel(m[1]);
}

export function topLevelOperatorLabel(text) {
  const s = stripOuterParens(text);
  if (!s) return "?";
  if (/^apply\s*\(/i.test(s)) return applyBadgeLabel(s);
  if (/^restrict\s*\(/i.test(s)) return "restrict";

  const groups = [
    [{ token: "<->", label: "↔" }, { token: "↔", label: "↔" }],
    [{ token: "->", label: "→" }, { token: "→", label: "→" }],
    [{ token: "^", label: "⊕" }, { token: "⊕", label: "⊕" }],
    [{ token: "||", label: "∨" }, { token: "|", label: "∨" }, { token: "∨", label: "∨" }, { token: "↓", label: "↓" }, { token: "⊽", label: "↓" }],
    [{ token: "&&", label: "∧" }, { token: "&", label: "∧" }, { token: "∧", label: "∧" }, { token: "↑", label: "↑" }, { token: "⊼", label: "↑" }]
  ];

  for (const group of groups) {
    let depth = 0;
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (ch === "(") {
        depth += 1;
        continue;
      }
      if (ch === ")") {
        depth -= 1;
        continue;
      }
      if (depth !== 0) continue;
      for (const { token, label } of group) {
        if (s.startsWith(token, i)) return label;
      }
    }
  }

  if (s.startsWith("¬") || s.startsWith("!")) return "¬";
  return s.slice(0, 3);
}
