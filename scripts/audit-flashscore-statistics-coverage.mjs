#!/usr/bin/env node
/**
 * Auditoria read-only da cobertura dos CSVs Flashscore/Bwin.
 * Não recolhe dados nem altera os CSVs de origem.
 * Uso: node scripts/audit-flashscore-statistics-coverage.mjs [--out=ficheiro.json]
 */
import { readFile, writeFile } from "node:fs/promises";

export const STAT_CATEGORIES = [
  "xg", "possession", "shots", "shots_on_target", "big_chances", "corners", "corners_ht", "corners_st",
  "yellow_cards", "red_cards", "shots_off_target", "blocked_shots", "shots_inside_box",
  "shots_outside_box", "offsides", "fouls"
];

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

const blank = value => String(value ?? "").trim() === "";
const numberOrNull = value => blank(value) ? null : (Number.isFinite(Number(value)) ? Number(value) : null);

export function auditCoverage(stats, odds) {
  if (!Array.isArray(stats) || !Array.isArray(odds)) throw new Error("É necessário fornecer arrays de estatísticas e odds.");
  const required = ["match_id", "country", "competition", "home_team", "away_team",
    ...STAT_CATEGORIES.flatMap(key => [key + "_home", key + "_away"])];
  const headers = new Set(Object.keys(stats[0] || {}));
  for (const field of required) if (!headers.has(field)) throw new Error("Coluna obrigatória ausente no CSV estatístico: " + field);

  const oddsById = new Map();
  for (const quote of odds) {
    if (quote.bookmaker !== "Bwin" || quote.market !== "1X2" || blank(quote.match_id)) continue;
    const list = oddsById.get(quote.match_id) || [];
    list.push(quote);
    oddsById.set(quote.match_id, list);
  }

  const categoryCounts = Object.fromEntries(STAT_CATEGORIES.map(key => [key, { complete: 0, partial: 0, missing: 0 }]));
  const matches = [];
  const competitions = new Map();
  const seen = new Set();
  for (const row of stats) {
    const id = String(row.match_id || "").trim();
    if (!id) throw new Error("Existe uma linha estatística sem match_id.");
    if (seen.has(id)) throw new Error("Existem linhas estatísticas duplicadas para o jogo " + id);
    seen.add(id);

    const missingCategories = [], partialCategories = [], completeCategories = [];
    const categoryValues = {};
    for (const key of STAT_CATEGORIES) {
      const homeMissing = blank(row[key + "_home"]), awayMissing = blank(row[key + "_away"]);
      categoryValues[key] = { home: numberOrNull(row[key + "_home"]), away: numberOrNull(row[key + "_away"]) };
      if (homeMissing && awayMissing) { missingCategories.push(key); categoryCounts[key].missing++; }
      else if (homeMissing || awayMissing) { partialCategories.push(key); categoryCounts[key].partial++; }
      else { completeCategories.push(key); categoryCounts[key].complete++; }
    }

    const corners = {};
    let cornersSumStatus = "não verificável";
    for (const side of ["home", "away"]) {
      const total = numberOrNull(row["corners_" + side]);
      const ht = numberOrNull(row["corners_ht_" + side]);
      const st = numberOrNull(row["corners_st_" + side]);
      corners[side] = { total, first_half: ht, second_half: st };
    }
    if (["home", "away"].every(side => Object.values(corners[side]).every(value => value !== null))) {
      const mismatches = ["home", "away"].filter(side => corners[side].first_half + corners[side].second_half !== corners[side].total);
      cornersSumStatus = mismatches.length ? "divergência" : "coerente";
    }

    const quoteRows = oddsById.get(id) || [];
    const validOdds = quoteRows.filter(q => ["odd_1", "odd_x", "odd_2"].every(field => {
      const n = Number(q[field]); return Number.isFinite(n) && n > 1 && n <= 1000;
    }));
    const item = {
      match_id: id, country: row.country, competition: row.competition,
      home_team: row.home_team, away_team: row.away_team, date_time: row.date_time || "",
      complete_categories: completeCategories.length, partial_categories: partialCategories.length,
      missing_categories: missingCategories, partial_category_names: partialCategories,
      missing_fields: [...missingCategories.flatMap(key => [key + "_home", key + "_away"]),
        ...partialCategories.flatMap(key => [blank(row[key + "_home"]) ? key + "_home" : null, blank(row[key + "_away"]) ? key + "_away" : null].filter(Boolean))],
      category_values: categoryValues, corners, corners_sum_status: cornersSumStatus,
      bwin_1x2_rows: quoteRows.length, bwin_1x2_valid_rows: validOdds.length,
      bwin_1x2_status: validOdds.length ? "válidas" : quoteRows.length ? "inválidas" : "sem registo"
    };
    matches.push(item);
    const key = [row.country, row.competition].join(" | ");
    if (!competitions.has(key)) competitions.set(key, { country: row.country, competition: row.competition, matches: 0, all_16_categories: 0, categories: Object.fromEntries(STAT_CATEGORIES.map(k => [k, { complete: 0, partial: 0, missing: 0 }])), bwin_with_valid_odds: 0, corners_coherent: 0, corners_mismatch: 0, corners_unverifiable: 0 });
    const group = competitions.get(key);
    group.matches++;
    if (completeCategories.length === STAT_CATEGORIES.length) group.all_16_categories++;
    for (const k of STAT_CATEGORIES) {
      const state = missingCategories.includes(k) ? "missing" : partialCategories.includes(k) ? "partial" : "complete";
      group.categories[k][state]++;
    }
    if (validOdds.length) group.bwin_with_valid_odds++;
    if (cornersSumStatus === "coerente") group.corners_coherent++;
    else if (cornersSumStatus === "divergência") group.corners_mismatch++;
    else group.corners_unverifiable++;
  }
  return {
    generated_at: new Date().toISOString(), read_only: true,
    definitions: { category_count: STAT_CATEGORIES.length, categories: STAT_CATEGORIES, complete: "valores casa e fora preenchidos", partial: "apenas um dos lados preenchido", missing: "ambos os lados vazios" },
    totals: {
      matches: matches.length,
      all_16_categories_complete: matches.filter(m => m.complete_categories === STAT_CATEGORIES.length).length,
      with_any_missing_or_partial_category: matches.filter(m => m.missing_categories.length || m.partial_category_names.length).length,
      with_valid_bwin_1x2: matches.filter(m => m.bwin_1x2_valid_rows > 0).length,
      corners_coherent: matches.filter(m => m.corners_sum_status === "coerente").length,
      corners_mismatch: matches.filter(m => m.corners_sum_status === "divergência").length,
      corners_unverifiable: matches.filter(m => m.corners_sum_status === "não verificável").length
    },
    category_coverage: categoryCounts,
    competitions: [...competitions.values()].sort((a,b) => String(a.country).localeCompare(String(b.country)) || String(a.competition).localeCompare(String(b.competition))),
    matches
  };
}

async function main() {
  const outputArg = process.argv.slice(2).find(arg => arg.startsWith("--out="));
  const stats = parseCsv(await readFile("data/flashscore-statistics.csv", "utf8"));
  const odds = parseCsv(await readFile("data/bwin-odds-flashscore.csv", "utf8"));
  const report = auditCoverage(stats, odds);
  const json = JSON.stringify(report, null, 2) + "\n";
  if (outputArg) {
    const path = outputArg.slice("--out=".length);
    if (!path) throw new Error("O argumento --out requer um caminho.");
    await writeFile(path, json, "utf8");
    console.log("Auditoria concluída: " + report.totals.matches + " jogos. Relatório: " + path);
  } else console.log(json);
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
