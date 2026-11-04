#!/usr/bin/env node
/**
 * Diagnóstico read-only para perceber se o Flashscore expõe xG em competições
 * onde o CSV tem remates/cantos, mas não xG.
 */
const PROXY = (process.env.FLASHSCORE_PROXY_URL || "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev").replace(/\/$/, "");
const SAMPLES = [
  { id: "WUYYsb5m", competition: "Escócia · Taça Challenge" },
  { id: "lKduuNgf", competition: "Inglaterra · National League Cup" },
  { id: "fiWPgRgt", competition: "Japão · J2 League" },
  { id: "r5MmBZEF", competition: "Portugal · Campeonato de Portugal" },
  { id: "G0J5d20m", competition: "Espanha · Segunda RFEF" }
];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

for (let i = 0; i < SAMPLES.length; i++) {
  const sample = SAMPLES[i];
  const response = await fetch(PROXY + "/record?id=" + encodeURIComponent(sample.id), {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(45_000)
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
  const record = payload.record || {};
  const stats = record.statistics || {};
  const context = (record.source_capture?.evidence || []).find(item => item.field === "page_context") || {};
  console.log("[XG-SAMPLE] " + JSON.stringify({
    id: sample.id,
    competition: sample.competition,
    teams: record.teams,
    statisticsKeys: Object.keys(stats),
    statistics: stats,
    xgKeys: Object.keys(stats).filter(key => /xg|expected/i.test(key)),
    pageEvidence: context.evidence || [],
    diagnostics: context.diagnostics || []
  }));
  if (i < SAMPLES.length - 1) await wait(1_000);
}
