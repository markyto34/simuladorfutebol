#!/usr/bin/env node
/**
 * Recolhe estatísticas e odds Bwin a partir da mesma página de estatísticas
 * de cada jogo Flashscore. Não recolhe odds de outras casas.
 *
 * Uso: node scripts/collect-flashscore-csv.mjs <match_id> [match_id...]
 * Opcional: FLASHSCORE_PROXY_URL e FLASHSCORE_REQUEST_DELAY_MS.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PROXY = (process.env.FLASHSCORE_PROXY_URL || "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev").replace(/\/$/, "");
const DELAY_MS = Math.max(1500, Number(process.env.FLASHSCORE_REQUEST_DELAY_MS || 2500));
const MAX_MANUAL_MATCHES = 5;
const MAX_DAILY_MATCHES = 2000
const STATS_FILE = resolve("data/flashscore-statistics.csv");
const ODDS_FILE = resolve("data/bwin-odds-flashscore.csv");

const STAT_KEYS = [
  "xg", "possession", "shots", "shots_on_target", "big_chances", "corners",
  "yellow_cards", "shots_off_target", "blocked_shots", "shots_inside_box",
  "shots_outside_box", "offsides", "fouls"
];
const STAT_HEADERS = [
  "match_id", "date_time", "country", "competition", "home_team", "away_team",
  "status", "score_home", "score_away",
  ...STAT_KEYS.flatMap(key => [key + "_home", key + "_away"]),
  "source", "source_url", "retrieved_at"
];
const ODDS_HEADERS = [
  "match_id", "date_time", "country", "competition", "home_team", "away_team",
  "bookmaker", "market", "odd_1", "odd_x", "odd_2",
  "odds_timestamp_type", "retrieved_at", "source", "source_url"
];

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function toCsv(headers, rows) {
  return [headers.join(","), ...rows.map(row => headers.map(key => csvCell(row[key])).join(","))].join("\n") + "\n";
}
function parseCsv(text) {
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
  if (!rows.length) return [];
  const headers = rows.shift();
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}
async function readRows(path) {
  try { return parseCsv(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
function statisticsRow(record) {
  const row = {
    match_id: record.match_id,
    date_time: record.date_time_iso_local || record.date_time || "",
    country: record.country || "",
    competition: record.competition || "",
    home_team: record.teams?.home?.name || "",
    away_team: record.teams?.away?.name || "",
    status: record.status || "",
    score_home: record.score?.full_time?.home ?? "",
    score_away: record.score?.full_time?.away ?? "",
    source: "Flashscore",
    source_url: record.source_capture?.url || "",
    retrieved_at: record.source_capture?.retrieved_at || ""
  };
  for (const key of STAT_KEYS) {
    const sourceKey = key === "xg" ? "expected_goals" : key;
    row[key + "_home"] = record.statistics?.[sourceKey]?.home ?? "";
    row[key + "_away"] = record.statistics?.[sourceKey]?.away ?? "";
  }
  return row;
}
function bwinOddsRow(record) {
  const odds = record.odds;
  const market = odds?.markets?.["1x2"];
  if (odds?.bookmaker !== "Bwin" || !market) return null;
  const values = [market.home, market.draw, market.away].map(Number);
  if (!values.every(value => Number.isFinite(value) && value > 1 && value <= 1000)) return null;
  return {
    match_id: record.match_id,
    date_time: record.date_time_iso_local || record.date_time || "",
    country: record.country || "",
    competition: record.competition || "",
    home_team: record.teams?.home?.name || "",
    away_team: record.teams?.away?.name || "",
    bookmaker: "Bwin",
    market: "1X2",
    odd_1: values[0],
    odd_x: values[1],
    odd_2: values[2],
    odds_timestamp_type: odds.odds_timestamp_type || "observed_at_collection",
    retrieved_at: odds.retrieved_at || record.source_capture?.retrieved_at || "",
    source: "Flashscore",
    source_url: record.source_capture?.url || ""
  };
}
function mergeRows(existing, incoming, keyFn) {
  const map = new Map(existing.map(row => [keyFn(row), row]));
  for (const row of incoming) map.set(keyFn(row), row);
  return [...map.values()];
}
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

async function collect(matchId) {
  if (!/^[A-Za-z0-9]{6,16}$/.test(matchId)) throw new Error("ID inválido: " + matchId);
  const url = new URL(PROXY + "/record");
  url.searchParams.set("id", matchId);
  url.searchParams.set("tab", "statistics");
  const response = await fetch(url, { headers: { "Accept": "application/json" } });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("Resposta não JSON para " + matchId + " (HTTP " + response.status + ")."); }
  if (!response.ok || payload.ok !== true || !payload.record) {
    const upstream = Number(payload.upstream_status || 0);
    if (upstream === 403 || upstream === 429) {
      const error = new Error("Flashscore respondeu HTTP " + upstream + "; recolha interrompida sem novas tentativas.");
      error.stop = true;
      throw error;
    }
    throw new Error("Falha ao recolher " + matchId + ": " + (payload.error || "HTTP " + response.status));
  }
  if (payload.record.source !== "Flashscore" || payload.record.match_id !== matchId) {
    throw new Error("A resposta não corresponde ao jogo Flashscore solicitado: " + matchId);
  }
  return payload.record;
}

async function discoverMatchIds(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
    throw new Error("Data inválida. Usa --date=YYYY-MM-DD.");
  }
  const url = new URL(PROXY + "/discover-inspect");
  url.searchParams.set("date", date);
  url.searchParams.set("ids", "1");
  const response = await fetch(url, { headers: { "Accept": "application/json" } });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("Resposta não JSON na descoberta da data (HTTP " + response.status + ")."); }
  if (!response.ok || payload.ok !== true || !payload.inspection) {
    const upstream = Number(payload.upstream_status || 0);
    if (upstream === 403 || upstream === 429) {
      throw new Error("Flashscore respondeu HTTP " + upstream + " na descoberta; recolha interrompida.");
    }
    throw new Error("Falha na descoberta de jogos: " + (payload.error || "HTTP " + response.status));
  }
  if (payload.inspection.truncated) {
    throw new Error("A lista da data excede o limite seguro de 2000 jogos; não foi iniciada a recolha.");
  }
  return [...new Set((payload.inspection.match_ids || []).filter(id => /^[A-Za-z0-9]{6,16}$/.test(id)))];
}

async function main() {
  const args = process.argv.slice(2);
  const dateOption = args.find(arg => arg.startsWith("--date="));
  let matchIds = args.filter(arg => !arg.startsWith("--"));
  if (dateOption && matchIds.length) {
    throw new Error("Usa IDs de jogos ou --date=YYYY-MM-DD, não ambos.");
  }
  if (dateOption) {
    const date = dateOption.slice("--date=".length);
    matchIds = await discoverMatchIds(date);
    console.log("Flashscore encontrou " + matchIds.length + " IDs únicos para " + date + ".");
  }
  matchIds = [...new Set(matchIds)];
  const maxMatches = dateOption ? MAX_DAILY_MATCHES : MAX_MANUAL_MATCHES;
  if (matchIds.length > maxMatches) {
    throw new Error("Limite de segurança: máximo de " + maxMatches + " jogos por execução" + (dateOption ? " diária." : " manual."));
  }
  if (!matchIds.length) {
    if (dateOption) {
      console.log("Não foram encontrados jogos Flashscore para a data indicada. Nada a acrescentar aos CSV.");
      return;
    }
    console.error("Uso: node scripts/collect-flashscore-csv.mjs <match_id> [match_id...]");
    console.error("  ou: node scripts/collect-flashscore-csv.mjs --date=YYYY-MM-DD");
    process.exitCode = 2;
    return;
  }
  await mkdir(dirname(STATS_FILE), { recursive: true });
  const existingStats = await readRows(STATS_FILE);
  const existingOdds = await readRows(ODDS_FILE);
  const statsNew = [], oddsNew = [];
  let failures = 0;
  for (let index = 0; index < matchIds.length; index++) {
    const matchId = matchIds[index];
    try {
      const record = await collect(matchId);
      if (record.statistics && Object.keys(record.statistics).length) statsNew.push(statisticsRow(record));
      const oddsRow = bwinOddsRow(record);
      if (oddsRow) oddsNew.push(oddsRow);
      console.log(matchId + ": " + Object.keys(record.statistics || {}).length + " estatísticas; " + (oddsRow ? "odds Bwin 1X2 encontradas." : "sem triplo Bwin 1X2 confirmado."));
    } catch (error) {
      failures++;
      console.error(matchId + ": " + error.message);
      if (error.stop) break;
    }
    if (index < matchIds.length - 1) await sleep(DELAY_MS);
  }
  const mergedStats = mergeRows(existingStats, statsNew, row => row.match_id);
  const mergedOdds = mergeRows(existingOdds, oddsNew, row => row.match_id + "|" + row.retrieved_at);
  await writeFile(STATS_FILE, toCsv(STAT_HEADERS, mergedStats), "utf8");
  await writeFile(ODDS_FILE, toCsv(ODDS_HEADERS, mergedOdds), "utf8");
  console.log("CSV de estatísticas: " + STATS_FILE + " (" + mergedStats.length + " jogos).");
  console.log("CSV exclusivo Bwin: " + ODDS_FILE + " (" + mergedOdds.length + " observações).");
  console.log("Resumo: " + statsNew.length + " jogos com estatísticas; " + oddsNew.length + " observações Bwin; " + failures + " falhas.");
  if (failures) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
