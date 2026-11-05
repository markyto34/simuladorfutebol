#!/usr/bin/env node
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const STATS_FILE = resolve(process.env.FLASHSCORE_STATS_FILE || "data/flashscore-statistics.csv");
const PROXY = (process.env.FLASHSCORE_PROXY_URL || "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev").replace(/\/$/, "");
const DELAY_MS = Math.max(1500, Number(process.env.FLASHSCORE_REQUEST_DELAY_MS || 2000));
const CONCURRENCY = 1;
const PROGRESS_FILE = resolve("data/flashscore-period-corners-backfill-progress.json");
const CHECKPOINT_BRANCH = process.env.BACKFILL_CHECKPOINT_BRANCH || "";
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
export function selectRowsNeedingPeriodCorners(rows, startDate, endDate, limit = 0, options = {}) {
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) {
    throw new Error("Intervalo inválido; usa datas YYYY-MM-DD e uma data final não anterior à inicial.");
  }
  const selected = rows.filter(row => {
    const date = dateKey(row.date_time);
    const id = String(row.match_id || "");
    const missing = PERIOD_FIELDS.some(field => String(row[field] ?? "").trim() === "");
    return /^[A-Za-z0-9]{6,16}$/.test(id) && date >= startDate && date <= endDate && missing && !options.excludeIds?.has(id);
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
  const backoff = [2000, 5000, 10000];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(45_000) });
      if (response.status === 403 || response.status === 429) {
        const error = new Error("Proxy/Flashscore limitou pedidos (HTTP " + response.status + ").");
        error.status = response.status;
        error.blocked = true;
        throw error;
      }
      if (!response.ok) {
        const error = new Error("Proxy respondeu HTTP " + response.status + ".");
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      if (!payload?.ok || !payload?.record) throw new Error("Resposta do proxy sem registo válido.");
      return payload.record;
    } catch (error) {
      lastError = error;
      if (error.blocked) throw error;
      if (attempt < 3) await new Promise(resolveSleep => setTimeout(resolveSleep, backoff[attempt - 1]));
    }
  }
  throw lastError || new Error("Falha desconhecida ao consultar jogo.");
}
export async function backfillPeriodCorners(rows, options = {}) {
  const attempted = new Set(options.attemptedIds || []);
  const selected = selectRowsNeedingPeriodCorners(rows, options.startDate, options.endDate, options.limit || 0, { excludeIds: attempted });
  const updated = new Map();
  const summary = { selected: selected.length, processed: 0, ht_available: 0, st_available: 0, both_available: 0, no_period_data: 0, failed: 0, blocked: false, remaining: 0 };
  let consecutiveTransientFailures = 0;
  let nextIndex = 0, nextStartAt = 0;
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
        attempted.add(job.row.match_id);
        consecutiveTransientFailures = 0;
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
        else if ([502, 503, 504].includes(Number(error?.status))) {
          consecutiveTransientFailures++;
          if (consecutiveTransientFailures >= 3) summary.blocked = true;
        } else consecutiveTransientFailures = 0;
        console.error("[PERIOD CORNERS] " + job.row.match_id + ": " + String(error?.message || error));
      }
      summary.processed++;
      if (options.onProgress) await options.onProgress({ ...summary, current: job.index + 1, match_id: job.row.match_id, attemptedIds: [...attempted], rows: rows.map(row => { const patch = updated.get(row.match_id); if (!patch) return row; const next = { ...row }; for (const field of PERIOD_FIELDS) if (String(next[field] ?? "").trim() === "" && patch[field] !== undefined) next[field] = patch[field]; return next; }) });
    }
  }
  await Promise.all(Array.from({ length: 1 }, () => worker()));
  summary.remaining = Math.max(0, selected.length - (summary.processed - summary.failed));
  const merged = rows.map(row => {
    const patch = updated.get(row.match_id);
    if (!patch) return row;
    const next = { ...row };
    for (const field of PERIOD_FIELDS) {
      if (String(next[field] ?? "").trim() === "" && patch[field] !== undefined) next[field] = patch[field];
    }
    return next;
  });
  return { rows: merged, summary, attemptedIds: [...attempted] };
}

async function main() {
  const args = process.argv.slice(2);
  const startDate = args.find(arg => arg.startsWith("--start-date="))?.slice(13);
  const endDate = args.find(arg => arg.startsWith("--end-date="))?.slice(11);
  const limit = Number(args.find(arg => arg.startsWith("--limit="))?.slice(8) || 0);
  if (!startDate || !endDate) throw new Error("Uso: node scripts/backfill-flashscore-period-corners.mjs --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD [--limit=N]");
  const parsed = parseCsv(await readFile(STATS_FILE, "utf8"));
  if (!parsed.rows.length) throw new Error("CSV de estatísticas vazio.");
  let progress = { attempted_ids: [] };
  try { progress = JSON.parse(await readFile(PROGRESS_FILE, "utf8")); } catch {}
  const checkpoint = async (rows, attemptedIds, summary) => {
    const headers = [...parsed.headers];
    for (const field of PERIOD_FIELDS) if (!headers.includes(field)) headers.push(field);
    await writeFile(STATS_FILE, toCsv(headers, rows), "utf8");
    await writeFile(PROGRESS_FILE, JSON.stringify({ start_date: startDate, end_date: endDate, attempted_ids: attemptedIds, updated_at: new Date().toISOString() }, null, 2) + "\n", "utf8");
    if (CHECKPOINT_BRANCH) {
      execFileSync("git", ["add", STATS_FILE, PROGRESS_FILE]);
      try { execFileSync("git", ["commit", "-m", "Checkpoint backfill cantos HT/ST"]); } catch (error) {
        if (!String(error?.message || "").includes("nothing to commit")) throw error;
      }
      execFileSync("git", ["push", "origin", "HEAD:" + CHECKPOINT_BRANCH], { stdio: "inherit" });
      console.log("[PERIOD CORNERS] checkpoint publicado na branch " + CHECKPOINT_BRANCH);
    }
  };
  const result = await backfillPeriodCorners(parsed.rows, {
    startDate, endDate, limit, attemptedIds: progress.attempted_ids || [],
    concurrency: 1, delayMs: DELAY_MS,
    onProgress: async item => {
      if (item.current % 50 === 0 || item.current === item.selected || item.blocked) {
        await checkpoint(item.rows, item.attemptedIds, item);
      }
      if (item.current % 10 === 0 || item.current === item.selected || item.blocked) {
        console.log("[PERIOD CORNERS] " + item.current + "/" + item.selected + " | HT=" + item.ht_available + " | ST=" + item.st_available + " | falhas=" + item.failed + " | bloqueio=" + item.blocked + " | " + item.match_id);
      }
    }
  });
  const headers = [...parsed.headers];
  for (const field of PERIOD_FIELDS) if (!headers.includes(field)) headers.push(field);
  await writeFile(STATS_FILE, toCsv(headers, result.rows), "utf8");
  await writeFile(PROGRESS_FILE, JSON.stringify({ start_date: startDate, end_date: endDate, attempted_ids: result.attemptedIds, updated_at: new Date().toISOString() }, null, 2) + "\n", "utf8");
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
  if (result.summary.failed || result.summary.blocked || result.summary.remaining > 0) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
