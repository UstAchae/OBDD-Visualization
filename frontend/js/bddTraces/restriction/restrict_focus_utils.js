// frontend/js/bddTraces/restriction/restrict_focus_utils.js
export function addFocus(cy, focusIds = []) {
  cy.batch(() => {
    focusIds.forEach((id) => {
      const ele = cy.getElementById(id);
      if (!ele || ele.empty?.()) return;
      if (ele.isEdge?.()) {
        ele.addClass("focus");
        return;
      }
      ele.addClass("focus");
      ele.connectedEdges().addClass("focus");
    });
  });
}

export function clearFocus(cy) {
  cy.batch(() => {
    cy.elements(".focus").removeClass("focus");
  });
}

export function setClassOnElements(elements = [], className, enabled) {
  elements.forEach((ele) => {
    if (!ele || ele.empty?.()) return;
    if (enabled) ele.addClass(className);
    else ele.removeClass(className);
  });
}

export function clearRestrictS1Classes(cy) {
  cy.batch(() => {
    cy.elements(".restrict-s1-target").removeClass("restrict-s1-target");
    cy.elements(".restrict-s1-branch").removeClass("restrict-s1-branch");
    cy.elements(".restrict-s1-child").removeClass("restrict-s1-child");
    cy.elements(".restrict-s1-incoming").removeClass("restrict-s1-incoming");
  });
}
