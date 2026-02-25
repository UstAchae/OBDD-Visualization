export function createState() {
  return {
    apList: ["p", "q", "r", "s"],
    expressions: [{ id: crypto.randomUUID(), text: "", order: [] }],
    activeIndex: 0,
    selectedForApply: new Set(),
    focusedInput: null,
    ttTimer: null,
    bddTimer: null,
    lastBddPayload: null,
    lastBddElements: null,
    bddReqSeq: 0
  };
}