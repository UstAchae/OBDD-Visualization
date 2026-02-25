export function getDom() {
  return {
    exprListEl: document.getElementById("exprList"),
    selectedInfo: document.getElementById("selectedInfo"),
    backendInfo: document.getElementById("backendInfo"),

    layersListEl: document.getElementById("layersList"),
    layerAxisEl: document.getElementById("layerAxis"),

    keyboardRoot: document.getElementById("keyboard"),
    btnKbdToggle: document.getElementById("btnKbdToggle"),

    cyContainer: document.getElementById("cy"),

    btnAdd: document.getElementById("btnAdd"),
    btnClearAll: document.getElementById("btnClearAll"),
    btnFit: document.getElementById("btnFit"),

    btnReduce: document.getElementById("btnReduce"),
    btnReduceTerminals: document.getElementById("btnReduceTerminals"),
    btnReduceRedundant: document.getElementById("btnReduceRedundant"),
    btnReduceMerge: document.getElementById("btnReduceMerge"),

    btnApplyAnd: document.getElementById("btnApplyAnd"),
    btnApplyOr: document.getElementById("btnApplyOr"),
    btnApplyXor: document.getElementById("btnApplyXor"),

    btnResetExample: document.getElementById("btnResetExample")
  };
}