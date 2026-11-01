"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const csv = require("../csv-odds-core.js");

test("lê CSV com BOM, aspas, vírgulas e linhas CRLF", () => {
  const input = '\uFEFFdate_time,TEAM_HOME,TEAM_AWAY\r\n2026-01-01,"A, FC","B ""United"""\r\n';
  const rows = csv.parseCSV(input);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].TEAM_HOME, "A, FC");
  assert.equal(rows[0].TEAM_AWAY, 'B "United"');
});

test("classifica apenas jogos com resultado final completo", () => {
  const rows = csv.normalizeRows([
    {date_time:"2026-01-01 12:00:00",TEAM_HOME:"A",TEAM_AWAY:"B",score_final_home:"2",score_final_away:"1",odd_ft_1:"1.50",odd_ft_x:"4.0",odd_ft_2:"6.0"},
    {date_time:"2026-01-02 12:00:00",TEAM_HOME:"C",TEAM_AWAY:"D",score_final_home:"",score_final_away:"",odd_ft_1:"2.0",odd_ft_x:"3.0",odd_ft_2:"4.0"}
  ]);
  assert.equal(rows[0].outcome, "1");
  assert.equal(rows[0].completed, true);
  assert.equal(rows[1].outcome, null);
  assert.equal(rows[1].completed, false);
});

test("calcula frequências e intervalo de odds sem incluir pendentes", () => {
  const rows = csv.normalizeRows([
    {TEAM_HOME:"A",TEAM_AWAY:"B",score_final_home:"1",score_final_away:"0",odd_ft_1:"1.50"},
    {TEAM_HOME:"C",TEAM_AWAY:"D",score_final_home:"0",score_final_away:"0",odd_ft_1:"1.40"},
    {TEAM_HOME:"E",TEAM_AWAY:"F",score_final_home:"",score_final_away:"",odd_ft_1:"1.45"}
  ]);
  const summary = csv.summarize(rows);
  assert.equal(summary.completed, 2);
  assert.equal(summary.counts["1"], 1);
  assert.equal(summary.counts.X, 1);
  const analysis = csv.analyzeOdds(rows, "1", 1.3, 1.6);
  assert.equal(analysis.count, 2);
  assert.equal(analysis.wins, 1);
  assert.equal(analysis.hitRate, 50);
});

test("filtros por país, competição, equipa e estado", () => {
  const rows = csv.normalizeRows([
    {COUNTRY:"Portugal",LEAGUE:"Liga",TEAM_HOME:"Porto",TEAM_AWAY:"Braga",score_final_home:"2",score_final_away:"0"},
    {COUNTRY:"Spain",LEAGUE:"Liga",TEAM_HOME:"A",TEAM_AWAY:"B",score_final_home:"",score_final_away:""}
  ]);
  const result = csv.filterMatches(rows, {country:"Portugal",league:"Liga",team:"Porto",status:"completed"});
  assert.equal(result.length, 1);
});
