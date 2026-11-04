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
