"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../app.js"), "utf8");
const start = source.indexOf("function teamOptionsForSeason(matches){");
const end = source.indexOf("async function loadHistoricalData", start);
assert.ok(start >= 0 && end > start, "A lista de equipas da época carregada deve existir.");
const helper = source.slice(start, source.indexOf("\\n}", start) + 2);
const context = {};
vm.createContext(context);
vm.runInContext(helper + ";this.selectTeams=teamOptionsForSeason;", context);
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
 const body=source.slice(start,end);
 assert.ok(body.includes("matches.flatMap(m=>[m.home,m.away])"));
 assert.ok(!body.includes("completeMatches"));
 assert.ok(!body.includes("isComplete"));
});
test("O carregamento histórico aceita exclusivamente competições Flashscore", () => {
 const loadStart=source.indexOf("async function loadHistoricalData()");
 const loadEnd=source.indexOf("\\nfunction teamSample(",loadStart);
 const loader=source.slice(loadStart,loadEnd);
 assert.ok(loader.includes('if(!league.startsWith("FS|"))'));
 assert.ok(loader.includes("fetchSourceCSV(FLASHSCORE_STATS_CSV_URL)"));
 assert.ok(loader.includes("teamOptionsForSeason(matches)"));
 assert.ok(!/windrawwin|wdw|open-matchday/i.test(loader));
});
