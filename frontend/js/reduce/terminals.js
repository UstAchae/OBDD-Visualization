// frontend/js/reduce/terminals.js
import { sleep, terminalTargets } from "../graph/cy.js";

const HIGHLIGHT_MS = 420;
const MOVE_MS = 520;

export async function playReduceTerminalsTrace(
  cy,
  trace,
  { setGraph, onAfterEach, ctx } = {}
) {
  const vars = ctx?.vars ?? [];
  const steps = trace?.steps ?? [];
  if (!steps.length) return;

  // IMPORTANT:
  // initial 已经由 runReduceTrace 画出来了，这里不重复画

  // We will animate ONCE, then jump straight to final snapshot.
  const finalStep = steps.at(-1);
  const finalSnap = finalStep?.snapshot;
  if (!finalSnap) return;

  // collect terminals on CURRENT graph (initial)
  const terms = cy.nodes().filter((n) => {
    const lab = String(n.data("label") ?? "");
    return n.hasClass("terminal") || lab === "0" || lab === "1";
  });

  const zeros = terms.filter((n) => String(n.data("label")) === "0");
  const ones  = terms.filter((n) => String(n.data("label")) === "1");

  // highlight both at once
  cy.batch(() => {
    zeros.addClass("term-hi-0");
    ones.addClass("term-hi-1");
  });

  await sleep(HIGHLIGHT_MS);

  // move both at once
  const { X0, X1, YT } = terminalTargets(cy, vars, { pad: 70, gap: 160, layerGap: 120 });
  zeros.forEach((n) => n.animate({ position: { x: X0, y: YT } }, { duration: MOVE_MS }));
  ones.forEach((n) => n.animate({ position: { x: X1, y: YT } }, { duration: MOVE_MS }));

  await sleep(MOVE_MS);

  // remove highlight
  cy.batch(() => {
    zeros.removeClass("term-hi-0");
    ones.removeClass("term-hi-1");
  });

  // NOW apply final snapshot only (so 1 will not "bounce back")
  await setGraph(finalSnap);
  await sleep(0);

  // if you want, report completion as the final step
  await onAfterEach?.(finalStep, { stepIndex: steps.length - 1, stepsLen: steps.length });
}