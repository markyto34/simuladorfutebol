#!/usr/bin/env node
/**
 * Publica um estado compacto do backfill Flashscore na branch pública de monitorização.
 * O ficheiro é separado do progresso da recolha diária.
 */
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (!token || !repository) {
  console.warn("[BACKFILL MONITOR] Sem GITHUB_TOKEN/GITHUB_REPOSITORY; publicação ignorada.");
  process.exit(0);
}
let patch = {};
try { patch = JSON.parse(process.env.FLASHSCORE_BACKFILL_PROGRESS_PATCH || "{}"); }
catch { throw new Error("FLASHSCORE_BACKFILL_PROGRESS_PATCH não contém JSON válido."); }
const branch = "collection-progress";
const path = "monitor/season-backfill-progress.json";
const api = "https://api.github.com/repos/" + repository;
const headers = {
  "Accept": "application/vnd.github+json",
  "Authorization": "Bearer " + token,
  "X-GitHub-Api-Version": "2022-11-28"
};
const request = (url, options = {}) => fetch(url, {
  ...options,
  headers: { ...headers, ...(options.headers || {}) },
  signal: AbortSignal.timeout(15000)
});
async function ensureBranch() {
  const response = await request(api + "/git/ref/heads/" + branch);
  if (response.ok) return;
  if (response.status !== 404) throw new Error("Consulta da branch falhou: HTTP " + response.status);
  const created = await request(api + "/git/refs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "refs/heads/" + branch, sha: process.env.GITHUB_SHA })
  });
  if (!created.ok && created.status !== 422) throw new Error("Criação da branch falhou: HTTP " + created.status);
}
await ensureBranch();
for (let attempt = 1; attempt <= 5; attempt++) {
  const current = await request(api + "/contents/" + path + "?ref=" + branch);
  let existing = {}, sha;
  if (current.ok) {
    const file = await current.json();
    sha = file.sha;
    try { existing = JSON.parse(Buffer.from(file.content, "base64").toString("utf8")); } catch {}
  } else if (current.status !== 404) {
    throw new Error("Leitura do estado anterior falhou: HTTP " + current.status);
  }
  const payload = { ...existing, ...patch, updated_at: new Date().toISOString() };
  const saved = await request(api + "/contents/" + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Atualizar monitor do backfill Flashscore",
      content: Buffer.from(JSON.stringify(payload, null, 2) + "\n").toString("base64"),
      branch,
      ...(sha ? { sha } : {})
    })
  });
  if (saved.ok) {
    console.log("[BACKFILL MONITOR] Estado publicado: " + (payload.competitions_completed || 0) + "/" + (payload.total_competitions || 0) + " competições; fase=" + (payload.phase || "—") + ".");
    process.exit(0);
  }
  if (![409, 422].includes(saved.status) || attempt === 5) {
    throw new Error("Publicação do estado falhou: HTTP " + saved.status + " " + await saved.text());
  }
  await new Promise(resolve => setTimeout(resolve, 800 * attempt));
}
