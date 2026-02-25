export async function postJson(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return resp;
}

export async function fetchTruthTable(expr, vars) {
  return postJson("/api/truth-table", { expr, vars });
}

export async function fetchBdd(expr, vars) {
  return postJson("/api/bdd", { expr, vars });
}