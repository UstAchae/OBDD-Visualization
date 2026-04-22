import { sleep } from "../../graph/cy.js";
import {
  focusAndReveal,
  GAP_MS,
  pulseFocus,
  REVEAL_MS,
  revealStepElements,
  snapshotWithHiddenIds,
  splitRevealIds,
  uniqueIds
} from "./apply_expansion_helpers.js";

export async function animateApplyExpansion(cy, branch, nextSnapshot, nextBranch, { setGraph, onAfterEach } = {}) {
  if (!branch || !nextSnapshot) return;

  const revealNodeIds = uniqueIds([branch.revealNodeId].filter(Boolean));
  const lowPrimaryRevealIds = uniqueIds(branch.lowPrimaryRevealIds);
  const lowSecondaryRevealIds = uniqueIds(branch.lowSecondaryRevealIds);
  const highPrimaryRevealIds = uniqueIds(branch.highPrimaryRevealIds);
  const highSecondaryRevealIds = uniqueIds(branch.highSecondaryRevealIds);
  const lowRevealIds = uniqueIds(branch.lowRevealIds);
  const highRevealIds = uniqueIds(branch.highRevealIds);
  const allHideIds = uniqueIds([
    ...revealNodeIds,
    ...lowPrimaryRevealIds,
    ...lowSecondaryRevealIds,
    ...highPrimaryRevealIds,
    ...highSecondaryRevealIds,
    ...lowRevealIds,
    ...highRevealIds
  ]);

  if (branch.phase === "reveal") {
    const previewIds = uniqueIds(nextBranch?.nodeIds?.length ? nextBranch.nodeIds : revealNodeIds);
    await setGraph(snapshotWithHiddenIds(nextSnapshot, previewIds));
    if (previewIds.length) {
      if (previewIds.length >= 2 && (branch.compareIds?.length ?? 0) >= 2) {
        await pulseFocus(cy, [branch.compareIds[0]]);
        revealStepElements(cy, [previewIds[0]]);
        await sleep(REVEAL_MS);

        await pulseFocus(cy, [branch.compareIds[1]]);
        revealStepElements(cy, [previewIds[1]]);
        await sleep(REVEAL_MS);
      } else {
        await pulseFocus(cy, branch.compareIds);
        revealStepElements(cy, previewIds.slice(0, 1));
        await sleep(REVEAL_MS);
        if (previewIds.length > 1) {
          revealStepElements(cy, previewIds.slice(1));
          await sleep(REVEAL_MS);
        }
      }
    }
    await onAfterEach?.(branch);
    return;
  }

  if (branch.phase === "resolve") {
    await pulseFocus(cy, branch.nodeIds);
    const resolvedIds = uniqueIds(nextBranch?.nodeIds?.length ? nextBranch.nodeIds : revealNodeIds);
    await setGraph(snapshotWithHiddenIds(nextSnapshot, resolvedIds));
    if (resolvedIds.length) {
      await sleep(30);
      revealStepElements(cy, resolvedIds);
      await pulseFocus(cy, resolvedIds, REVEAL_MS);
    }
    await onAfterEach?.(branch);
    return;
  }

  if (branch.phase === "expand") {
    const hiddenIds = uniqueIds([
      ...lowPrimaryRevealIds,
      ...lowSecondaryRevealIds,
      ...highPrimaryRevealIds,
      ...highSecondaryRevealIds,
      ...lowRevealIds,
      ...highRevealIds
    ]);
    await setGraph(snapshotWithHiddenIds(nextSnapshot, hiddenIds));
    await sleep(30);

    const lowPrimary = splitRevealIds(lowPrimaryRevealIds.length ? lowPrimaryRevealIds : lowRevealIds);
    const lowSecondary = splitRevealIds(lowSecondaryRevealIds);
    const highPrimary = splitRevealIds(highPrimaryRevealIds.length ? highPrimaryRevealIds : highRevealIds);
    const highSecondary = splitRevealIds(highSecondaryRevealIds);

    revealStepElements(cy, lowPrimary.edgeIds);
    await sleep(REVEAL_MS);

    await focusAndReveal(
      cy,
      branch.lowPrimaryFocusIds?.length ? branch.lowPrimaryFocusIds : branch.lowFocusIds,
      lowPrimary.nodeIds
    );

    if ((branch.lowSecondaryFocusIds?.length ?? 0) > 0 || (branch.lowSecondaryRevealIds?.length ?? 0) > 0) {
      await focusAndReveal(cy, branch.lowSecondaryFocusIds, lowSecondary.nodeIds);
    }

    revealStepElements(cy, highPrimary.edgeIds);
    await sleep(REVEAL_MS);

    await focusAndReveal(
      cy,
      branch.highPrimaryFocusIds?.length ? branch.highPrimaryFocusIds : branch.highFocusIds,
      highPrimary.nodeIds
    );

    if ((branch.highSecondaryFocusIds?.length ?? 0) > 0 || (branch.highSecondaryRevealIds?.length ?? 0) > 0) {
      await focusAndReveal(cy, branch.highSecondaryFocusIds, highSecondary.nodeIds);
    }

    await sleep(GAP_MS);
    revealStepElements(cy, [...lowRevealIds, ...highRevealIds]);
    await sleep(REVEAL_MS);
    await onAfterEach?.(branch);
    return;
  }

  await setGraph(nextSnapshot);
  await onAfterEach?.(branch);
}
