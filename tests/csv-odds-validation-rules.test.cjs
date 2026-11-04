"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { getValidationErrors } = require("../scripts/csv-odds-validation-rules.cjs");

test("não reprova métricas parciais que são legítimas", () => {
  assert.deepEqual(getValidationErrors({
    missingHeaders: [], invalidDate: 0, noTeams: 0, duplicateRows: 0, oddsOutOfRange: 0
  }), []);
});

test("reprova cabeçalhos e registos estruturalmente inválidos", () => {
  const errors = getValidationErrors({
    missingHeaders: ["TEAM_HOME"], invalidDate: 2, noTeams: 1, duplicateRows: 0, oddsOutOfRange: 0
  });
  assert.equal(errors.length, 3);
});

test("reprova jogos duplicados e odds fora do intervalo", () => {
  const errors = getValidationErrors({
    missingHeaders: [], invalidDate: 0, noTeams: 0, duplicateRows: 3, oddsOutOfRange: 2
  });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /Jogos duplicados/);
  assert.match(errors[1], /Odds fora do intervalo/);
});
