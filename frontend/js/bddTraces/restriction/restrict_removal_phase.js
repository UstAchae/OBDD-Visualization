import { sleep } from "../../graph/cy.js";
import { DELETE_FADE_MS, DELETE_MARK_MS } from "./restrict_constants.js";

function collectRemovalBundle(cy, focusIds = []) {
  let bundle = cy.collection();
  focusIds.forEach((id) => {
    const ele = cy.getElementById(id);
    if (!ele || ele.empty?.()) return;
    bundle = bundle.union(ele);
    if (!ele.isEdge?.()) bundle = bundle.union(ele.connectedEdges());
  });
  return bundle;
}

function removalMarkStyle(ele) {
  if (ele.isEdge?.()) {
    return {
      width: 6,
      "line-color": "#dc2626",
      "target-arrow-color": "#dc2626"
    };
  }
  return {
    "background-color": "#ef4444",
    "border-color": "#b91c1c",
    color: "#ffffff"
  };
}

async function markRemovalBundle(cy, focusIds = []) {
  const bundle = collectRemovalBundle(cy, focusIds);
  if (!bundle.length) return bundle;
  await Promise.allSettled(
    bundle.map((ele) =>
      ele
        .animation(
          { style: removalMarkStyle(ele) },
          { duration: DELETE_MARK_MS, easing: "ease-in-out" }
        )
        .play()
        .promise()
    )
  );
  await sleep(DELETE_MARK_MS);
  return bundle;
}

export async function playRemovalFadeStep(cy, focusIds = []) {
  const bundle = await markRemovalBundle(cy, focusIds);
  if (!bundle.length) return;
  await Promise.allSettled(
    bundle.map((ele) =>
      ele
        .animation(
          { style: { opacity: 0 } },
          { duration: DELETE_FADE_MS, easing: "ease-in-out" }
        )
        .play()
        .promise()
    )
  );
}
