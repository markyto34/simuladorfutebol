import test from "node:test";
import assert from "node:assert/strict";
import { mergeRows } from "../scripts/csv-merge.mjs";

const byId = row => row.match_id;

test("preserva valores existentes quando a nova recolha traz campos vazios", () => {
  const existing = [{ match_id: "ABC123", corners_home: "7", corners_away: "4", xg_home: "1.25" }];
  const incoming = [{ match_id: "ABC123", corners_home: "", corners_away: "6", xg_home: null }];
  assert.deepEqual(mergeRows(existing, incoming, byId), [
    { match_id: "ABC123", corners_home: "7", corners_away: "6", xg_home: "1.25" }
  ]);
});

test("permite atualizar valores preenchidos e preserva o zero como valor válido", () => {
  const existing = [{ match_id: "ABC123", score_home: "2", red_home: "1" }];
  const incoming = [{ match_id: "ABC123", score_home: "3", red_home: "0" }];
  assert.deepEqual(mergeRows(existing, incoming, byId), [
    { match_id: "ABC123", score_home: "3", red_home: "0" }
  ]);
});

test("acrescenta novos jogos sem alterar os anteriores", () => {
  const existing = [{ match_id: "ABC123", corners_home: "7" }];
  const incoming = [{ match_id: "XYZ789", corners_home: "5" }];
  assert.deepEqual(mergeRows(existing, incoming, byId), [
    { match_id: "ABC123", corners_home: "7" },
    { match_id: "XYZ789", corners_home: "5" }
  ]);
});

test("falha perante duplicados já existentes em vez de os apagar silenciosamente", () => {
  const existing = [{ match_id: "ABC123", value: "1" }, { match_id: "ABC123", value: "2" }];
  assert.throws(() => mergeRows(existing, [], byId), /Duplicado preexistente/);
});


test("mergeLatestRows prefere a observação mais recente e recupera campos vazios da antiga", async () => {
  const { mergeLatestRows } = await import("../scripts/csv-merge.mjs");
  const result = mergeLatestRows(
    [{ match_id:"A", retrieved_at:"2026-11-01T10:00:00Z", odd_1:"2.1", odd_x:"3.2", odd_2:"4.0", country:"Portugal", home_team:"Casa" }],
    [{ match_id:"A", retrieved_at:"2026-11-02T10:00:00Z", odd_1:"2.2", odd_x:"", odd_2:"3.9", country:"", home_team:"" }],
    row => row.match_id
  );
  assert.deepEqual(result, [{
    match_id:"A", retrieved_at:"2026-11-02T10:00:00Z", odd_1:"2.2", odd_x:"3.2", odd_2:"3.9", country:"Portugal", home_team:"Casa"
  }]);
});

test("mergeLatestRows consolida duplicados preexistentes sem perder dados nem zeros", async () => {
  const { mergeLatestRows } = await import("../scripts/csv-merge.mjs");
  const result = mergeLatestRows(
    [
      { match_id:"A", retrieved_at:"2026-11-01T10:00:00Z", odd_1:"2.1", odd_x:"3.2", odd_2:"4.0", corners_home:"0" },
      { match_id:"A", retrieved_at:"2026-11-02T10:00:00Z", odd_1:"2.2", odd_x:"", odd_2:"3.9", corners_home:"" }
    ],
    [],
    row => row.match_id
  );
  assert.equal(result.length,1);
  assert.equal(result[0].odd_1,"2.2");
  assert.equal(result[0].odd_x,"3.2");
  assert.equal(result[0].corners_home,"0");
});
