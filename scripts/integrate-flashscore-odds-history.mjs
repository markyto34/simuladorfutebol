#!/usr/bin/env node
/**
 * Integra a recolha diária Flashscore/Bwin diretamente no CSV histórico
 * consumido pelo módulo de pesquisa de odds. Preserva o histórico e é idempotente.
 */
import { readFile, writeFile } from "node:fs/promises";

const BASE_FILE = "ganhonasodds_com_20261101.csv";
const ODDS_FILE = "data/bwin-odds-flashscore.csv";
const STATS_FILE = "data/flashscore-statistics.csv";

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
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows.shift().map(value => value.trim());
  return { headers, records: rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))) };
}
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function toCsv(headers, records) {
  return [headers.join(","), ...records.map(record => headers.map(key => csvCell(record[key])).join(","))].join("\n") + "\n";
}
function norm(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
}
function dateKey(value) {
  const match = String(value || "").match(/^\s*(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}
function legacyIdentity(row, isQuote = false) {
  return [
    dateKey(row.date_time),
    norm(isQuote ? row.home_team : row.TEAM_HOME),
    norm(isQuote ? row.away_team : row.TEAM_AWAY)
  ].join("|");
}
function fullIdentity(row, isQuote = false) {
  const country = norm(isQuote ? row.country : row.COUNTRY);
  const competition = norm(isQuote ? row.competition : row.LEAGUE);
  if (!country || !competition) return "";
  return [
    dateKey(row.date_time), country, competition,
    norm(isQuote ? row.home_team : row.TEAM_HOME),
    norm(isQuote ? row.away_team : row.TEAM_AWAY)
  ].join("|");
}
function addIndex(index, key, row) {
  if (!key) return;
  const rows = index.get(key) || [];
  rows.push(row);
  index.set(key, rows);
}
function validOdd(value) {
  const number = Number(String(value || "").replace(",", "."));
  return Number.isFinite(number) && number > 1 && number <= 1000;
}

const baseText = await readFile(BASE_FILE, "utf8");
const oddsText = await readFile(ODDS_FILE, "utf8");
const statsText = await readFile(STATS_FILE, "utf8");
const base = parseCsv(baseText);
const odds = parseCsv(oddsText).records;
const stats = parseCsv(statsText).records;
const required = ["date_time","COUNTRY","LEAGUE","TEAM_HOME","TEAM_AWAY","odd_ft_1","odd_ft_x","odd_ft_2","score_fh_home","score_fh_away","score_sh_home","score_sh_away","score_ft_home","score_ft_away","score_final_home","score_final_away"];
for (const field of required) {
  if (!base.headers.includes(field)) throw new Error("CSV histórico sem a coluna obrigatória: " + field);
}
if (!base.records.length) throw new Error("CSV histórico vazio; integração cancelada para proteger os dados.");

const statsById = new Map(stats.filter(row => row.match_id).map(row => [row.match_id, row]));
const byFullIdentity = new Map();
const byLegacyIdentity = new Map();
for (const row of base.records) {
  addIndex(byFullIdentity, fullIdentity(row), row);
  addIndex(byLegacyIdentity, legacyIdentity(row), row);
}
let added = 0, oddsRowsUpdated = 0, oddsFieldsUpdated = 0, resultsUpdated = 0, metadataRowsUpdated = 0, metadataFieldsUpdated = 0, skipped = 0, ambiguous = 0;
for (const quote of odds) {
  if (quote.bookmaker !== "Bwin" || quote.market !== "1X2") continue;
  if (![quote.odd_1, quote.odd_x, quote.odd_2].every(validOdd)) { skipped++; continue; }
  const matchId = String(quote.match_id || "");
  const stat = statsById.get(matchId);
  const row = Object.fromEntries(base.headers.map(header => [header, ""]));
  row.date_time = quote.date_time || stat?.date_time || "";
  row.COUNTRY = quote.country || stat?.country || "";
  row.LEAGUE = quote.competition || stat?.competition || "";
  row.TEAM_HOME = quote.home_team || stat?.home_team || "";
  row.TEAM_AWAY = quote.away_team || stat?.away_team || "";
  row.odd_ft_1 = quote.odd_1;
  row.odd_ft_x = quote.odd_x;
  row.odd_ft_2 = quote.odd_2;
  if (!row.date_time || !row.TEAM_HOME || !row.TEAM_AWAY) { skipped++; continue; }
  if (stat) {
    row.score_ft_home = stat.score_home || "";
    row.score_ft_away = stat.score_away || "";
    row.score_final_home = stat.score_home || "";
    row.score_final_away = stat.score_away || "";
  }
  const exactKey = fullIdentity(row);
  const exactMatches = exactKey ? (byFullIdentity.get(exactKey) || []) : [];
  const legacyMatches = byLegacyIdentity.get(legacyIdentity(row)) || [];
  const candidates = exactMatches.length ? exactMatches : legacyMatches;
  if (candidates.length > 1) {
    ambiguous++;
    skipped++;
    console.warn("Correspondência ambígua; linha ignorada sem alterar o histórico: " + legacyIdentity(row));
    continue;
  }
  const existing = candidates[0];
  if (existing) {
    // Completar país/competição apenas quando estão vazios; nunca reclassificar o histórico.
    let metadataChanged = false;
    for (const [field, value] of [["COUNTRY", row.COUNTRY], ["LEAGUE", row.LEAGUE]]) {
      if (String(existing[field] ?? "").trim() === "" && String(value ?? "").trim() !== "") {
        existing[field] = value;
        metadataFieldsUpdated++;
        metadataChanged = true;
      }
    }
    if (metadataChanged) metadataRowsUpdated++;

    // Completar apenas odds em falta; nunca substituir valores históricos existentes.
    let oddsChanged = false;
    for (const [field, value] of [["odd_ft_1", quote.odd_1], ["odd_ft_x", quote.odd_x], ["odd_ft_2", quote.odd_2]]) {
      if (String(existing[field] ?? "").trim() === "" && validOdd(value)) {
        existing[field] = value;
        oddsFieldsUpdated++;
        oddsChanged = true;
      }
    }
    if (oddsChanged) oddsRowsUpdated++;

    // Completar resultados FT campo a campo, sem substituir valores existentes.
    let resultChanged = false;
    if (stat) {
      for (const [field, value] of [["score_ft_home", stat.score_home], ["score_ft_away", stat.score_away], ["score_final_home", stat.score_home], ["score_final_away", stat.score_away]]) {
        if (String(existing[field] ?? "").trim() === "" && String(value ?? "").trim() !== "") {
          existing[field] = value;
          resultChanged = true;
        }
      }
    }
    if (resultChanged) resultsUpdated++;
    continue;
  }
  base.records.push(row);
  addIndex(byFullIdentity, fullIdentity(row), row);
  addIndex(byLegacyIdentity, legacyIdentity(row), row);
  added++;
}
if (added || metadataRowsUpdated || oddsRowsUpdated || resultsUpdated) {
  await writeFile(BASE_FILE, toCsv(base.headers, base.records), "utf8");
}
console.log("CSV histórico integrado: " + base.records.length.toLocaleString("pt-PT") + " registos totais.");
console.log("Novos jogos acrescentados: " + added + "; jogos existentes com metadados completados: " + metadataRowsUpdated + "; campos de país/competição preenchidos: " + metadataFieldsUpdated + "; jogos existentes com odds completadas: " + oddsRowsUpdated + "; campos de odds preenchidos: " + oddsFieldsUpdated + "; jogos com resultados FT completados: " + resultsUpdated + "; linhas ignoradas: " + skipped + "; correspondências ambíguas: " + ambiguous + ".");
console.log("Ficheiro atualizado: " + BASE_FILE);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    "\n## Integração no CSV histórico de odds\n\n- Total de jogos no CSV: **" + base.records.length +
    "**\n- Novos jogos: **" + added + "**\n- Campos de país/competição preenchidos: **" + metadataFieldsUpdated + "**\n- Resultados FT atualizados: **" + resultsUpdated + "**\n- Linhas ignoradas: **" + skipped + "**\n", "utf8");
}
