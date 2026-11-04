#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BASE_FILE = "ganhonasodds_com_20261101.csv";
const ODDS_FILE = "data/bwin-odds-flashscore.csv";
const REPORT_FILE = "odds-match-audit.json";

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
  if (!rows.length) return [];
  const headers = rows.shift().map(value => value.trim());
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function dateKey(value) {
  const match = String(value ?? "").match(/^\s*(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}
function fullKey(row, isQuote = false) {
  return [
    dateKey(row.date_time),
    normalize(row.country),
    normalize(isQuote ? row.competition : row.LEAGUE),
    normalize(isQuote ? row.home_team : row.TEAM_HOME),
    normalize(isQuote ? row.away_team : row.TEAM_AWAY)
  ].join("|");
}
function legacyKey(row, isQuote = false) {
  return [
    dateKey(row.date_time),
    normalize(isQuote ? row.home_team : row.TEAM_HOME),
    normalize(isQuote ? row.away_team : row.TEAM_AWAY)
  ].join("|");
}
function validOdd(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 1 && number <= 1000;
}

export function auditMatches(baseRecords, oddsRecords) {
  const fullIndex = new Map(), legacyIndex = new Map();
  const add = (index, key, row) => {
    if (!key.replace(/\|/g, "")) return;
    const list = index.get(key) || [];
    list.push(row);
    index.set(key, list);
  };
  for (const row of baseRecords) {
    add(fullIndex, fullKey(row), row);
    add(legacyIndex, legacyKey(row), row);
  }

  const results = [];
  for (const quote of oddsRecords) {
    if (quote.bookmaker !== "Bwin" || quote.market !== "1X2") continue;
    const quoteMeta = {
      match_id: quote.match_id || "",
      date_time: quote.date_time || "",
      country: quote.country || "",
      competition: quote.competition || "",
      home_team: quote.home_team || "",
      away_team: quote.away_team || ""
    };
    if (![quote.odd_1, quote.odd_x, quote.odd_2].every(validOdd)) {
      results.push({ ...quoteMeta, status: "invalid_odds", candidates: [] });
      continue;
    }

    const exact = fullIndex.get(fullKey(quote, true)) || [];
    if (exact.length === 1) {
      results.push({ ...quoteMeta, status: "exact", candidates: exact.map(row => ({
        date_time: row.date_time, country: row.COUNTRY, competition: row.LEAGUE,
        home_team: row.TEAM_HOME, away_team: row.TEAM_AWAY
      })) });
      continue;
    }
    if (exact.length > 1) {
      results.push({ ...quoteMeta, status: "ambiguous_exact", candidates: exact.slice(0, 10).map(row => ({
        date_time: row.date_time, country: row.COUNTRY, competition: row.LEAGUE,
        home_team: row.TEAM_HOME, away_team: row.TEAM_AWAY
      })) });
      continue;
    }

    const legacy = legacyIndex.get(legacyKey(quote, true)) || [];
    const candidates = legacy.slice(0, 10).map(row => ({
      date_time: row.date_time, country: row.COUNTRY, competition: row.LEAGUE,
      home_team: row.TEAM_HOME, away_team: row.TEAM_AWAY
    }));
    const status = legacy.length === 1 ? "legacy_only" : legacy.length > 1 ? "ambiguous_legacy" : "missing";
    results.push({ ...quoteMeta, status, candidates });
  }

  const counts = Object.fromEntries(["exact", "legacy_only", "ambiguous_exact", "ambiguous_legacy", "missing", "invalid_odds"]
    .map(status => [status, results.filter(row => row.status === status).length]));
  const collisions = [...legacyIndex.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, count: rows.length, competitions: [...new Set(rows.map(row => String(row.LEAGUE || "")))].slice(0, 10) }))
    .slice(0, 100);

  return {
    generated_at: new Date().toISOString(),
    mode: "read_only_dry_run",
    base_rows: baseRecords.length,
    bwin_quotes: results.length,
    counts,
    legacy_identity_collisions: collisions,
    results
  };
}

async function main() {
  const baseText = await readFile(BASE_FILE, "utf8");
  const oddsText = await readFile(ODDS_FILE, "utf8");
  const base = parseCsv(baseText);
  const odds = parseCsv(oddsText);
  if (!base.length || !odds.length) throw new Error("CSV histórico ou CSV Bwin vazio; auditoria cancelada.");
  for (const field of ["date_time", "COUNTRY", "LEAGUE", "TEAM_HOME", "TEAM_AWAY"]) {
    if (!Object.hasOwn(base[0], field)) throw new Error("Coluna em falta no CSV histórico: " + field);
  }
  for (const field of ["match_id", "date_time", "country", "competition", "home_team", "away_team", "bookmaker", "market", "odd_1", "odd_x", "odd_2"]) {
    if (!Object.hasOwn(odds[0], field)) throw new Error("Coluna em falta no CSV Bwin: " + field);
  }
  const report = auditMatches(base, odds);
  await writeFile(REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ mode: report.mode, base_rows: report.base_rows, bwin_quotes: report.bwin_quotes, counts: report.counts, collision_groups: report.legacy_identity_collisions.length, report_file: REPORT_FILE }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
