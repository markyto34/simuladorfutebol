import test from "node:test";
import assert from "node:assert/strict";
import { hasConfirmedFinalScore } from "../scripts/collect-flashscore-csv.mjs";

test("aceita resultado FT confirmado incluindo 0-0", () => {
  assert.equal(hasConfirmedFinalScore({
    status: "Terminado",
    score: { full_time: { home: 0, away: 0 } }
  }), true);
});

test("rejeita jogo terminado sem resultado FT", () => {
  assert.equal(hasConfirmedFinalScore({
    status: "Terminado",
    score: { full_time: { home: null, away: null } }
  }), false);
});

test("rejeita resultado FT parcial", () => {
  assert.equal(hasConfirmedFinalScore({
    status: "Terminado",
    score: { full_time: { home: 2, away: null } }
  }), false);
});

test("rejeita placar sem estado final confirmado", () => {
  assert.equal(hasConfirmedFinalScore({
    status: "Em jogo",
    score: { full_time: { home: 1, away: 0 } }
  }), false);
});

test("aceita a linha CSV equivalente com resultado FT válido", () => {
  assert.equal(hasConfirmedFinalScore({
    status: "Finished", score_home: "1", score_away: "0"
  }), true);
});
