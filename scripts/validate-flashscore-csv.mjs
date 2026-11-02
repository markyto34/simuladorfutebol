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
const ids = [...new Set(process.argv.slice(2))];
if (ids.length < 3 || ids.length > 5) throw new Error("O teste deve conter entre 3 e 5 IDs únicos.");
const statsText = await readFile("data/flashscore-statistics.csv", "utf8");
const oddsText = await readFile("data/bwin-odds-flashscore.csv", "utf8");
const stats = parseCsv(statsText), odds = parseCsv(oddsText);
const statHeaders = Object.keys(stats[0] || {});
const oddsHeaders = Object.keys(odds[0] || {});
const statFields = ["match_id","date_time","home_team","away_team", ...["xg","possession","shots","shots_on_target","big_chances","corners","yellow_cards","shots_off_target","blocked_shots","shots_inside_box","shots_outside_box","offsides","fouls"].flatMap(k => [k+"_home",k+"_away"])];
const oddsFields = ["match_id","bookmaker","market","odd_1","odd_x","odd_2","retrieved_at"];
for (const field of statFields) if (!statHeaders.includes(field)) throw new Error("Coluna ausente no CSV de estatísticas: "+field);
for (const field of oddsFields) if (!oddsHeaders.includes(field)) throw new Error("Coluna ausente no CSV de odds: "+field);
let incomplete = 0, bwinObservations = 0;
for (const id of ids) {
  const rows = stats.filter(row => row.match_id === id);
  if (rows.length !== 1) throw new Error(id+": esperado exatamente um registo de estatísticas; encontrados "+rows.length+".");
  const row = rows[0];
  const missing = statFields.filter(field => field.endsWith("_home") || field.endsWith("_away")).filter(field => row[field] === "");
  if (missing.length) { incomplete++; console.log("AVISO "+id+": "+missing.length+" campos estatísticos vazios (não serão inventados)."); }
  const observations = odds.filter(row => row.match_id === id);
  for (const odd of observations) {
    if (odd.bookmaker !== "Bwin" || odd.market !== "1X2") throw new Error(id+": foi encontrado um registo de odds que não é Bwin 1X2.");
    for (const field of ["odd_1","odd_x","odd_2"]) {
      const n = Number(odd[field]);
      if (!Number.isFinite(n) || n <= 1) throw new Error(id+": odd inválida em "+field+".");
    }
  }
  bwinObservations += observations.length;
  if (!observations.length) console.log("AVISO "+id+": sem odds Bwin 1X2 confirmadas; jogo mantém-se apenas no CSV estatístico.");
}
console.log("VALIDAÇÃO APROVADA: "+ids.length+" jogos, sem duplicados de estatísticas; "+bwinObservations+" observações Bwin 1X2.");
console.log("Qualidade: "+incomplete+" jogos com pelo menos um campo estatístico vazio. Consultar avisos acima.");
