#!/usr/bin/env node
/**
 * Backfill conservador de resultados finais nos registos já existentes.
 * Consulta apenas IDs que já constam do CSV e nunca acrescenta linhas.
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";

const PROXY = (process.env.FLASHSCORE_PROXY_URL || "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev").replace(/\/$/, "");
const STATS_FILE = resolve("data/flashscore-statistics.csv");
const REQUEST_TIMEOUT_MS = 45_000;
const REQUEST_INTERVAL_MS = 600;
const CONCURRENCY = 3;
const NOT_PLAYED = /^(adiado|cancelado|interrompido|atrasado|não iniciado)$/i;

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  text = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some(value => value !== "")) rows.push(row); }
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows.shift().map(value => value.trim());
  return { headers, records: rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) };
}

export function toCsv(headers, records) {
  const cell = value => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return [headers.join(","), ...records.map(record => headers.map(key => cell(record[key])).join(","))].join("\n") + "\n";
}

const blank = value => String(value ?? "").trim() === "";
const dateKey = value => String(value || "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function eligibleRows(rows) {
  return rows.filter(row => row.match_id && (blank(row.score_home) || blank(row.score_away)) && !NOT_PLAYED.test(String(row.status || "").trim()));
}

export function applyScoreUpdate(row, record) {
  if (!record || record.match_id !== row.match_id) return { updated: false, reason: "match_id_mismatch" };
  if (normalize(record.teams?.home?.name) !== normalize(row.home_team) ||
      normalize(record.teams?.away?.name) !== normalize(row.away_team)) {
    return { updated: false, reason: "team_identity_mismatch" };
  }
  if (dateKey(record.date_time_iso_local || record.date_time) !== dateKey(row.date_time)) {
    return { updated: false, reason: "date_mismatch" };
  }
  const score = record.score?.full_time;
  if (!Number.isInteger(score?.home) || !Number.isInteger(score?.away) ||
      score.home < 0 || score.away < 0 || score.home > 99 || score.away > 99) {
    return { updated: false, reason: "validated_full_time_unavailable" };
  }
  let changed = false;
  if (blank(row.score_home)) { row.score_home = String(score.home); changed = true; }
  if (blank(row.score_away)) { row.score_away = String(score.away); changed = true; }
  if (blank(row.status) && !blank(record.status)) { row.status = String(record.status); changed = true; }
  return { updated: changed, reason: changed ? "filled" : "already_complete" };
}

async function writeAtomic(path, content) {
  const temp = path + ".score-backfill-tmp";
  await writeFile(temp, content, "utf8");
  await rename(temp, path);
}

export async function runBackfill({ apply = false, fetchImpl = fetch, sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms)) } = {}) {
  const source = await readFile(STATS_FILE, "utf8");
  const csv = parseCsv(source);
  for (const field of ["match_id", "date_time", "home_team", "away_team", "status", "score_home", "score_away"]) {
    if (!csv.headers.includes(field)) throw new Error("CSV de estatísticas sem coluna obrigatória: " + field);
  }
  if (!csv.records.length) throw new Error("CSV de estatísticas vazio; operação cancelada.");
  const originalCount = csv.records.length;
  const targets = eligibleRows(csv.records);
  let nextStartAt = 0, nextIndex = 0, stopError = null;
  const updates = new Map();
  const skipped = { not_played: csv.records.filter(row => (blank(row.score_home) || blank(row.score_away)) && NOT_PLAYED.test(String(row.status || "").trim())).length,
    validated_score_unavailable: 0, team_identity_mismatch: 0, date_mismatch: 0, match_id_mismatch: 0 };

  async function throttle() {
    const now = Date.now();
    const startAt = Math.max(now, nextStartAt);
    nextStartAt = startAt + REQUEST_INTERVAL_MS;
    if (startAt > now) await sleep(startAt - now);
  }

  async function worker() {
    while (!stopError) {
      const index = nextIndex++;
      if (index >= targets.length) return;
      const row = targets[index];
      try {
        await throttle();
        if (stopError) return;
        const response = await fetchImpl(PROXY + "/record?id=" + encodeURIComponent(row.match_id), {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        if (response.status === 403 || response.status === 429) {
          stopError = new Error("Flashscore recusou/limitou a recolha (HTTP " + response.status + "). Nenhum CSV foi alterado.");
          return;
        }
        if (!response.ok) {
          skipped.validated_score_unavailable++;
          console.log("[SKIP] " + row.match_id + " HTTP " + response.status);
          continue;
        }
        const payload = await response.json();
        const result = applyScoreUpdate(row, payload?.record);
        if (result.updated) {
          updates.set(row.match_id, row);
          console.log("[OK] " + row.match_id + " " + row.home_team + " " + row.score_home + "-" + row.score_away + " " + (row.status || ""));
        } else {
          const key = result.reason === "validated_full_time_unavailable" ? "validated_score_unavailable" :
            result.reason === "team_identity_mismatch" ? "team_identity_mismatch" :
            result.reason === "date_mismatch" ? "date_mismatch" : "match_id_mismatch";
          skipped[key]++;
          console.log("[SKIP] " + row.match_id + " " + result.reason);
        }
      } catch (error) {
        stopError = error;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()));
  if (stopError) throw stopError;
  if (csv.records.length !== originalCount || new Set(csv.records.map(row => row.match_id)).size !== originalCount) {
    throw new Error("Contagem/identidade das linhas mudou inesperadamente; nenhum CSV foi escrito.");
  }
  const summary = {
    mode: apply ? "apply" : "dry-run",
    existingRows: originalCount,
    queriedExistingMatches: targets.length,
    scoresOrStatusesUpdated: updates.size,
    skipped
  };
  console.log("[SUMMARY] " + JSON.stringify(summary));
  if (apply && updates.size) {
    await writeAtomic(STATS_FILE, toCsv(csv.headers, csv.records));
    console.log("[WRITE] Atualizados apenas resultados/estados em linhas existentes; nenhuma linha foi acrescentada ou removida.");
  } else if (!apply) {
    console.log("[DRY-RUN] Nenhuma alteração gravada.");
  }
  return summary;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(new URL(import.meta.url).pathname)) {
  runBackfill({ apply: process.argv.includes("--apply") }).catch(error => {
    console.error("[ERROR] " + (error?.stack || error));
    process.exitCode = 1;
  });
}
