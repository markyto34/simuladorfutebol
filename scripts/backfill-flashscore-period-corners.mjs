#!/usr/bin/env node
import { readFile, writeFile, appendFile, rename } from "node:fs/promises";
import { resolve } from "node:path";

const STATS_FILE = resolve(process.env.FLASHSCORE_STATS_FILE || "data/flashscore-statistics.csv");
const PROXY = (process.env.FLASHSCORE_PROXY_URL || "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev").replace(/\/$/, "");
const DELAY_MS = Math.max(500, Number(process.env.FLASHSCORE_REQUEST_DELAY_MS || 900));
const CONCURRENCY = Math.max(1, Math.min(4, Number.parseInt(process.env.FLASHSCORE_CONCURRENCY || "2", 10) || 2));
const PERIOD_FIELDS = ["corners_ht_home", "corners_ht_away", "corners_st_home", "corners_st_away"];

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
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows.shift().map(value => value.trim());
  return { headers, rows: rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))) };
}
function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function toCsv(headers, rows) {
  return [headers.join(","), ...rows.map(row => headers.map(key => csvCell(row[key])).join(","))].join("\n") + "\n";
}
function dateKey(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const pt = text.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return pt ? pt[3] + "-" + pt[2] + "-" + pt[1] : "";
}
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function selectRowsNeedingPeriodCorners(rows, startDate, endDate, limit = 0) {
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) {
    throw new Error("Intervalo inválido; usa datas YYYY-MM-DD e uma data final não anterior à inicial.");
  }
  const selected = rows.filter(row => {
    const date = dateKey(row.date_time);
    const id = String(row.match_id || "");
    const missing = PERIOD_FIELDS.some(field => String(row[field] ?? "").trim() === "");
    return /^[A-Za-z0-9]{6,16}$/.test(id) && date >= startDate && date <= endDate && missing;
  });
  const n = Number(limit);
  return Number.isInteger(n) && n > 0 ? selected.slice(0, n) : selected;
}
function numericPair(value) {
  if (!value || !Number.isInteger(value.home) || !Number.isInteger(value.away) || value.home < 0 || value.away < 0) return null;
  return { home: value.home, away: value.away };
}
async function fetchRecord(matchId) {
  const url = PROXY + "/record?id=" + encodeURIComponent(matchId) + "&tab=statistics";
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(45_000) });
      if (response.status === 403 || response.status === 429) {
        const error = new Error("Flashscore limitou pedidos (HTTP " + response.status + ").");
        error.blocked = true;
        throw error;
      }
      if (!response.ok) {
        const error = new Error("Proxy respondeu HTTP " + response.status + ".");
        error.transient = [500, 502, 503, 504].includes(response.status);
        throw error;
      }
      const payload = await response.json();
      if (!payload?.ok || !payload?.record) throw new Error("Resposta do proxy sem registo válido.");
      return payload.record;
    } catch (error) {
      lastError = error;
      if (error.blocked) throw error;
      if (attempt < 5) await new Promise(resolveSleep => setTimeout(resolveSleep, error?.transient ? 1000 * (2 ** (attempt - 1)) : 500 * attempt));
    }
  }
  throw lastError || new Error("Falha desconhecida ao consultar jogo.");
}
export async function backfillPeriodCorners(rows, options = {}) {
  const selected = selectRowsNeedingPeriodCorners(rows, options.startDate, options.endDate, options.limit || 0);
  const updated = new Map();
  const summary = { selected: selected.length, processed: 0, ht_available: 0, st_available: 0, both_available: 0, no_period_data: 0, failed: 0, blocked: false };
  let nextIndex = 0, nextStartAt = 0;\n  let checkpointChain = Promise.resolve();\n  let lastCheckpoint = 0;\n  const checkpointEvery = Math.max(1, Number(options.checkpointEvery || 25));\n  const mergeUpdatedRows = () => rows.map(row => {\n    const patch = updated.get(row.match_id);\n    if (!patch) return row;\n    const next = { ...row };\n    for (const field of PERIOD_FIELDS) {\n      if (String(next[field] ?? "").trim() === "" && patch[field] !== undefined) next[field] = patch[field];\n    }\n    return next;\n  });
  async function takeNext() {
    if (summary.blocked || nextIndex >= selected.length) return null;
    const index = nextIndex++;
    const now = Date.now(), wait = Math.max(0, nextStartAt - now);
    nextStartAt = Math.max(now, nextStartAt) + (options.delayMs ?? DELAY_MS);
    if (wait) await new Promise(resolveSleep => setTimeout(resolveSleep, wait));
    if (summary.blocked) return null;
    return { index, row: selected[index] };
  }
  async function worker() {
    while (true) {
      const job = await takeNext();
      if (!job) return;
      try {
        const record = await (options.fetchRecord || fetchRecord)(job.row.match_id);
        const ht = numericPair(record.statistics?.corners_ht);
        const st = numericPair(record.statistics?.corners_st);
        const patch = { match_id: job.row.match_id };
        if (ht) { patch.corners_ht_home = ht.home; patch.corners_ht_away = ht.away; summary.ht_available++; }
        if (st) { patch.corners_st_home = st.home; patch.corners_st_away = st.away; summary.st_available++; }
        if (ht && st) summary.both_available++;
        if (!ht && !st) summary.no_period_data++;
        updated.set(job.row.match_id, patch);
      } catch (error) {
        summary.failed++;
        if (error?.blocked) summary.blocked = true;
        console.error("[PERIOD CORNERS] " + job.row.match_id + ": " + String(error?.message || error));
      }
      summary.processed++;
      if (options.onProgress) await options.onProgress({ ...summary, current: job.index + 1, match_id: job.row.match_id });\n      if (options.onCheckpoint && (summary.processed % checkpointEvery === 0 || summary.processed === summary.selected)) {\n        const snapshot = mergeUpdatedRows();\n        const snapshotSummary = { ...summary };\n        checkpointChain = checkpointChain.then(() => options.onCheckpoint(snapshot, snapshotSummary));\n        await checkpointChain;\n        lastCheckpoint = summary.processed;\n      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? CONCURRENCY, Math.max(1, selected.length)) }, () => worker()));
  const merged = mergeUpdatedRows();
  if (options.onCheckpoint && lastCheckpoint !== summary.processed) {
    checkpointChain = checkpointChain.then(() => options.onCheckpoint(merged, { ...summary }));
    await checkpointChain;
  }
  return { rows: merged, summary };
}

