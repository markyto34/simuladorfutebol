import test from "node:test";
import assert from "node:assert/strict";
import { validateSelectedCompetition } from "../scripts/validate-flashscore-selected-competition.mjs";

const row = (match_id, values = {}) => ({
  match_id, source: "Flashscore", score_home: "", score_away: "",
  ht_home: "", ht_away: "", sh_home: "", sh_away: "",
  shots_home: "", shots_away: "", corners_home: "", corners_away: "",
  ...values
});

test("aceita jogo consultado mesmo quando o Flashscore não disponibiliza indicadores", () => {
  const result = validateSelectedCompetition({
    manifest: { fixtures: [{ match_id: "match001" }] },
    rows: [row("match001")]
  });
  assert.equal(result.complete, true);
  assert.equal(result.consulted, 1);
  assert.equal(result.missing.length, 0);
  assert.equal(result.with_any_indicators, 0);
});

test("aceita campos parciais sem os converter em zero nem exigir todos", () => {
  const result = validateSelectedCompetition({
    manifest: { fixtures: [{ match_id: "match001" }] },
    rows: [row("match001", { score_home: "2", score_away: "1", corners_home: "5" })]
  });
  assert.equal(result.complete, true);
  assert.equal(result.with_any_indicators, 1);
});

test("mantém competição pendente quando um jogo não tem registo Flashscore", () => {
  const result = validateSelectedCompetition({
    manifest: { fixtures: [{ match_id: "match001" }, { match_id: "match002" }] },
    rows: [row("match001")]
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, [{ match_id: "match002", reason: "registo Flashscore não encontrado" }]);
});

test("não aceita linha sem origem Flashscore como consulta válida", () => {
  const result = validateSelectedCompetition({
    manifest: { fixtures: [{ match_id: "match001" }] },
    rows: [{ match_id: "match001", source: "Outro" }]
  });
  assert.equal(result.complete, false);
});

test("não conclui manifesto vazio", () => {
  assert.throws(() => validateSelectedCompetition({ manifest: { fixtures: [] }, rows: [] }), /sem jogos/);
});

test("ignora jogos sem resultado FT confirmados ao validar a competição", () => {
  const result = validateSelectedCompetition({
    manifest: { fixtures: [
      { match_id: "match001" },
      { match_id: "match002", stats_status: "no_final_score" }
    ] },
    rows: [{ match_id: "match001", source: "Flashscore", shots_home: "", shots_away: "" }]
  });
  assert.equal(result.complete, true);
  assert.equal(result.consulted, 1);
  assert.equal(result.skipped_no_final_score, 1);
  assert.equal(result.missing.length, 0);
});
