import test from "node:test";
import assert from "node:assert/strict";
import { validateSelectedCompetition } from "../scripts/validate-flashscore-selected-competition.mjs";
import { REQUIRED_PAIRS, REQUIRED_SCORE_FIELDS } from "../scripts/backfill-flashscore-selected-indicators.mjs";

const completeRow = Object.fromEntries([
  ["match_id", "match001"],
  ...REQUIRED_SCORE_FIELDS.map(field => [field, "0"]),
  ...REQUIRED_PAIRS.flatMap(key => [[key + "_home", "0"], [key + "_away", "0"]])
]);

test("aceita zero como valor válido e confirma todos os indicadores selecionados", () => {
  const result = validateSelectedCompetition({
    manifest: { fixtures: [{ match_id: "match001" }] },
    rows: [completeRow]
  });
  assert.equal(result.complete, true);
  assert.equal(result.missing.length, 0);
});

test("não conclui a competição quando falta um indicador selecionado", () => {
  const row = { ...completeRow, corners_st_home: "" };
  const result = validateSelectedCompetition({
    manifest: { fixtures: [{ match_id: "match001" }] },
    rows: [row]
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing[0].fields, ["corners_st_home"]);
});

test("não conclui manifesto vazio", () => {
  assert.throws(() => validateSelectedCompetition({ manifest: { fixtures: [] }, rows: [] }), /sem jogos/);
});
