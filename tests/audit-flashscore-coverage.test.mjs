import test from "node:test";
import assert from "node:assert/strict";
import { buildFlashscoreCoverage } from "../scripts/audit-flashscore-coverage.mjs";

const row = (overrides = {}) => ({
  match_id: "m1", date_time: "2026-11-01T18:00",
  country: "EUROPA", competition: "Liga dos Campeões - Fase de Liga",
  corners_home: "5", corners_away: "4",
  shots_home: "12", shots_away: "8",
  ...overrides
});

test("junta apenas aliases confirmados de país e tradução da competição", () => {
  const report = buildFlashscoreCoverage([
    row(),
    row({ match_id: "m2", country: "EUROPE", competition: "Champions League - League phase" })
  ]);
  assert.equal(report.raw_competition_label_count, 2);
  assert.equal(report.competition_count, 1);
  assert.equal(report.merged_alias_label_count, 1);
  assert.equal(report.competitions[0].unique_matches, 2);
  assert.deepEqual(report.competitions[0].countries_seen, ["EUROPA", "EUROPE"]);
  assert.equal(report.competitions[0].source_labels.length, 2);
});

test("não mistura fases ou competições distintas", () => {
  const report = buildFlashscoreCoverage([
    row(),
    row({ match_id: "m2", competition: "Liga dos Campeões Feminina - Fase de Liga" }),
    row({ match_id: "m3", competition: "Liga Europa - Fase de Liga" })
  ]);
  assert.equal(report.competition_count, 3);
  assert.equal(report.merged_alias_label_count, 0);
});

test("não elimina jogos repetidos com IDs diferentes", () => {
  const report = buildFlashscoreCoverage([
    row(),
    row({ match_id: "m2", corners_home: "", corners_away: "" })
  ]);
  assert.equal(report.unique_match_ids, 2);
  assert.equal(report.competitions[0].unique_matches, 2);
  assert.equal(report.competitions[0].metrics.corners.complete_matches, 1);
});
