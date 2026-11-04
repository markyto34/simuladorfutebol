"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const helper = source.match(/function validMetricSampleValue\(value\)\{[^}]+\}/);
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

test("A amostra é calculada por indicador e não exige estatísticas alheias completas", () => {
  const start = source.indexOf("function teamSample(");
  const end = source.indexOf("\nfunction mean(", start);
  const body = source.slice(start, end);
  assert.ok(body.includes(".map(x=>valueFrom(x.m,x.w,x.h))"));
  assert.ok(body.includes(".filter(validMetricSampleValue)"));
  assert.ok(!body.includes("records.filter(x=>complete(x.m,x.w))"));
});

const identityHelper = source.match(/function sameFixtureIdentity\(primary,secondary,date\)\{[^}]+\}/);
assert.ok(identityHelper, "A identidade de um encontro deve ser independente do resultado.");
const identityContext = { wdwTeamKey: value => String(value || "").toLowerCase().replace(/\s+/g, " ").trim() };
vm.createContext(identityContext);
vm.runInContext(identityHelper[0] + ";this.sameFixtureIdentity=sameFixtureIdentity;", identityContext);

test("A identidade do encontro impede duplicados mesmo quando os resultados divergem", () => {
  const primary = { date: "2026-11-01", home: "FC Porto", away: "Estoril Praia", hg: 2, ag: 0 };
  const secondary = { dateKey: "11-01", home: "FC Porto", away: "Estoril Praia", hg: 1, ag: 0 };
  assert.equal(identityContext.sameFixtureIdentity(primary, secondary, "2026-11-01"), true);
  assert.equal(identityContext.sameFixtureIdentity(primary, secondary, "2026-11-02"), false);
  assert.equal(identityContext.sameFixtureIdentity(primary, { ...secondary, away: "Sporting CP" }, "2026-11-01"), false);
  const teamSampleStart = source.indexOf("function teamSample(");
  const teamSampleEnd = source.indexOf("\nfunction mean(", teamSampleStart);
  const teamSampleBody = source.slice(teamSampleStart, teamSampleEnd);
  assert.ok(!teamSampleBody.includes("records.push({m:{date:wdwMatchDate(w)"),
    "a amostra não pode adicionar jogos WinDrawWin fora da competição selecionada");
  assert.ok(teamSampleBody.includes("const records=primary.map(m=>({m,w:matching(m),h:m.home===team,wdwOnly:false}))"),
    "a amostra deve ser construída exclusivamente com jogos da competição selecionada");
  assert.ok(teamSampleBody.includes("sameFixtureIdentity(m,w,date)&&m.hg===w.hg&&m.ag===w.ag"),
    "a correspondência para enriquecer estatísticas continua a exigir resultado igual");
});
