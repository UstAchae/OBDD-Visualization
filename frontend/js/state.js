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

    baseBddElements: null,   // NEW: unreduced graph from /api/bdd
    lastBddElements: null,   // view graph (may be reduced)

    bddReqSeq: 0,
    appliedReduce: [],
    isReducing: false,
    lastRequestedKey: null,
    userX: new Map(),
  };
}