async function main() {
  const args = process.argv.slice(2);
  const startDate = args.find(arg => arg.startsWith("--start-date="))?.slice(13);
  const endDate = args.find(arg => arg.startsWith("--end-date="))?.slice(11);
  const limit = Number(args.find(arg => arg.startsWith("--limit="))?.slice(8) || 0);
  if (!startDate || !endDate) throw new Error("Uso: node scripts/backfill-flashscore-period-corners.mjs --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD [--limit=N]");
  const parsed = parseCsv(await readFile(STATS_FILE, "utf8"));
  if (!parsed.rows.length) throw new Error("CSV de estatísticas vazio.");
  const headers = [...parsed.headers];
  for (const field of PERIOD_FIELDS) if (!headers.includes(field)) headers.push(field);
  let lastSaved = 0;
  const saveCheckpoint = async (rows, summary) => {
    const temporary = STATS_FILE + ".checkpoint.tmp";
    await writeFile(temporary, toCsv(headers, rows), "utf8");
    await rename(temporary, STATS_FILE);
    lastSaved = summary.processed;
    console.log("[PERIOD CORNERS CHECKPOINT] guardados " + lastSaved + "/" + summary.selected + " jogos; HT=" + summary.ht_available + "; ST=" + summary.st_available + "; falhas=" + summary.failed);
  };
  const result = await backfillPeriodCorners(parsed.rows, {
    startDate, endDate, limit, checkpointEvery: 25, onCheckpoint: saveCheckpoint,
    onProgress: item => {
      if (item.current % 25 === 0 || item.current === item.selected) {
        console.log("[PERIOD CORNERS] " + item.current + "/" + item.selected + " | HT=" + item.ht_available + " | ST=" + item.st_available + " | falhas=" + item.failed + " | " + item.match_id);
      }
    }
  });
  if (lastSaved !== result.summary.processed) await saveCheckpoint(result.rows, result.summary);
  console.log("[PERIOD CORNERS SUMMARY] " + JSON.stringify(result.summary));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      "\n## Backfill de cantos HT/ST\n\n" +
      "- Jogos selecionados: **" + result.summary.selected + "**\n" +
      "- Jogos processados: **" + result.summary.processed + "**\n" +
      "- HT disponível: **" + result.summary.ht_available + "**\n" +
      "- ST disponível: **" + result.summary.st_available + "**\n" +
      "- HT e ST disponíveis: **" + result.summary.both_available + "**\n" +
      "- Sem dados por período: **" + result.summary.no_period_data + "**\n" +
      "- Falhas: **" + result.summary.failed + "**\n" +
      "- Bloqueio upstream: **" + result.summary.blocked + "**\n");
  }
  if (result.summary.failed || result.summary.blocked) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
