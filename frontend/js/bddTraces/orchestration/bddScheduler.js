export function createBddScheduler({
  state,
  updateBddForActive,
  debounceMs
}) {
  function scheduleBdd() {
    if (state.bddTimer) clearTimeout(state.bddTimer);
    state.bddTimer = setTimeout(() => updateBddForActive(true), debounceMs);
  }

  return {
    scheduleBdd
  };
}
