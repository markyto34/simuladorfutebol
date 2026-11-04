#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv, normalize } from "./audit-flashscore-odds-matches.mjs";

const INPUT = process.env.FLASHSCORE_STATS_FILE || "data/flashscore-statistics.csv";
const JSON_OUTPUT = process.env.FLASHSCORE_COVERAGE_JSON || "flashscore-competition-coverage.json";
const CSV_OUTPUT = process.env.FLASHSCORE_COVERAGE_CSV || "flashscore-competition-coverage.csv";

const METRICS = {
  corners: ["corners_home", "corners_away"],
  shots: ["shots_home", "shots_away"],
  shots_on_target: ["shots_on_target_home", "shots_on_target_away"],
  xg: ["xg_home", "xg_away"],
  fouls: ["fouls_home", "fouls_away"],
  yellow_cards: ["yellow_cards_home", "yellow_cards_away"],
  red_cards: ["red_cards_home", "red_cards_away"]
};
const present = value => String(value ?? "").trim() !== "";

// Aliases confirmed by the collected Flashscore labels. Keep this list explicit:
// similar-looking leagues and different competition phases must not be merged.
const COUNTRY_ALIASES = new Map([["europe", "europa"]]);
const COMPETITION_ALIASES = new Map([
  ["europa|champions league league phase", "liga dos campeoes fase de liga"],
  ["europa|liga dos campeoes fase de liga", "liga dos campeoes fase de liga"]
]);
const canonicalCountry = value => COUNTRY_ALIASES.get(normalize(value)) || normalize(value);
const canonicalCompetition = (country, value) => {
  const key = canonicalCountry(country) + "|" + normalize(value);
  return COMPETITION_ALIASES.get(key) || normalize(value);
};
const dateOf = value => String(value ?? "").match(/^\s*(\d{4}-\d{2}-\d{2})/)?.[1] || "";
const classify = name => {
  const value = normalize(name);
  if (/\b(women|feminina|feminino|ladies)\b/.test(value)) return "feminino";
  if (/\b(u ?1[789]|under ?1[789]|youth|junior|sub ?1[789])\b/.test(value)) return "formacao";
  if (/\b(cup|copa|taça|taca|pokal|coppa|copa|knockout)\b/.test(value)) return "taca";
  if (/\b(champions league|europa league|conference league|libertadores|sudamericana|afc|concacaf|uefa)\b/.test(value)) return "internacional";
  if (/\b(playoffs?|play ?off|promotion|relegation|fase de)\b/.test(value)) return "fase_especial";
  return "liga";
};
const csvCell = value => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

export function buildFlashscoreCoverage(records) {
  if (!Array.isArray(records) || records.length === 0) throw new Error("O CSV Flashscore está vazio.");
  const byCompetition = new Map();
  const ids = new Set();
  let duplicateIds = 0, rowsWithoutIdentity = 0;
  const rawLabels = new Set();
  for (const row of records) {
    const id = String(row.match_id || "").trim();
    if (id && ids.has(id)) duplicateIds++;
    if (id) ids.add(id);
    const country = String(row.country || "").trim();
    const competition = String(row.competition || "").trim();
    if (!country || !competition) { rowsWithoutIdentity++; continue; }
    rawLabels.add(normalize(country) + "|" + normalize(competition));
    const canonicalCountryKey = canonicalCountry(country);
    const canonicalCompetitionKey = canonicalCompetition(country, competition);\n    const key = canonicalCountryKey + "|" + canonicalCompetitionKey;
    let item = byCompetition.get(key);
    if (!item) {
      item = { country, competition, match_ids: new Set(), rows: 0, dates: [], metrics: Object.fromEntries(Object.keys(METRICS).map(k => [k, 0])) };
      byCompetition.set(key, item);
    }
    item.rows++;
    if (id) item.match_ids.add(id);
    const date = dateOf(row.date_time);
    if (date) item.dates.push(date);
    for (const [metric, fields] of Object.entries(METRICS)) {
      if (fields.every(field => present(row[field]))) item.metrics[metric]++;
    }
  }

  const competitions = [...byCompetition.values()].map(item => {
    const games = item.match_ids.size || item.rows;
    const metrics = Object.fromEntries(Object.entries(item.metrics).map(([key, count]) => [key, {
      complete_matches: count,
      coverage_pct: games ? Math.round(count / games * 1000) / 10 : 0
    }]));
    const dates = item.dates.sort();
    const sample_status = games >= 10 ? "amostra_inicial_10+" : games >= 5 ? "em_desenvolvimento_5_9" : "amostra_curta_1_4";
    return {
      country: item.country,
      competition: item.competition,
      normalized_key: normalize(item.country) + "|" + normalize(item.competition),
      category: classify(item.competition),
      unique_matches: games,
      duplicate_rows: item.rows - games,
      date_from: dates[0] || null,
      date_to: dates.at(-1) || null,
      sample_status,
      metrics
    };
  }).sort((a, b) => b.unique_matches - a.unique_matches || a.country.localeCompare(b.country) || a.competition.localeCompare(b.competition));

  const countAtLeast = n => competitions.filter(item => item.unique_matches >= n).length;
  const totalUniqueMatches = ids.size;
  return {
    generated_at: new Date().toISOString(),
    source: "Flashscore",
    source_file: INPUT,
    scope: "Apenas jogos já presentes no CSV de estatísticas Flashscore; não representa o catálogo completo de competições disponíveis no site.",
    source_rows: records.length,
    unique_match_ids: totalUniqueMatches,
    duplicate_match_id_rows: duplicateIds,
    rows_without_competition_identity: rowsWithoutIdentity,
    raw_competition_label_count: rawLabels.size,
    competition_count: competitions.length,\n    merged_alias_label_count: rawLabels.size - competitions.length,
    competitions_with_5_plus_matches: countAtLeast(5),
    competitions_with_10_plus_matches: countAtLeast(10),
    competitions_with_20_plus_matches: countAtLeast(20),
    competitions
  };
}

export function coverageCsv(report) {
  const metrics = Object.keys(METRICS);
  const header = ["country", "competition", "category", "unique_matches", "duplicate_rows", "date_from", "date_to", "sample_status",
    ...metrics.flatMap(key => [key + "_complete_matches", key + "_coverage_pct"])];
  const lines = [header.join(",")];
  for (const item of report.competitions) {
    const row = [item.country, item.competition, item.category, item.unique_matches, item.duplicate_rows, item.date_from || "", item.date_to || "", item.sample_status];
    for (const key of metrics) row.push(item.metrics[key].complete_matches, item.metrics[key].coverage_pct);
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const records = parseCsv(await readFile(INPUT, "utf8"));
  const report = buildFlashscoreCoverage(records);
  await writeFile(JSON_OUTPUT, JSON.stringify(report, null, 2) + "\n");
  await writeFile(CSV_OUTPUT, coverageCsv(report));
  console.log(JSON.stringify({
    source_rows: report.source_rows,
    unique_match_ids: report.unique_match_ids,
    raw_competition_label_count: report.raw_competition_label_count,
    competition_count: report.competition_count,\n    merged_alias_label_count: report.merged_alias_label_count,
    competitions_with_5_plus_matches: report.competitions_with_5_plus_matches,
    competitions_with_10_plus_matches: report.competitions_with_10_plus_matches,
    competitions_with_20_plus_matches: report.competitions_with_20_plus_matches,
    top_competitions: report.competitions.slice(0, 25).map(({country, competition, unique_matches, sample_status, metrics}) => ({
      country, competition, unique_matches, sample_status,
      corners: metrics.corners, xg: metrics.xg, fouls: metrics.fouls
    }))
  }, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
