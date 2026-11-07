#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  const headers = rows.shift();
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const STAT_CATEGORIES = ["xg","possession","shots","shots_on_target","big_chances","corners","corners_ht","corners_st","yellow_cards","red_cards","shots_off_target","blocked_shots","shots_inside_box","shots_outside_box","offsides","fouls"];
const INTEGER_STATS = new Set(["shots","shots_on_target","big_chances","corners","corners_ht","corners_st","yellow_cards","red_cards","shots_off_target","blocked_shots","shots_inside_box","shots_outside_box","offsides","fouls"]);
const REQUIRED_STATS = ["match_id","date_time","country","competition","home_team","away_team","status","score_home","score_away",
  ...STAT_CATEGORIES.flatMap(key => [key + "_home", key + "_away"]), "source","source_url","retrieved_at"];
const REQUIRED_ODDS = ["match_id","date_time","country","competition","home_team","away_team","bookmaker","market","odd_1","odd_x","odd_2","odds_timestamp_type","retrieved_at","source","source_url"];
const FINAL_STATUSES = /^(Terminado|Tempo Final|Depois de Prolongamento|Após prolongamento|A\.P\.)$/i;
const blank = value => String(value ?? "").trim() === "";

function requireColumns(rows, required, label) {
  for (const field of required) {
    if (!Object.hasOwn(rows[0] || {}, field)) throw new Error("Coluna ausente no CSV " + label + ": " + field);
  }
}

