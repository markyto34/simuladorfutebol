"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../app.js"), "utf8");
const match = source.match(/function teamOptionsForSeason\(matches,completeMatches,allowWdw\)\{[\s\S]*?\n\}/);
assert.ok(match, "A seleção de equipas por época deve existir.");
const context = {};
vm.createContext(context);
vm.runInContext(match[0] + ";this.selectTeams=teamOptionsForSeason;", context);
const complete = {home:"Porto",away:"Braga"};
const partial = {home:"Estoril",away:"Arouca"};
const all = [complete,partial];
test("Na época atual, apresenta equipas candidatas para validação WDW mesmo sem jogos completos na fonte principal", () => {
 assert.deepEqual(Array.from(context.selectTeams(all,[complete],true)),["Arouca","Braga","Estoril","Porto"]);
});
test("Em épocas históricas, só apresenta equipas com jogos completos na fonte principal", () => {
 assert.deepEqual(Array.from(context.selectTeams(all,[complete],false)),["Braga","Porto"]);
});
test("Não inventa equipas quando não há resultados elegíveis", () => {
 assert.deepEqual(Array.from(context.selectTeams([],[],true)),[]);
 assert.deepEqual(Array.from(context.selectTeams(all,[],false)),[]);
});
