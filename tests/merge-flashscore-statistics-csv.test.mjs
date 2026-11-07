import test from "node:test";
import assert from "node:assert/strict";
import { mergeStatisticsCsv } from "../scripts/merge-flashscore-statistics-csv.mjs";

const headers = "match_id,retrieved_at,corners_home,corners_away,red_cards_home,home_team";
test("combina jogos exclusivos dos dois lados sem perder registos", () => {
  const remote = headers + "\nA,2026-11-07T10:00:00Z,4,3,0,Porto\nB,2026-11-07T11:00:00Z,5,2,0,Braga\n";
  const local = headers + "\nA,2026-11-07T12:00:00Z,6,3,0,Porto\nC,2026-11-07T13:00:00Z,8,1,0,Sporting\n";
  const result = mergeStatisticsCsv(remote, local);
  assert.match(result, /A,2026-11-07T12:00:00Z,6,3,0,Porto/);
  assert.match(result, /B,2026-11-07T11:00:00Z,5,2,0,Braga/);
  assert.match(result, /C,2026-11-07T13:00:00Z,8,1,0,Sporting/);
});

test("a observação mais recente prevalece e os campos vazios recuperam o valor antigo", () => {
  const remote = headers + "\nA,2026-11-07T10:00:00Z,4,3,0,Porto\n";
  const local = headers + "\nA,2026-11-07T12:00:00Z,6,,0,\n";
  const result = mergeStatisticsCsv(remote, local);
  assert.match(result, /A,2026-11-07T12:00:00Z,6,3,0,Porto/);
});

test("preserva zeros confirmados e escapa vírgulas e aspas", () => {
  const remote = headers + '\nA,2026-11-07T10:00:00Z,0,3,0,"Casa, ""A"""\n';
  const local = headers + "\nB,2026-11-07T11:00:00Z,2,1,0,Visitante\n";
  const result = mergeStatisticsCsv(remote, local);
  assert.match(result, /A,2026-11-07T10:00:00Z,0,3,0,"Casa, ""A"""/);
});

test("recusa esquemas diferentes e linhas sem match_id", () => {
  assert.throws(() => mergeStatisticsCsv(headers + "\nA,2026-11-07T10:00:00Z,0,0,0,Home\n", "match_id,other\nA,x\n"), /esquemas diferentes/);
  assert.throws(() => mergeStatisticsCsv(headers + "\n,2026-11-07T10:00:00Z,0,0,0,Home\n", headers + "\nA,2026-11-07T10:00:00Z,0,0,0,Home\n"), /sem match_id/);
});
