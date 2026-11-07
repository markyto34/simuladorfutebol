import test from "node:test";
import assert from "node:assert/strict";
import { shouldStoreStatisticsRecord } from "../scripts/collect-flashscore-csv.mjs";

test("ignora jogo finalizado sem resultado FT", () => {
  assert.equal(shouldStoreStatisticsRecord({ status: "Terminado", score: null }), false);
  assert.equal(shouldStoreStatisticsRecord({ status: "Tempo Final", score: { full_time: { home: 1, away: null } } }), false);
});

test("mantém jogo finalizado com resultado FT, incluindo 0-0", () => {
  assert.equal(shouldStoreStatisticsRecord({ status: "Terminado", score: { full_time: { home: 0, away: 0 } } }), true);
});

test("não elimina jogos sem resultado que ainda não estão finalizados", () => {
  assert.equal(shouldStoreStatisticsRecord({ status: "Não iniciado", score: null }), true);
});
