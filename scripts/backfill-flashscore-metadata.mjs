#!/usr/bin/env node
/**
 * Backfill conservador de país/competição nos CSVs Flashscore.
 * Faz uma consulta por dia ao calendário (nunca uma consulta por jogo).
 * Só preenche campos vazios e só usa associações explícitas e inequívocas.
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";

const PROXY = (process.env.FLASHSCORE_PROXY_URL || "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev").replace(/\/$/, "");
const STATS_FILE = resolve("data/flashscore-statistics.csv");
const ODDS_FILE = resolve("data/bwin-odds-flashscore.csv");
const REQUEST_TIMEOUT_MS = 60_000;
const BETWEEN_DATES_MS = 1_500;

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
  return {
    headers,
    records: rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])))
  };
}

export function toCsv(headers, records) {
  const cell = value => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return [headers.join(","), ...records.map(record => headers.map(key => cell(record[key])).join(","))].join("\n") + "\n";
}

const dateKey = value => String(value || "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
const isBlank = value => String(value ?? "").trim() === "";

export function datesNeedingMetadata(stats, odds) {
  const dates = new Set();
  for (const row of [...stats, ...odds]) {
    if (row.match_id && dateKey(row.date_time) && (isBlank(row.country) || isBlank(row.competition))) {
      dates.add(dateKey(row.date_time));
    }
  }
  return [...dates].sort();
}

export function applyMetadata(stats, odds, identitiesByDate) {
  const statsById = new Map(stats.filter(row => row.match_id).map(row => [row.match_id, row]));
  let statsUpdated = 0, oddsUpdated = 0, ambiguous = 0, unmatched = 0;

  const apply = (row, identity) => {
    if (!identity || identity.status !== "identified" ||
        isBlank(identity.country) || isBlank(identity.competition)) return false;
    let changed = false;
    if (isBlank(row.country)) { row.country = identity.country; changed = true; }
    if (isBlank(row.competition)) { row.competition = identity.competition; changed = true; }
    return changed;
  };

  for (const row of stats) {
    const date = dateKey(row.date_time);
    if (!row.match_id || (!isBlank(row.country) && !isBlank(row.competition))) continue;
    const identity = identitiesByDate.get(date)?.[row.match_id];
    if (!identity) { unmatched++; continue; }
    if (identity.status === "ambiguous") { ambiguous++; continue; }
    if (apply(row, identity)) statsUpdated++;
  }

  for (const row of odds) {
    const date = dateKey(row.date_time);
    if (!row.match_id || (!isBlank(row.country) && !isBlank(row.competition))) continue;
    let identity = identitiesByDate.get(date)?.[row.match_id];
    if (!identity) {
      const stat = statsById.get(row.match_id);
      if (stat && !isBlank(stat.country) && !isBlank(stat.competition)) {
        identity = { status: "identified", country: stat.country, competition: stat.competition };
      }
    }
    if (!identity) { unmatched++; continue; }
    if (identity.status === "ambiguous") { ambiguous++; continue; }
    if (apply(row, identity)) oddsUpdated++;
  }

  return { statsUpdated, oddsUpdated, ambiguous, unmatched };
}

async function discoverDate(date, fetchImpl = fetch) {
  const url = PROXY + "/discover-inspect?date=" + encodeURIComponent(date) + "&ids=1";
  const response = await fetchImpl(url, { method: "GET", headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status === 403 || response.status === 429) {
    throw new Error("Flashscore recusou/limitou a descoberta de " + date + " (HTTP " + response.status + "). Nenhum CSV foi alterado.");
  }
  if (!response.ok) throw new Error("Falha na descoberta de " + date + " (HTTP " + response.status + "). Nenhum CSV foi alterado.");
  const payload = await response.json();
  const inspection = payload?.inspection;
  if (!payload?.ok || !Array.isArray(inspection?.match_ids) || !inspection?.match_competition_identities) {
    throw new Error("Resposta incompleta na descoberta de " + date + ". Nenhum CSV foi alterado.");
  }
  const ids = new Set(inspection.match_ids);
  const safe = {};
  for (const [id, identity] of Object.entries(inspection.match_competition_identities)) {
    if (ids.has(id) && /^[A-Za-z0-9]{6,16}$/.test(id) && identity?.status === "identified" &&
        !isBlank(identity.country) && !isBlank(identity.competition)) {
      safe[id] = { status: "identified", country: String(identity.country), competition: String(identity.competition) };
    } else if (ids.has(id) && identity?.status === "ambiguous") {
      safe[id] = { status: "ambiguous", country: null, competition: null };
    }
  }
  return safe;
}

async function writeAtomic(path, content) {
  const temp = path + ".backfill-tmp";
  await writeFile(temp, content, "utf8");
  await rename(temp, path);
}

export async function runBackfill({ apply = false, fetchImpl = fetch, sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms)) } = {}) {
  const [statsText, oddsText] = await Promise.all([readFile(STATS_FILE, "utf8"), readFile(ODDS_FILE, "utf8")]);
  const statsCsv = parseCsv(statsText), oddsCsv = parseCsv(oddsText);
  for (const [name, csv] of [["estatísticas", statsCsv], ["odds Bwin", oddsCsv]]) {
    for (const required of ["match_id", "date_time", "country", "competition"]) {
      if (!csv.headers.includes(required)) throw new Error("CSV de " + name + " sem coluna " + required + ".");
    }
  }
  if (!statsCsv.records.length || !oddsCsv.records.length) throw new Error("Um dos CSV está vazio; operação cancelada.");
  const originalStatsCount = statsCsv.records.length, originalOddsCount = oddsCsv.records.length;
  const dates = datesNeedingMetadata(statsCsv.records, oddsCsv.records);
  const identitiesByDate = new Map();

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    console.log("[DISCOVERY] " + (i + 1) + "/" + dates.length + " " + date);
    identitiesByDate.set(date, await discoverDate(date, fetchImpl));
    if (i < dates.length - 1) await sleep(BETWEEN_DATES_MS);
  }

  const result = applyMetadata(statsCsv.records, oddsCsv.records, identitiesByDate);
  if (statsCsv.records.length !== originalStatsCount || oddsCsv.records.length !== originalOddsCount) {
    throw new Error("A contagem de linhas mudou inesperadamente; nenhum CSV foi escrito.");
  }
  const summary = {
    mode: apply ? "apply" : "dry-run",
    datesChecked: dates,
    statisticsRows: originalStatsCount,
    oddsRows: originalOddsCount,
    ...result
  };
  console.log("[SUMMARY] " + JSON.stringify(summary));

  if (apply && (result.statsUpdated || result.oddsUpdated)) {
    await writeAtomic(STATS_FILE, toCsv(statsCsv.headers, statsCsv.records));
    await writeAtomic(ODDS_FILE, toCsv(oddsCsv.headers, oddsCsv.records));
    console.log("[WRITE] Metadados preenchidos; nenhum registo foi acrescentado ou removido.");
  } else if (!apply) {
    console.log("[DRY-RUN] Sem alterações gravadas. Usa --apply após rever o resumo.");
  } else {
    console.log("[WRITE] Não havia campos vazios que pudessem ser preenchidos.");
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
