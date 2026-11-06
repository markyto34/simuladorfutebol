import test from "node:test";
import assert from "node:assert/strict";
import { buildCompleteCompetitions, CORE_METRICS } from "../scripts/update-simulator-complete-competitions.mjs";

const makeRow = (id, overrides = {}) => {
  const row = { match_id: id, country: "PORTUGAL", competition: "Liga Portugal" };
  for (const metric of CORE_METRICS) {
    row[metric + "_home"] = "5";
    row[metric + "_away"] = "3";
  }
  return { ...row, ...overrides };
};

test("só publica competições com pelo menos cinco jogos e nove indicadores completos", () => {
  const records = Array.from({ length: 5 }, (_, i) => makeRow("m" + i));
  const result = buildCompleteCompetitions(records);
  assert.equal(result.index.complete_competitions.length, 1);
  assert.equal(result.index.complete_competitions[0].unique_stats_matches, 5);
  assert.equal(result.newly_eligible.length, 1);
});

test("não considera completo quando falta um dos nove indicadores em qualquer jogo", () => {
  const records = Array.from({ length: 5 }, (_, i) => makeRow("m" + i));
  records[4].corners_st_away = "";
  const result = buildCompleteCompetitions(records);
  assert.equal(result.index.complete_competitions.length, 0);
});

test("IDs repetidos não aumentam artificialmente a amostra", () => {
  const records = Array.from({ length: 5 }, () => makeRow("same"));
  const result = buildCompleteCompetitions(records);
  assert.equal(result.index.complete_competitions.length, 0);
});

test("preserva uma competição já publicada durante uma atualização parcial do CSV", () => {
  const old = {
    country_name: "Portugal", competition_name: "Liga Portugal",
    stats_source_labels: ["PORTUGAL / Liga Portugal"], unique_stats_matches: 8,
    complete_core: true, core_metrics: [...CORE_METRICS], metric_coverage: {}
  };
  const result = buildCompleteCompetitions([makeRow("m1")], { complete_competitions: [old] });
  assert.equal(result.index.complete_competitions.length, 1);
  assert.equal(result.index.complete_competitions[0].unique_stats_matches, 8);
});

test("não publica países desconhecidos sem identificação", () => {
  const records = Array.from({ length: 5 }, (_, i) => makeRow("m" + i, { country: "PLANETA X" }));
  const result = buildCompleteCompetitions(records);
  assert.equal(result.index.complete_competitions.length, 0);
  assert.equal(result.unidentified.length, 1);
});
