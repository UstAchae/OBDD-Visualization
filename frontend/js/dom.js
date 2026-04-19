export function getDom() {
  return {
    mainEl: document.querySelector(".main"),
    leftEl: document.querySelector(".left"),
    leftDrawerToggleEl: document.getElementById("leftDrawerToggle"),
    leftDrawerRestoreEl: document.getElementById("leftDrawerRestore"),
    resizerEl: document.getElementById("resizer"),
    exprListEl: document.getElementById("exprList"),

    layerAxisEl: document.getElementById("layerAxis"),

    keyboardRoot: document.getElementById("keyboard"),
    btnKbdToggle: document.getElementById("btnKbdToggle"),

    cyWrapEl: document.querySelector(".cy-wrap"),
    cyContainer: document.getElementById("cy"),

    btnAdd: document.getElementById("btnAdd"),

    btnReduce: document.getElementById("btnReduce"),
    btnApplyToggle: document.getElementById("btnApplyToggle"),
    bddBarLabel: document.getElementById("bddBarLabel"),
    btnReduceTerminals: document.getElementById("btnReduceTerminals"),
    btnReduceRedundant: document.getElementById("btnReduceRedundant"),
    btnReduceMerge: document.getElementById("btnReduceMerge"),
    btnLayout: document.getElementById("btnLayout")
  };
}