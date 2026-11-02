"use strict";
const fs = require("node:fs");
const core = require("../csv-odds-core.js");
const file = "ganhonasodds_com_20261101.csv";
const text = fs.readFileSync(file, "utf8");
const rows = core.parseCSV(text);
if (!rows.length) throw new Error("CSV vazio ou ilegível.");
const headers = Object.keys(rows[0]);
const required = ["date_time","COUNTRY","LEAGUE","TEAM_HOME","TEAM_AWAY","odd_ft_1","odd_ft_x","odd_ft_2","score_fh_home","score_fh_away","score_sh_home","score_sh_away","score_ft_home","score_ft_away","score_final_home","score_final_away"];
const missingHeaders = required.filter(h => !headers.includes(h));
const matches = core.normalizeRows(rows);
const completed = matches.filter(m => m.completed);
const pending = matches.length - completed.length;
const countMissing = key => rows.filter(r => !String(r[key] ?? "").trim()).length;
const mismatch = (a,b) => a[0] !== null && a[1] !== null && b[0] !== null && b[1] !== null && (a[0] !== b[0] || a[1] !== b[1]);
const ftFinalMismatch = matches.filter(m => mismatch(m.ft,m.final)).length;
const halfSumMismatch = matches.filter(m => m.ht.every(Number.isInteger) && m.secondHalf.every(Number.isInteger) && m.ft.every(Number.isInteger) &&
  (m.ht[0]+m.secondHalf[0] !== m.ft[0] || m.ht[1]+m.secondHalf[1] !== m.ft[1])).length;
const oddsMissing = Object.fromEntries(["1","X","2"].map(k=>[k,matches.filter(m=>m.odds[k]===null).length]));
const oddsOutOfRange = matches.filter(m=>["1","X","2"].some(k=>m.odds[k]!==null&&(m.odds[k]<=1||m.odds[k]>1000))).length;
const invalidDate = matches.filter(m => !m.date).length;
const noTeams = matches.filter(m => !m.home || !m.away).length;
const teams = new Set(matches.flatMap(m=>[m.home,m.away]).filter(Boolean));
const leaguePairs = new Set(matches.filter(m=>m.country&&m.league).map(m=>m.country+" :: "+m.league));
const duplicateKeys = new Map();
for (const m of matches) {
  const key=[m.dateRaw,m.country,m.league,m.home,m.away].join("|");
  duplicateKeys.set(key,(duplicateKeys.get(key)||0)+1);
}
const duplicateRows = [...duplicateKeys.values()].filter(n=>n>1).reduce((n,v)=>n+v-1,0);
const dateValues = matches.filter(m=>m.date).map(m=>m.date.toISOString()).sort();
const validationTime = new Date();
const futureAfterValidationTime = matches.filter(m => m.date && m.date > validationTime).length;
const leagueCounts = new Map(), countryCounts = new Map();
for (const m of matches) {
  if (m.league) leagueCounts.set(m.league,(leagueCounts.get(m.league)||0)+1);
  if (m.country) countryCounts.set(m.country,(countryCounts.get(m.country)||0)+1);
}
const out = {
 file, bytes: Buffer.byteLength(text), rows: matches.length, columns: headers.length, headers, missingHeaders,
 completed: completed.length, pending,
 dateMin: dateValues[0] || null, dateMax: dateValues.at(-1) || null, validatedAt: validationTime.toISOString(), futureAfterValidationTime,
 invalidDate, noTeams, distinctLeagues: leagueCounts.size, distinctCountries: countryCounts.size,
 distinctTeams: teams.size, distinctCountryLeaguePairs: leaguePairs.size, duplicateRows,
 missingValues: Object.fromEntries(required.map(k=>[k,countMissing(k)])),
 oddsMissing, oddsOutOfRange, ftFinalMismatch, halfSumMismatch,
 mismatchExamples: matches.filter(m => mismatch(m.ft,m.final)).slice(0,25).map(m=>({date:m.dateRaw,country:m.country,league:m.league,home:m.home,away:m.away,ht:m.ht,secondHalf:m.secondHalf,ft:m.ft,final:m.final})),
 topLeagues: [...leagueCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([league,count])=>({league,count})),
 topCountries: [...countryCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([country,count])=>({country,count}))
};
fs.writeFileSync("csv-odds-validation.json", JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
if (missingHeaders.length || invalidDate || noTeams) process.exitCode=1;
