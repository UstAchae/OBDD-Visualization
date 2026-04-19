export function setupKeyboard(ctx) {
  const { state, dom, cy, axis } = ctx;

  function setKeyboardCollapsed(collapsed) {
    if (!dom.keyboardRoot) return;
    dom.keyboardRoot.classList.toggle("is-collapsed", collapsed);
    if (dom.btnKbdToggle) dom.btnKbdToggle.setAttribute("aria-expanded", String(!collapsed));
    document.body.classList.toggle("kbd-open", !collapsed);
  }

  dom.btnKbdToggle?.addEventListener(
    "pointerdown",
    (ev) => {
      // Keep active expression input focused while toggling keyboard panel.
      ev.preventDefault();
      ev.stopPropagation();
    },
    true
  );

  dom.btnKbdToggle?.addEventListener("click", () => {
    const activeInput =
      state.focusedInput && document.contains(state.focusedInput) ? state.focusedInput : null;
    const start = activeInput?.selectionStart ?? null;
    const end = activeInput?.selectionEnd ?? null;
    const collapsed = dom.keyboardRoot.classList.contains("is-collapsed");
    setKeyboardCollapsed(!collapsed);
    if (activeInput) {
      queueMicrotask(() => {
        if (!document.contains(activeInput)) return;
        activeInput.focus();
        if (start != null && end != null) {
          activeInput.setSelectionRange(start, end);
        }
      });
    }
  });

  const keyboardEl = document.querySelector(".keyboard");
  if (!keyboardEl) return;
  setKeyboardCollapsed(keyboardEl.classList.contains("is-collapsed"));

  function insertToFocused(str) {
    const input = state.focusedInput;
    if (!input || !document.contains(input)) return;

    input.focus();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + str + input.value.slice(end);

    const pos = start + str.length;
    input.setSelectionRange(pos, pos);

    ctx.expr.sanitizeApplyOperatorInput?.(input);
    ctx.expr.onLineChanged(ctx, state.activeIndex, input);
    ctx.expr.maybeAdvanceApplyInput?.(input);
  }

  function insertApplyTemplate() {
    const input = state.focusedInput;
    if (!input || !document.contains(input)) return;

    input.focus();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const template = "apply(<>, , )";
    input.value = input.value.slice(0, start) + template + input.value.slice(end);

    const opStart = start + "apply(<".length;
    input.setSelectionRange(opStart, opStart);
    ctx.expr.onLineChanged(ctx, state.activeIndex, input);
  }

  function insertRestrictTemplate() {
    const input = state.focusedInput;
    if (!input || !document.contains(input)) return;

    input.focus();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const template = "restrict(, , )";
    input.value = input.value.slice(0, start) + template + input.value.slice(end);

    // Initial caret for restrict template should be the 3rd argument slot.
    const bddStart = start + "restrict(, , ".length;
    input.setSelectionRange(bddStart, bddStart);
    ctx.expr.onLineChanged(ctx, state.activeIndex, input);
  }

  function backspaceFocused() {
    const input = state.focusedInput;
    if (!input || !document.contains(input)) return;

    input.focus();
    const aliasDelete = ctx.expr.handleProtectedDerivedNameDelete?.(input, "Backspace");
    if (aliasDelete?.handled) {
      if (aliasDelete.changed) {
        ctx.expr.onLineChanged(ctx, state.activeIndex, input);
      } else {
        ctx.expr.refreshExprUiOnly?.(ctx, state.activeIndex);
      }
      return;
    }
    const protectedResult = ctx.expr.handleProtectedApplyBackspace?.(input);
    if (protectedResult?.handled) {
      if (protectedResult.changed) {
        ctx.expr.onLineChanged(ctx, state.activeIndex, input);
      } else {
        ctx.expr.refreshExprUiOnly?.(ctx, state.activeIndex);
      }
      return;
    }

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    if (start !== end) {
      input.value = input.value.slice(0, start) + input.value.slice(end);
      input.setSelectionRange(start, start);
    } else if (start > 0) {
      input.value = input.value.slice(0, start - 1) + input.value.slice(start);
      input.setSelectionRange(start - 1, start - 1);
    }

    ctx.expr.onLineChanged(ctx, state.activeIndex, input);
  }

  function insertReferencePrefix(prefix) {
    const input = state.focusedInput;
    if (!input || !document.contains(input)) return;
    const text = String(prefix || "");
    if (!text) return;

    input.focus();
    const current = input.value ?? "";
    const existingRefPrefix = current.match(/^\s*([FGH])\s*=\s*/i);
    const nextRefPrefix = text.match(/^\s*([FGH])\s*=\s*/i);
    const existingName = existingRefPrefix?.[1]?.toUpperCase() ?? null;
    const nextName = nextRefPrefix?.[1]?.toUpperCase() ?? null;

    if (existingRefPrefix && nextName && existingName === nextName) {
      const pos = existingRefPrefix[0].length;
      input.setSelectionRange(pos, pos);
      ctx.expr.onLineChanged(ctx, state.activeIndex, input);
      return;
    }

    if (existingRefPrefix) {
      input.value = text + current.slice(existingRefPrefix[0].length);
    } else {
      input.value = text + current;
    }

    const pos = text.length;
    input.setSelectionRange(pos, pos);
    ctx.expr.onLineChanged(ctx, state.activeIndex, input);
  }

  keyboardEl.addEventListener("click", (e) => {
    const key = e.target.closest(".key");
    if (!key) return;

    if (key.dataset.insert) {
      insertToFocused(key.dataset.insert);
      return;
    }

    const action = key.dataset.action;
    if (!action) return;

    if (action === "backspace") backspaceFocused();
    if (action === "insert-apply") insertApplyTemplate();
    if (action === "insert-restrict") insertRestrictTemplate();
    if (action === "insert-ref-f") insertReferencePrefix("F = ");
    if (action === "insert-ref-g") insertReferencePrefix("G = ");
    if (action === "insert-ref-h") insertReferencePrefix("H = ");
  });

  keyboardEl.addEventListener(
    "pointerdown",
    (e) => {
      const key = e.target.closest(".key");
      if (!key) return;
      e.preventDefault();
    },
    true
  );

  document.addEventListener(
    "pointerdown",
    (e) => {
      const insideExpr = e.target.closest(".expr-item");
      const insideKeyboard = e.target.closest(".keyboard");
      const insideCy = e.target.closest("#cy");
      const insideRight = e.target.closest(".right");
      if (insideExpr || insideKeyboard || insideCy || insideRight) return;

      if (state.focusedInput && document.contains(state.focusedInput)) {
        state.focusedInput.blur();
      }
      state.focusedInput = null;
    },
    true
  );
}