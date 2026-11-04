"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../app.js"), "utf8");
const match = source.match(/function teamOptionsForSeason\\(matches\\)\\{[\\s\\S]*?\\n\\}/);
assert.ok(match, "A lista de equipas da época carregada deve existir.");
const context = {};
vm.createContext(context);
vm.runInContext(match[0] + ";this.selectTeams=teamOptionsForSeason;", context);
const complete = {home:"Porto",away:"Braga"};
const partial = {home:"Estoril",away:"Arouca"};
const all = [complete,partial];
test("Inclui equipas com dados parciais para a cobertura ser validada por indicador", () => {
 assert.deepEqual(Array.from(context.selectTeams(all)),["Arouca","Braga","Estoril","Porto"]);
});
test("Não inventa equipas quando a competição não tem resultados", () => {
 assert.deepEqual(Array.from(context.selectTeams([])),[]);
});
test("A seleção não filtra equipas por completude global do jogo", () => {
 const start=source.indexOf("function teamOptionsForSeason(matches)");
 const end=source.indexOf("\\nasync function loadHistoricalData",start);
 const body=source.slice(start,end);
 assert.ok(body.includes("matches.flatMap(m=>[m.home,m.away])"));
 assert.ok(!body.includes("completeMatches"));
 assert.ok(!body.includes("isComplete"));
});
test("A época atual combina equipas da fonte principal com o índice WDW", () => {
 assert.match(source, /async function loadWdwLeagueTeams\\(leagueId\\)/);
 assert.match(source, /wdwTeams\\.map\\(x=>x\\.name\\)/);
 assert.match(source, /if\\(!matches\\.length&&!teams\\.length\\)/);
 assert.match(source, /Sem resultados Open Matchday/);
});
test("O carregamento usa a lista de equipas da fonte principal e do índice WDW", () => {
 const start=source.indexOf("async function loadHistoricalData()");
 const end=source.indexOf("\\nfunction sameFixtureIdentity(",start);
 const loader=source.slice(start,end);
 assert.ok(loader.includes("loadWdwLeagueTeams(league)"));
 assert.ok(loader.includes("primaryTeams,...wdwTeams.map"));
 assert.ok(loader.includes("dataState.matches=matches"));
 assert.ok(loader.includes("teamOptionsForSeason(matches)"));
});
