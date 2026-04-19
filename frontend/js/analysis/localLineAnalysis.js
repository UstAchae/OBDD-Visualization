export function createLocalLineAnalyzer({
  getExpressions,
  parseDefinitionSlot,
  isDerivedExprName,
  isRestrictDerivedAliasName,
  makeRestrictDerivedName,
  parseApplyCall,
  parseRestrictCall,
  buildDefMap,
  inferVars,
  isValidBooleanExpression
}) {
  function collectDefinitionSlots() {
    const slots = new Map();
    getExpressions().forEach((line, idx) => {
      const slot = parseDefinitionSlot(line.text);
      if (slot) slots.set(slot.name, { ...slot, idx });
    });
    return slots;
  }

  function collectDefinitionNameCounts() {
    const counts = new Map();
    getExpressions().forEach((line) => {
      const slot = parseDefinitionSlot(line.text);
      if (!slot?.name) return;
      counts.set(slot.name, (counts.get(slot.name) ?? 0) + 1);
    });
    return counts;
  }

  function restrictExprByAtom(exprText, atomName, bit) {
    const src = String(exprText ?? "");
    const atom = String(atomName ?? "");
    if (!src.trim() || !atom) return src;
    const replacement = bit ? "true" : "false";

    const tokenRe = /[A-Za-z_][A-Za-z0-9_]*/g;
    let out = "";
    let last = 0;
    let m = tokenRe.exec(src);
    while (m) {
      const start = m.index;
      const end = tokenRe.lastIndex;
      out += src.slice(last, start);
      out += m[0] === atom ? replacement : m[0];
      last = end;
      m = tokenRe.exec(src);
    }
    out += src.slice(last);
    return out;
  }

  function expandExprTextByDefs(exprText, defs, visiting = new Set()) {
    const src = String(exprText ?? "");
    if (!src.trim()) return src;

    const tokenRe = /[A-Za-z_][A-Za-z0-9_]*/g;
    let out = "";
    let last = 0;
    let m = tokenRe.exec(src);
    while (m) {
      const token = m[0];
      const start = m.index;
      const end = tokenRe.lastIndex;
      out += src.slice(last, start);
      if (defs.has(token)) {
        const expanded = expandDefinedExpr(token, defs, visiting);
        out += expanded ? `(${expanded})` : token;
      } else {
        out += token;
      }
      last = end;
      m = tokenRe.exec(src);
    }
    out += src.slice(last);
    return out;
  }

  function expandDefinedExpr(name, defs, visiting = new Set()) {
    if (!defs.has(name)) return null;
    if (visiting.has(name)) return null;
    const raw = (defs.get(name) || "").trim();
    if (!raw) return null;

    const nextVisiting = new Set(visiting);
    nextVisiting.add(name);
    const parsed = parseApplyCall(raw);
    if (!parsed) {
      const parsedRestrict = parseRestrictCall(raw);
      if (!parsedRestrict) return expandExprTextByDefs(raw, defs, nextVisiting);
      const base = expandDefinedExpr(parsedRestrict.bddName, defs, nextVisiting);
      if (!base) return null;
      return restrictExprByAtom(base, parsedRestrict.atomName, parsedRestrict.bit === 1);
    }

    const left = expandDefinedExpr(parsed.leftName, defs, nextVisiting);
    const right = expandDefinedExpr(parsed.rightName, defs, nextVisiting);
    if (!left || !right) return null;
    return `((${left}) ${parsed.op} (${right}))`;
  }

  function analyzeLineLocal(idx) {
    const expressions = getExpressions();
    const active = expressions[idx];
    const raw = (active?.text || "").trim();
    if (!raw) return { ok: false, reason: "empty", kind: "empty", raw };

    const looseDef = raw.match(/^(.+?)\s*=\s*(.*)$/);
    if (looseDef) {
      const lhs = String(looseDef[1] || "").trim();
      const rhs = String(looseDef[2] || "").trim();
      if (!isDerivedExprName(lhs)) {
        return {
          ok: false,
          reason: "invalid_name",
          kind: "definition",
          raw,
          invalidName: lhs,
          body: rhs
        };
      }
    }

    const slot = parseDefinitionSlot(raw);
    if (slot && !slot.rhs) {
      return { ok: false, reason: "empty_definition", kind: "definition", raw, slot };
    }
    if (slot?.name) {
      const nameCounts = collectDefinitionNameCounts();
      if ((nameCounts.get(slot.name) ?? 0) > 1) {
        return {
          ok: false,
          reason: "duplicate_name",
          kind: "definition",
          raw,
          slot,
          duplicateName: slot.name
        };
      }
    }

    const body = slot ? slot.rhs : raw;
    const apply = parseApplyCall(body);
    const restrict = parseRestrictCall(body);
    const applyLike = /^apply\s*\(/i.test(body);
    const restrictLike = /^restrict\s*\(/i.test(body);

    if (slot && isRestrictDerivedAliasName(slot.name) && !restrictLike) {
      return {
        ok: false,
        reason: "invalid_name",
        kind: "definition",
        raw,
        slot,
        body
      };
    }

    if (slot && isRestrictDerivedAliasName(slot.name) && restrict) {
      const expectedName = makeRestrictDerivedName(
        restrict.bddName,
        restrict.bit,
        restrict.atomName
      );
      if (!expectedName || expectedName !== slot.name) {
        return {
          ok: false,
          reason: "invalid_name",
          kind: "definition",
          raw,
          slot,
          body,
          restrict,
          expectedName
        };
      }
    }

    if (apply) {
      const defs = buildDefMap(expressions);
      const slots = collectDefinitionSlots();
      const names = [apply.leftName, apply.rightName];
      const missingNames = names.filter((name) => !defs.has(name));
      const incompleteNames = names.filter((name) => slots.has(name) && !defs.has(name));
      const creatableNames = names.filter((name) => !slots.has(name));

      if (missingNames.length > 0) {
        return {
          ok: false,
          reason: "apply_missing_defs",
          kind: "apply",
          raw,
          slot,
          body,
          apply,
          missingNames,
          incompleteNames,
          creatableNames
        };
      }

      const expr1 = expandDefinedExpr(apply.leftName, defs);
      const expr2 = expandDefinedExpr(apply.rightName, defs);
      if (!expr1 || !expr2) {
        return {
          ok: false,
          reason: "apply_unresolvable_defs",
          kind: "apply",
          raw,
          slot,
          body,
          apply,
          missingNames: [],
          incompleteNames: [],
          creatableNames: []
        };
      }
      return {
        ok: true,
        kind: "apply",
        raw,
        slot,
        body,
        apply,
        expr1,
        expr2
      };
    }

    if (restrict) {
      const defs = buildDefMap(expressions);
      const slots = collectDefinitionSlots();
      const missingNames = defs.has(restrict.bddName) ? [] : [restrict.bddName];
      const incompleteNames = slots.has(restrict.bddName) && !defs.has(restrict.bddName) ? [restrict.bddName] : [];
      const creatableNames = slots.has(restrict.bddName) ? [] : [restrict.bddName];

      if (missingNames.length > 0) {
        return {
          ok: false,
          reason: "restrict_missing_defs",
          kind: "restrict",
          raw,
          slot,
          body,
          restrict,
          missingNames,
          incompleteNames,
          creatableNames
        };
      }

      const baseExpr = expandDefinedExpr(restrict.bddName, defs);
      if (!baseExpr) {
        return {
          ok: false,
          reason: "restrict_unresolvable_defs",
          kind: "restrict",
          raw,
          slot,
          body,
          restrict,
          missingNames: [],
          incompleteNames: [],
          creatableNames: []
        };
      }

      const baseVars = inferVars(baseExpr);
      if (baseVars.length === 0) {
        return {
          ok: false,
          reason: "restrict_constant_input_forbidden",
          kind: "restrict",
          raw,
          slot,
          body,
          restrict,
          missingNames: [],
          incompleteNames: [],
          creatableNames: []
        };
      }
      if (!baseVars.includes(restrict.atomName)) {
        return {
          ok: false,
          reason: "restrict_atom_missing_in_expr",
          kind: "restrict",
          raw,
          slot,
          body,
          restrict,
          missingNames: [],
          incompleteNames: [],
          creatableNames: []
        };
      }

      const expr = restrictExprByAtom(baseExpr, restrict.atomName, restrict.bit === 1);
      return {
        ok: true,
        kind: "restrict",
        raw,
        slot,
        body,
        restrict,
        baseExpr,
        expr
      };
    }

    if (applyLike) {
      return { ok: false, reason: "apply_incomplete", kind: "apply", raw, slot, body };
    }

    if (restrictLike) {
      return { ok: false, reason: "restrict_incomplete", kind: "restrict", raw, slot, body };
    }

    if (!isValidBooleanExpression(body)) {
      return {
        ok: false,
        reason: "invalid_boolean_expression",
        kind: slot ? "definition" : "expr",
        raw,
        slot,
        body
      };
    }
    if (slot && inferVars(body).includes(slot.name)) {
      return {
        ok: false,
        reason: "self_reference_definition",
        kind: "definition",
        raw,
        slot,
        body
      };
    }

    const defs = buildDefMap(expressions);
    const expandedExpr = expandExprTextByDefs(body, defs);
    return {
      ok: true,
      kind: "expr",
      raw,
      slot,
      body,
      expr: expandedExpr
    };
  }

  return {
    analyzeLineLocal
  };
}
