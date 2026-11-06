import test from "node:test";
import assert from "node:assert/strict";
import { auditCoverage, parseCsv, STAT_CATEGORIES } from "../scripts/audit-flashscore-statistics-coverage.mjs";

function fixture(overrides = {}) {
  const row = { match_id: "ABC12345", country: "Asia", competition: "AFC Champions League", home_team: "Home", away_team: "Away" };
  for (const key of STAT_CATEGORIES) { row[key + "_home"] = "1"; row[key + "_away"] = "2"; }
  Object.assign(row, { corners_home: "4", corners_away: "5", corners_ht_home: "2", corners_ht_away: "2", corners_st_home: "2", corners_st_away: "3" }, overrides);
  return row;
}

test("CSV parser respeita vírgulas e aspas dentro dos campos", () => {
  assert.deepEqual(parseCsv('id,nome\n1,"Equipa, ""A"""\n'), [{ id: "1", nome: 'Equipa, "A"' }]);
});

test("auditoria reconhece cobertura completa, cantos coerentes e odds Bwin", () => {
  const result = auditCoverage([fixture()], [{ match_id: "ABC12345", bookmaker: "Bwin", market: "1X2", odd_1: "2.1", odd_x: "3.2", odd_2: "3.4" }]);
  assert.equal(result.totals.matches, 1);
  assert.equal(result.totals.all_16_categories_complete, 1);
  assert.equal(result.matches[0].corners_sum_status, "coerente");
  assert.equal(result.matches[0].bwin_1x2_status, "válidas");
});

test("auditoria distingue categoria em falta de categoria parcial", () => {
  const row = fixture({ xg_home: "", possession_away: "" });
  const result = auditCoverage([row], []);
  assert.deepEqual(result.matches[0].missing_categories, ["xg"]);
  assert.deepEqual(result.matches[0].partial_category_names, ["possession"]);
  assert.equal(result.category_coverage.xg.missing, 1);
  assert.equal(result.category_coverage.possession.partial, 1);
});

test("auditoria assinala divergência entre cantos totais e por partes", () => {
  const result = auditCoverage([fixture({ corners_st_home: "3" })], []);
  assert.equal(result.matches[0].corners_sum_status, "divergência");
  assert.equal(result.totals.corners_mismatch, 1);
});

test("auditoria rejeita IDs duplicados", () => {
  assert.throws(() => auditCoverage([fixture(), fixture()], []), /duplicadas/);
});

test("auditoria rejeita colunas obrigatórias em falta", () => {
  assert.throws(() => auditCoverage([{ match_id: "ABC12345" }], []), /Coluna obrigatória ausente/);
});
