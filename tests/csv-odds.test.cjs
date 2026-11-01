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
    {date_time:"2026-01-01 12:00:00",TEAM_HOME:"A",TEAM_AWAY:"B",score_ft_home:"2",score_ft_away:"1",score_final_home:"2",score_final_away:"1",odd_ft_1:"1.50",odd_ft_x:"4.0",odd_ft_2:"6.0"},
    {date_time:"2026-01-02 12:00:00",TEAM_HOME:"C",TEAM_AWAY:"D",score_ft_home:"",score_ft_away:"",score_final_home:"",score_final_away:"",odd_ft_1:"2.0",odd_ft_x:"3.0",odd_ft_2:"4.0"}
  ]);
  assert.equal(rows[0].outcome, "1");
  assert.equal(rows[0].completed, true);
  assert.equal(rows[1].outcome, null);
  assert.equal(rows[1].completed, false);
});

test("calcula frequências e intervalo de odds sem incluir pendentes", () => {
  const rows = csv.normalizeRows([
    {TEAM_HOME:"A",TEAM_AWAY:"B",score_ft_home:"1",score_ft_away:"0",score_final_home:"1",score_final_away:"0",odd_ft_1:"1.50"},
    {TEAM_HOME:"C",TEAM_AWAY:"D",score_ft_home:"0",score_ft_away:"0",score_final_home:"0",score_final_away:"0",odd_ft_1:"1.40"},
    {TEAM_HOME:"E",TEAM_AWAY:"F",score_ft_home:"",score_ft_away:"",score_final_home:"",score_final_away:"",odd_ft_1:"1.45"}
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
    {COUNTRY:"Portugal",LEAGUE:"Liga",TEAM_HOME:"Porto",TEAM_AWAY:"Braga",score_ft_home:"2",score_ft_away:"0",score_final_home:"2",score_final_away:"0"},
    {COUNTRY:"Spain",LEAGUE:"Liga",TEAM_HOME:"A",TEAM_AWAY:"B",score_ft_home:"",score_ft_away:"",score_final_home:"",score_final_away:""}
  ]);
  const result = csv.filterMatches(rows, {country:"Portugal",league:"Liga",team:"Porto",status:"completed"});
  assert.equal(result.length, 1);
});

test("resultado 1X2 usa FT e não o resultado final que pode incluir prolongamento", () => {
  const [match] = csv.normalizeRows([{
    TEAM_HOME:"Taça FC",TEAM_AWAY:"Extra Time FC",
    score_fh_home:"1",score_fh_away:"1",score_sh_home:"0",score_sh_away:"0",
    score_ft_home:"1",score_ft_away:"1",score_final_home:"2",score_final_away:"1",
    odd_ft_1:"2.10",odd_ft_x:"3.00",odd_ft_2:"3.50"
  }]);
  assert.equal(match.outcome, "X");
  assert.equal(match.completed, true);
  assert.deepEqual(match.ft, [1,1]);
  assert.deepEqual(match.final, [2,1]);
});


test("analisa sempre o conjunto completo de odds 1/X/2", () => {
  const rows = csv.normalizeRows([
    {date_time:"2026-01-01 12:00:00",TEAM_HOME:"A",TEAM_AWAY:"B",score_ft_home:"2",score_ft_away:"0",odd_ft_1:"1.50",odd_ft_x:"4.00",odd_ft_2:"6.00"},
    {date_time:"2026-01-02 12:00:00",TEAM_HOME:"C",TEAM_AWAY:"D",score_ft_home:"1",score_ft_away:"1",odd_ft_1:"2.20",odd_ft_x:"3.20",odd_ft_2:"3.10"},
    {date_time:"2026-01-03 12:00:00",TEAM_HOME:"E",TEAM_AWAY:"F",score_ft_home:"0",score_ft_away:"1",odd_ft_1:"2.00",odd_ft_x:"",odd_ft_2:"3.00"},
    {date_time:"2026-01-04 12:00:00",TEAM_HOME:"G",TEAM_AWAY:"H",score_ft_home:"",score_ft_away:"",odd_ft_1:"2.00",odd_ft_x:"3.00",odd_ft_2:"4.00"}
  ]);
  const result = csv.analyzeTriplet(rows);
  assert.equal(result.count, 2);
  assert.equal(result.outcomes["1"].wins, 1);
  assert.equal(result.outcomes.X.wins, 1);
  assert.equal(result.outcomes["2"].wins, 0);
  assert.equal(result.outcomes["1"].profitUnits, 0.5);
  assert.equal(result.outcomes.X.profitUnits, -1);
  assert.ok(result.outcomes["1"].confidence95.lower < result.outcomes["1"].frequency);
});

