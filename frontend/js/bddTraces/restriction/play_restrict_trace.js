// frontend/js/bddTraces/restriction/play_restrict_trace.js
import { sleep, smoothFit } from "../../graph/cy.js";
import {
  FINAL_FIT_MS,
  HIGHLIGHT_MS,
  STEP_FIT_MS,
  STEP_SETTLE_MS
} from "./restrict_constants.js";
import { addFocus, clearFocus } from "./restrict_focus_utils.js";
import { playRedirectStep } from "./restrict_redirect_phase.js";
import { playRemovalFadeStep } from "./restrict_removal_phase.js";

export async function playRestrictTrace(
  cy,
  step,
  { setGraph, onAfterEach, stepIndex = 0, stepsLen = 1, isFinalStep = false, skipIntroHighlight = false } = {}
) {
  const snap = step?.snapshot;
  if (!snap) return;

  if (!skipIntroHighlight) {
    clearFocus(cy);
    addFocus(cy, step.focus ?? []);
    await sleep(HIGHLIGHT_MS);
    clearFocus(cy);
  }

  if (stepIndex === 0) {
    await playRedirectStep(cy, step, stepIndex);
  } else {
    await playRemovalFadeStep(cy, step.focus ?? []);
    clearFocus(cy);
  }

  await setGraph(snap, step);
  await smoothFit(cy, undefined, { padding: 30, duration: isFinalStep ? FINAL_FIT_MS : STEP_FIT_MS });
  await sleep(STEP_SETTLE_MS);
  await sleep(0);
  await onAfterEach?.(step, { stepIndex, stepsLen });
}
