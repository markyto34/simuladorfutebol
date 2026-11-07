"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const helper = source.match(/function validMetricSampleValue\\(value\\)\\{[^}]+\\}/);
assert.ok(helper, "A validação individual de cada indicador deve existir.");
const context = {};
vm.createContext(context);
vm.runInContext(helper[0] + ";this.validMetricSampleValue=validMetricSampleValue;", context);

test("Aceita valores numéricos válidos, incluindo zero", () => {
  assert.equal(context.validMetricSampleValue(0), true);
  assert.equal(context.validMetricSampleValue("2.5"), true);
});
test("Rejeita valores ausentes, negativos ou não numéricos", () => {
  for (const value of [null, undefined, "", "N/D", -1, NaN, Infinity]) {
    assert.equal(context.validMetricSampleValue(value), false);
  }
});
test("A amostra calcula cada indicador diretamente nos jogos Flashscore", () => {
  const start = source.indexOf("function teamSample(");
  const end = source.indexOf("\\nfunction mean(", start);
  const body = source.slice(start, end);
  assert.ok(body.includes("dataState.matches.filter"));
  assert.ok(body.includes("matches.map(m=>sourceValue(m,m.home===team))"));
  assert.ok(body.includes(".filter(validMetricSampleValue)"));
  assert.ok(!/windrawwin|wdw|open-matchday/i.test(body));
});