test("normaliza as probabilidades 1/X/2 e calcula a margem do mercado", () => {
  const p = csv.impliedProbabilities({"1":2, X:4, "2":4});
  assert.equal(Math.round(p.fair["1"] + p.fair.X + p.fair["2"]), 100);
  assert.equal(Math.round(p.overround * 100) / 100, 0);
  assert.equal(p.fair["1"], 50);
});

test("filtra combinações simultâneas de odds 1/X/2", () => {
  const rows = csv.normalizeRows([
    {TEAM_HOME:"A",TEAM_AWAY:"B",score_ft_home:"1",score_ft_away:"0",odd_ft_1:"1.55",odd_ft_x:"3.50",odd_ft_2:"5.50"},
    {TEAM_HOME:"C",TEAM_AWAY:"D",score_ft_home:"0",score_ft_away:"1",odd_ft_1:"1.55",odd_ft_x:"4.50",odd_ft_2:"5.50"}
  ]);
  const result = csv.analyzeTriplet(rows, {
    "1":{min:1.5,max:1.6}, X:{min:3.2,max:3.8}, "2":{min:5,max:6}
  });
  assert.equal(result.count, 1);
  assert.equal(result.outcomes["1"].wins, 1);
});

test("compara odds atuais com jogos históricos de perfil semelhante", () => {
  const rows = csv.normalizeRows([
    {TEAM_HOME:"A",TEAM_AWAY:"B",score_ft_home:"1",score_ft_away:"0",odd_ft_1:"1.50",odd_ft_x:"4.00",odd_ft_2:"6.00"},
    {TEAM_HOME:"C",TEAM_AWAY:"D",score_ft_home:"0",score_ft_away:"0",odd_ft_1:"1.55",odd_ft_x:"3.95",odd_ft_2:"6.10"},
    {TEAM_HOME:"E",TEAM_AWAY:"F",score_ft_home:"0",score_ft_away:"1",odd_ft_1:"3.00",odd_ft_x:"3.00",odd_ft_2:"2.50"}
  ]);
  const result = csv.evaluateCurrentOdds(rows, {"1":1.52,X:4,"2":6.05}, 0.1);
  assert.equal(result.sample, 2);
  assert.equal(result.historical["1"].wins, 1);
  assert.ok(result.market.fair["1"] > 0);
});

test("backtesting separa treino e validação por data", () => {
  const rows = csv.normalizeRows([
    {date_time:"2025-01-01 12:00:00",TEAM_HOME:"A",TEAM_AWAY:"B",score_ft_home:"1",score_ft_away:"0",odd_ft_1:"1.50",odd_ft_x:"4.00",odd_ft_2:"6.00"},
    {date_time:"2026-01-01 12:00:00",TEAM_HOME:"C",TEAM_AWAY:"D",score_ft_home:"0",score_ft_away:"1",odd_ft_1:"1.50",odd_ft_x:"4.00",odd_ft_2:"6.00"}
  ]);
  const result = csv.backtestTriplet(rows, undefined, "2026-01-01");
  assert.equal(result.training.count, 1);
  assert.equal(result.validation.count, 1);
});
