"use strict";
const fs = require("node:fs");
const core = require("../csv-odds-core.js");
const file = "ganhonasodds_com_20261101.csv";
if (!fs.existsSync(file)) throw new Error("CSV não encontrado na raiz do repositório: " + file);
const text = fs.readFileSync(file, "utf8");
const rows = core.parseCSV(text);
if (!rows.length) throw new Error("Parser não encontrou linhas de dados.");
const headers = Object.keys(rows[0]);
const required = ["date_time","COUNTRY","LEAGUE","TEAM_HOME","TEAM_AWAY","odd_ft_1","odd_ft_x","odd_ft_2","score_fh_home","score_fh_away","score_sh_home","score_sh_away","score_ft_home","score_ft_away","score_final_home","score_final_away"];
const missingHeaders = required.filter(h => !headers.includes(h));
const matches = core.normalizeRows(rows);
const completed = matches.filter(m => m.completed);
const pending = matches.length - completed.length;
const invalidDate = matches.filter(m => !m.date).length;
const invalidOdds = matches.filter(m => ["1","X","2"].some(k => m.odds[k] !== null && m.odds[k] <= 1)).length;
const noTeams = matches.filter(m => !m.home || !m.away).length;
const leagueCounts = new Map();
const countryCounts = new Map();
for (const m of matches) {
  if (m.league) leagueCounts.set(m.league,(leagueCounts.get(m.league)||0)+1);
  if (m.country) countryCounts.set(m.country,(countryCounts.get(m.country)||0)+1);
}
const out = {
 file, bytes: Buffer.byteLength(text), rows: matches.length, columns: headers.length,
 headers, missingHeaders,
 completed: completed.length, pending,
 invalidDate, invalidOdds, noTeams,
 distinctLeagues: leagueCounts.size, distinctCountries: countryCounts.size,
 dateMin: matches.filter(m=>m.date).map(m=>m.date.toISOString()).sort()[0] || null,
 dateMax: matches.filter(m=>m.date).map(m=>m.date.toISOString()).sort().at(-1) || null,
 scoreSamples: matches.filter(m=>m.completed).slice(0,8).map(m=>({home:m.home,away:m.away,ht:m.ht,secondHalf:m.secondHalf,ft:m.ft,final:m.final,odds:m.odds,outcome:m.outcome})),
 topLeagues: [...leagueCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([league,count])=>({league,count})),
 topCountries: [...countryCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([country,count])=>({country,count}))
};
fs.writeFileSync("csv-odds-validation.json", JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
if (missingHeaders.length) process.exitCode=1;