function optionalNumber(value, label, matchId, { integer = false, max = Infinity } = {}) {
  if (blank(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max || (integer && !Number.isInteger(number))) {
    throw new Error("Valor estatístico inválido (" + label + ") no jogo " + matchId + ": " + value);
  }
  return number;
}

export function validateHistory(stats, odds, { statsOnly = false } = {}) {
  if (!Array.isArray(stats) || !stats.length) throw new Error("CSV estatístico vazio.");
  if (!statsOnly && (!Array.isArray(odds) || !odds.length)) throw new Error("CSV de odds vazio.");
  requireColumns(stats, REQUIRED_STATS, "estatístico");
  if (!statsOnly) requireColumns(odds, REQUIRED_ODDS, "Bwin");

  const seenStats = new Set();
  let withScore = 0, withoutScore = 0, finalWithoutScore = 0, withXg = 0, withCorners = 0, withShots = 0, allStats = 0, cornersTotalChecked = 0;
  const cornerTotalMismatches = [];
  const scorePartMismatches = [];
  const competitionCoverage = new Map();
  const indicatorCounts = Object.fromEntries(["score_ft","score_ht","score_st", ...STAT_CATEGORIES].map(key => [key, 0]));
  for (const row of stats) {
    const id = row.match_id;
    if (blank(id)) throw new Error("Registo estatístico sem match_id.");
    if (seenStats.has(id)) throw new Error("Estatísticas duplicadas para o jogo " + id);
    seenStats.add(id);
    if (row.source !== "Flashscore") throw new Error("Fonte estatística inesperada em " + id);
    if (blank(row.country) || blank(row.competition)) throw new Error("País/competição em falta no jogo " + id);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(row.date_time)) throw new Error("Data/hora inválida no jogo " + id);
    if (blank(row.home_team) || blank(row.away_team)) throw new Error("Equipa em falta no jogo " + id);

    const homeBlank = blank(row.score_home), awayBlank = blank(row.score_away);
    if (homeBlank !== awayBlank) throw new Error("Resultado parcial (apenas uma equipa) no jogo " + id);
    if (homeBlank) {
      withoutScore++;
      if (FINAL_STATUSES.test(String(row.status || "").trim())) {
        // O Flashscore pode marcar um evento como terminado sem disponibilizar
        // o resultado no registo. Mantemos o resultado em branco (nunca zero)
        // e contabilizamos a anomalia, sem bloquear checkpoints de outras
        // competições por causa de um único jogo sem resultado.
        finalWithoutScore++;
      }
    } else {
      optionalNumber(row.score_home, "score_home", id, { integer: true, max: 99 });
      optionalNumber(row.score_away, "score_away", id, { integer: true, max: 99 });
      withScore++;
    }

    for (const key of STAT_CATEGORIES) {
      optionalNumber(row[key + "_home"], key + "_home", id, { integer: INTEGER_STATS.has(key), max: key === "possession" ? 100 : Infinity });
      optionalNumber(row[key + "_away"], key + "_away", id, { integer: INTEGER_STATS.has(key), max: key === "possession" ? 100 : Infinity });
    }
    // Campos acrescentados ao esquema sem invalidar o histórico anterior.
    if (Object.hasOwn(row, "red_cards_home") || Object.hasOwn(row, "red_cards_away")) {
      optionalNumber(row.red_cards_home, "red_cards_home", id, { integer: true, max: 99 });
      optionalNumber(row.red_cards_away, "red_cards_away", id, { integer: true, max: 99 });
    }
    const hasHtHome = !blank(row.ht_home), hasHtAway = !blank(row.ht_away);
    const hasShHome = !blank(row.sh_home), hasShAway = !blank(row.sh_away);
    if (hasHtHome !== hasHtAway || hasShHome !== hasShAway) throw new Error("Resultado por partes incompleto no jogo " + id);
    if (hasHtHome) {
      optionalNumber(row.ht_home, "ht_home", id, { integer: true, max: 99 });
      optionalNumber(row.ht_away, "ht_away", id, { integer: true, max: 99 });
    }
    if (hasShHome) {
      optionalNumber(row.sh_home, "sh_home", id, { integer: true, max: 99 });
      optionalNumber(row.sh_away, "sh_away", id, { integer: true, max: 99 });
    }
    if (hasHtHome) indicatorCounts.score_ht++;
    if (hasShHome) indicatorCounts.score_st++;
    if (hasHtHome && hasShHome && !homeBlank) {
      if (Number(row.ht_home) + Number(row.sh_home) !== Number(row.score_home) ||
          Number(row.ht_away) + Number(row.sh_away) !== Number(row.score_away)) {
        scorePartMismatches.push({
          match_id: id,
          score_ft: [Number(row.score_home), Number(row.score_away)],
          score_ht: [Number(row.ht_home), Number(row.ht_away)],
          score_st: [Number(row.sh_home), Number(row.sh_away)]
        });
      }
    }
    const competitionKey = row.country + " | " + row.competition;
    if (!competitionCoverage.has(competitionKey)) competitionCoverage.set(competitionKey, { competition: competitionKey, matches: 0, indicators: Object.fromEntries(["score_ft","score_ht","score_st", ...STAT_CATEGORIES].map(key => [key, 0])) });
    const competition = competitionCoverage.get(competitionKey);
    competition.matches++;
    if (!homeBlank) { indicatorCounts.score_ft++; competition.indicators.score_ft++; }
    if (hasHtHome) competition.indicators.score_ht++;
    if (hasShHome) competition.indicators.score_st++;
    for (const key of STAT_CATEGORIES) {
      const complete = !blank(row[key + "_home"]) && !blank(row[key + "_away"]);
      if (complete) { indicatorCounts[key]++; competition.indicators[key]++; }
    }
    if (!blank(row.xg_home) && !blank(row.xg_away)) withXg++;
    if (!blank(row.corners_home) && !blank(row.corners_away)) withCorners++;
    if (!blank(row.shots_home) && !blank(row.shots_away)) withShots++;
    if (STAT_CATEGORIES.every(key => !blank(row[key + "_home"]) && !blank(row[key + "_away"]))) allStats++;
    const cornerParts = ["corners_ht","corners_st","corners"];
    const cornerValues = Object.fromEntries(cornerParts.map(key => [key, [row[key + "_home"], row[key + "_away"]]]));
    for (const key of ["corners_ht", "corners_st"]) {
      const [homeValue, awayValue] = cornerValues[key];
      if (blank(homeValue) !== blank(awayValue)) throw new Error("Cantos por período incompletos (" + key + ") no jogo " + id);
    }
    if (cornerParts.every(key => cornerValues[key].every(value => !blank(value)))) {
      for (const side of ["home","away"]) {
        const total = Number(row["corners_ht_" + side]) + Number(row["corners_st_" + side]);
        if (total !== Number(row["corners_" + side])) cornerTotalMismatches.push({ match_id: id, side, corners_ht: Number(row["corners_ht_" + side]), corners_st: Number(row["corners_st_" + side]), corners_ft: Number(row["corners_" + side]) });
      }
      cornersTotalChecked++;
    }
  }

  const seenOdds = new Set();
  const oddsByCompetition = new Map();
  if (!statsOnly) for (const row of odds) {
    if (blank(row.match_id)) throw new Error("Registo de odds sem match_id.");
    if (blank(row.country) || blank(row.competition)) throw new Error("País/competição em falta nas odds do jogo " + row.match_id);
    if (blank(row.home_team) || blank(row.away_team)) throw new Error("Equipa em falta nas odds do jogo " + row.match_id);
    if (row.bookmaker !== "Bwin" || row.market !== "1X2" || row.source !== "Flashscore") {
      throw new Error("Registo de odds fora do âmbito Bwin 1X2/Flashscore: " + row.match_id);
    }
    for (const field of ["odd_1","odd_x","odd_2"]) {
      const value = Number(row[field]);
      if (!Number.isFinite(value) || value <= 1 || value > 1000) throw new Error("Odd inválida (" + field + ") no jogo " + row.match_id);
    }
    const key = [row.match_id, row.bookmaker, row.market].join("|");
    if (seenOdds.has(key)) throw new Error("Registo duplicado de odds para jogo/casa/mercado: " + key);
    seenOdds.add(key);
    const competitionKey = row.country + " | " + row.competition;
    oddsByCompetition.set(competitionKey, (oddsByCompetition.get(competitionKey) || 0) + 1);
  }

  return {
    statisticsRows: stats.length,
    oddsRows: statsOnly ? null : odds.length,
    metadataComplete: stats.length,
    withScore,
    withoutScore,
    finalWithoutScore,
    withXg,
    withCorners,
    withShots,
    allStats,
    cornersTotalChecked,
    cornerTotalMismatches,
    scorePartMismatches,
    indicatorCoverage: Object.fromEntries(Object.entries(indicatorCounts).map(([key, count]) => [key, { complete: count, missing: stats.length - count, coveragePercent: Number((count / stats.length * 100).toFixed(2)) }])),
    competitionCoverage: [...competitionCoverage.values()].map(item => ({ ...item, oddsRows: oddsByCompetition.get(item.competition) || 0, indicators: Object.fromEntries(Object.entries(item.indicators).map(([key, count]) => [key, { complete: count, missing: item.matches - count, coveragePercent: Number((count / item.matches * 100).toFixed(2)) }])) })).sort((a,b) => a.competition.localeCompare(b.competition)),
    xgMissingCompetitions: [...competitionCoverage.values()].filter(item => item.matches >= 5 && item.indicators.xg === 0).sort((a, b) => b.matches - a.matches || a.competition.localeCompare(b.competition)),
    xgPartialCompetitions: [...competitionCoverage.values()].filter(item => item.matches >= 5 && item.indicators.xg > 0 && item.indicators.xg < item.matches).sort((a, b) => a.indicators.xg / a.matches - b.indicators.xg / b.matches || b.matches - a.matches),
    uniqueStatsIds: seenStats.size,
    uniqueOddsKeys: seenOdds.size
  };
}

async function main() {
  const statsText = await readFile("data/flashscore-statistics.csv", "utf8");
  const statsOnly = process.argv.includes("--stats-only");
  const oddsText = statsOnly ? "" : await readFile("data/bwin-odds-flashscore.csv", "utf8");
  const summary = validateHistory(parseCsv(statsText), statsOnly ? [] : parseCsv(oddsText), { statsOnly });
  if (summary.finalWithoutScore > 0) {
    console.warn("[WARN] " + summary.finalWithoutScore + " jogos marcados como terminados sem resultado; mantidos sem score e excluídos de cálculos que dependam do resultado.");
  }
  console.log("Histórico CSV validado: " + JSON.stringify(summary));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error("[ERROR] " + (error?.stack || error));
    process.exitCode = 1;
  });
}
