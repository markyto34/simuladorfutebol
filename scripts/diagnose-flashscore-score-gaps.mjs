#!/usr/bin/env node
/**
 * Diagnóstico read-only de jogos com resultado final ausente no CSV.
 * Não grava ficheiros nem altera os CSVs.
 */
const PROXY = (process.env.FLASHSCORE_PROXY_URL || "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev").replace(/\/$/, "");
const SAMPLES = [
  { id: "Mody8Bv0", label: "Ath. Bilbao - Real Sociedad (Terminado; xG presente)" },
  { id: "YH3Da9XP", label: "St. Pauli - Nurnberg (Terminado; xG presente)" },
  { id: "6kG2UUUq", label: "Hwacheon F - April F (Terminado; AFC feminino)" },
  { id: "C0jJWeam", label: "1.FC Nurnberg F - Eintracht Frankfurt F (estado vazio)" },
  { id: "IPPZATYR", label: "Corinthians F - Cruzeiro F (xG presente; estado vazio)" }
];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
for (let i = 0; i < SAMPLES.length; i++) {
  const sample = SAMPLES[i];
  const response = await fetch(PROXY + "/inspect?id=" + encodeURIComponent(sample.id), {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(60_000)
  });
  if (response.status === 403 || response.status === 429) {
    console.log("[STOP] Flashscore recusou/limitou o diagnóstico (HTTP " + response.status + ").");
    process.exitCode = 1;
    break;
  }
  if (!response.ok) {
    console.log("[ERROR] " + sample.id + " HTTP " + response.status);
    process.exitCode = 1;
    continue;
  }
  const payload = await response.json();
  const inspection = payload.inspection || {};
  const record = inspection.match_record || {};
  console.log("[SAMPLE] " + JSON.stringify({
    id: sample.id,
    label: sample.label,
    title: inspection.title,
    teams: record.teams,
    status: record.status,
    score: record.score,
    period_scores: inspection.period_scores,
    score_candidates: inspection.score_candidates,
    score_evidence: (inspection.score_evidence || []).slice(0, 12),
    score_related_attributes: (inspection.score_related_attributes || []).slice(0, 12),
    score_contexts: (inspection.score_contexts || []).slice(0, 12)
  }));
  if (i < SAMPLES.length - 1) await wait(1_500);
}
