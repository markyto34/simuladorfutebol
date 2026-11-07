#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadSelectedCompetitionPairs, filterMatchIdsToSelectedCompetitions } from "./collect-flashscore-csv.mjs";

const STATS_FILE = resolve(process.env.FLASHSCORE_STATS_FILE || "data/flashscore-statistics.csv");
const PROGRESS_FILE = resolve("data/flashscore-selected-indicators-backfill-progress.json");
const COLLECTOR = resolve("scripts/collect-flashscore-csv.mjs");
const BATCH_SIZE = 200;
const DEFAULT_LIMIT = 500;

// Apenas os nove indicadores escolhidos para o simulador, mais os resultados FT/HT/ST.
export const REQUIRED_PAIRS = [
  "shots", "shots_on_target", "corners", "corners_ht", "corners_st",
  "yellow_cards", "red_cards", "blocked_shots", "fouls"
];
export const REQUIRED_SCORE_FIELDS = [
  "score_home", "score_away", "ht_home", "ht_away", "sh_home", "sh_away"
];

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  text = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some(value => value !== "")) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(value => value.trim());
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const blank = value => String(value ?? "").trim() === "";
function dateKey(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const pt = text.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return pt ? pt[3] + "-" + pt[2] + "-" + pt[1] : "";
}
const FINAL_STATUS = /(terminad|tempo final|finalizad|depois de prolongamento|ap[oó]s prolongamento|a\.p\.|finished|full time|\bft\b)/i;
function needsSelectedIndicators(row) {
  return REQUIRED_SCORE_FIELDS.some(field => blank(row[field])) ||
    REQUIRED_PAIRS.some(key => blank(row[key + "_home"]) || blank(row[key + "_away"]));
}
function isFinished(row) {
  return (!blank(row.score_home) && !blank(row.score_away)) || FINAL_STATUS.test(String(row.status || ""));
}
export function selectRowsNeedingSelectedIndicators(rows, startDate, endDate, selectedPairs, attemptedIds = [], limit = 0) {
  const attempted = new Set(attemptedIds);
  const identities = Object.fromEntries(rows.map(row => [row.match_id, {
    status: "identified", country: row.country, competition: row.competition
  }]));
  const validIds = filterMatchIdsToSelectedCompetitions(
    rows.filter(row => {
      const date = dateKey(row.date_time);
      return /^[A-Za-z0-9]{6,16}$/.test(String(row.match_id || "")) &&
        date >= startDate && date <= endDate &&
        isFinished(row) &&
        needsSelectedIndicators(row) && !attempted.has(row.match_id);
    }).map(row => row.match_id),
    identities,
    selectedPairs
  );
  const byId = new Map(rows.map(row => [row.match_id, row]));
  const selected = validIds.map(id => byId.get(id)).filter(Boolean);
  const n = Number(limit);
  return Number.isInteger(n) && n > 0 ? selected.slice(0, n) : selected;
}

async function readProgress(startDate, endDate) {
  try {
    const value = JSON.parse(await readFile(PROGRESS_FILE, "utf8"));
    return value.start_date === startDate && value.end_date === endDate
      ? value : { start_date: startDate, end_date: endDate, attempted_ids: [] };
  } catch {
    return { start_date: startDate, end_date: endDate, attempted_ids: [] };
  }
}
async function saveProgress(progress) {
  await writeFile(PROGRESS_FILE, JSON.stringify({
    ...progress, updated_at: new Date().toISOString()
  }, null, 2) + "\n", "utf8");
}

async function main() {
  const args = process.argv.slice(2);
  const startDate = args.find(arg => arg.startsWith("--start-date="))?.slice(13);
  const endDate = args.find(arg => arg.startsWith("--end-date="))?.slice(11);
  const limit = Number(args.find(arg => arg.startsWith("--limit="))?.slice(8) || DEFAULT_LIMIT);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "") || endDate < startDate) {
    throw new Error("Intervalo inválido; usa --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD.");
  }
  const rows = parseCsv(await readFile(STATS_FILE, "utf8"));
  if (!rows.length) throw new Error("CSV de estatísticas vazio.");
  const { selectedPairs, selectedPaths } = await loadSelectedCompetitionPairs();
  const progress = await readProgress(startDate, endDate);
  const selected = selectRowsNeedingSelectedIndicators(rows, startDate, endDate, selectedPairs, progress.attempted_ids, limit);
  const totalRemaining = selectRowsNeedingSelectedIndicators(rows, startDate, endDate, selectedPairs, progress.attempted_ids, 0).length;
  console.log("[SELECTED INDICATORS] Competições selecionadas: " + selectedPaths.size + "; jogos pendentes: " + totalRemaining + "; nesta execução: " + selected.length + ".");
  if (!selected.length) {
    console.log("[SELECTED INDICATORS SUMMARY] Não existem mais jogos elegíveis com indicadores em falta neste intervalo.");
    await saveProgress({ ...progress, completed: true, remaining: 0 });
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,
      "\n## Recuperação de indicadores Flashscore\n\n- Jogos pendentes: **0**\n- Competições selecionadas: **" + selectedPaths.size + "**\n", { flag: "a" });
    return;
  }

  let processed = 0;
  for (let offset = 0; offset < selected.length; offset += BATCH_SIZE) {
    const batch = selected.slice(offset, offset + BATCH_SIZE);
    const result = spawnSync(process.execPath, [COLLECTOR, "--recovery-batch", "--stats-only", ...batch.map(row => row.match_id)], {
      stdio: "inherit",
      env: {
        ...process.env,
        FLASHSCORE_REQUEST_DELAY_MS: process.env.FLASHSCORE_REQUEST_DELAY_MS || "300",
        FLASHSCORE_CONCURRENCY: process.env.FLASHSCORE_CONCURRENCY || "2"
      }
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("A recolha falhou no lote iniciado no jogo " + batch[0].match_id + "; o progresso anterior fica guardado.");
    progress.attempted_ids = [...new Set([...(progress.attempted_ids || []), ...batch.map(row => row.match_id)])];
    processed += batch.length;
    await saveProgress({ ...progress, completed: false, processed_this_run: processed });
    console.log("[SELECTED INDICATORS CHECKPOINT] " + processed + "/" + selected.length + " nesta execução; IDs acumulados: " + progress.attempted_ids.length + ".");
  }

  const freshRows = parseCsv(await readFile(STATS_FILE, "utf8"));
  const remaining = selectRowsNeedingSelectedIndicators(freshRows, startDate, endDate, selectedPairs, progress.attempted_ids, 0).length;
  const complete = remaining === 0;
  await saveProgress({ ...progress, completed: complete, remaining, last_run_processed: processed });
  console.log("[SELECTED INDICATORS SUMMARY] " + JSON.stringify({
    selected_competitions: selectedPaths.size, processed_this_run: processed,
    attempted_total: progress.attempted_ids.length, remaining, complete
  }));
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,
    "\n## Recuperação de indicadores Flashscore\n\n" +
    "- Competições selecionadas: **" + selectedPaths.size + "**\n" +
    "- Jogos processados nesta execução: **" + processed + "**\n" +
    "- Jogos ainda pendentes: **" + remaining + "**\n" +
    "- Recuperação completa: **" + (complete ? "sim" : "não; continuará na próxima execução") + "**\n", { flag: "a" });
  if (!complete) process.exitCode = 3;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error("[SELECTED INDICATORS ERROR] " + (error?.stack || error)); process.exitCode = 1; });
}
