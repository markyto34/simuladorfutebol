#!/usr/bin/env node
import { readFile } from "node:fs/promises";

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
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const statsText = await readFile("data/flashscore-statistics.csv", "utf8");
const oddsText = await readFile("data/bwin-odds-flashscore.csv", "utf8");
const stats = parseCsv(statsText), odds = parseCsv(oddsText);
const requiredStats = ["match_id","date_time","home_team","away_team","status","score_home","score_away", ...["xg","possession","shots","shots_on_target","big_chances","corners","yellow_cards","shots_off_target","blocked_shots","shots_inside_box","shots_outside_box","offsides","fouls"].flatMap(k => [k+"_home",k+"_away"]), "source","retrieved_at"];
const requiredOdds = ["match_id","home_team","away_team","bookmaker","market","odd_1","odd_x","odd_2","odds_timestamp_type","retrieved_at","source"];
for (const field of requiredStats) if (!Object.hasOwn(stats[0] || {}, field)) throw new Error("Coluna ausente no CSV estatístico: " + field);
for (const field of requiredOdds) if (!Object.hasOwn(odds[0] || {}, field)) throw new Error("Coluna ausente no CSV Bwin: " + field);

const seenStats = new Set();
for (const row of stats) {
  if (!row.match_id) throw new Error("Registo estatístico sem match_id.");
  if (seenStats.has(row.match_id)) throw new Error("Estatísticas duplicadas para o jogo " + row.match_id);
  seenStats.add(row.match_id);
  if (row.source !== "Flashscore") throw new Error("Fonte estatística inesperada em " + row.match_id);
}
const seenOdds = new Set();
for (const row of odds) {
  if (!row.match_id) throw new Error("Registo de odds sem match_id.");
  if (row.bookmaker !== "Bwin" || row.market !== "1X2" || row.source !== "Flashscore") {
    throw new Error("Registo de odds fora do âmbito Bwin 1X2/Flashscore: " + row.match_id);
  }
  for (const field of ["odd_1","odd_x","odd_2"]) {
    const value = Number(row[field]);
    if (!Number.isFinite(value) || value <= 1 || value > 1000) throw new Error("Odd inválida (" + field + ") no jogo " + row.match_id);
  }
  const key = row.match_id + "|" + row.retrieved_at;
  if (seenOdds.has(key)) throw new Error("Observação de odds duplicada: " + key);
  seenOdds.add(key);
}
console.log("Histórico CSV validado: " + stats.length + " jogos com estatísticas; " + odds.length + " observações Bwin 1X2.");
