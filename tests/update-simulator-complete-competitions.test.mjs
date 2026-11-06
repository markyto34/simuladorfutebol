import test from "node:test";
import assert from "node:assert/strict";
import { buildCompleteCompetitions, CORE_METRICS } from "../scripts/update-simulator-complete-competitions.mjs";

const columns = {
  goals: ["score_home", "score_away"],
  goals_conceded: ["score_home", "score_away"],
  goals_ht: ["ht_home", "ht_away"],
  goals_st: ["sh_home", "sh_away"],
  corners: ["corners_home", "corners_away"],
  corners_ht: ["corners_ht_home", "corners_ht_away"],
  corners_st: ["corners_st_home", "corners_st_away"],
  shots: ["shots_home", "shots_away"],
  shots_on_target: ["shots_on_target_home", "shots_on_target_away"],
  shots_off_target: ["shots_off_target_home", "shots_off_target_away"],
  blocked_shots: ["blocked_shots_home", "blocked_shots_away"],
  shots_inside_box: ["shots_inside_box_home", "shots_inside_box_away"],
  shots_outside_box: ["shots_outside_box_home", "shots_outside_box_away"],
  fouls: ["fouls_home", "fouls_away"],
  yellow_cards: ["yellow_cards_home", "yellow_cards_away"],
  red_cards: ["red_cards_home", "red_cards_away"]
};

const makeRow = (id, overrides = {}) => {
  const row = { match_id: id, country: "PORTUGAL", competition: "Liga Portugal" };
  for (const [home, away] of Object.values(columns)) {
    row[home] = "5";
    row[away] = "3";
  }
  return { ...row, ...overrides };
};

test("usa os 16 indicadores definidos para o simulador", () => {
  assert.equal(CORE_METRICS.length, 16);
  assert.deepEqual(new Set(CORE_METRICS), new Set(Object.keys(columns)));
});

test("publica competição com pelo menos cinco jogos únicos e cobertura dos indicadores", () => {
  const records = Array.from({ length: 5 }, (_, i) => makeRow("m" + i));
  const result = buildCompleteCompetitions(records);
  assert.equal(result.index.complete_competitions.length, 1);
  assert.equal(result.index.complete_competitions[0].unique_stats_matches, 5);
  assert.equal(result.index.complete_competitions[0].core_metrics.length, 16);
  assert.equal(result.newly_eligible.length, 1);
});

test("não exclui a competição quando faltam alguns indicadores em jogos individuais", () => {
  const records = Array.from({ length: 5 }, (_, i) => makeRow("m" + i));
  records[4].corners_st_away = "";
  records[2].red_cards_home = "";
  const result = buildCompleteCompetitions(records);
  assert.equal(result.index.complete_competitions.length, 1);
  const coverage = result.index.complete_competitions[0].metric_coverage;
  assert.equal(coverage.corners_st.complete, 4);
  assert.equal(coverage.corners_st.pct, 80);
  assert.equal(coverage.red_cards.complete, 4);
});

test("não publica competição sem qualquer indicador disponível", () => {
  const records = Array.from({ length: 5 }, (_, i) => {
    const row = makeRow("m" + i);
    for (const [home, away] of Object.values(columns)) {
      row[home] = "";
      row[away] = "";
    }
    return row;
  });
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

test("não altera generated_at quando o índice não mudou", () => {
  const records = Array.from({ length: 5 }, (_, i) => makeRow("m" + i));
  const first = buildCompleteCompetitions(records);
  const previous = { ...first.index, generated_at: "2026-11-06T10:00:00.000Z" };
  const next = buildCompleteCompetitions(records, previous);
  assert.equal(next.index.generated_at, previous.generated_at);
  assert.equal(next.newly_eligible.length, 0);
});

test("reutiliza o país já identificado no índice para uma nova competição desse país", () => {
  const previous = {
    complete_competitions: [{
      country_name: "Bósnia e Herzegovina",
      competition_name: "Liga existente",
      stats_source_labels: ["BOSNIA / Liga existente"],
      unique_stats_matches: 5,
      complete_core: true,
      core_metrics: [...CORE_METRICS],
      metric_coverage: {}
    }]
  };
  const records = Array.from({ length: 5 }, (_, i) =>
    makeRow("b" + i, { country: "BOSNIA", competition: "Nova Liga" })
  );
  const result = buildCompleteCompetitions(records, previous);
  assert.equal(result.newly_eligible[0].country_name, "Bósnia e Herzegovina");
});
