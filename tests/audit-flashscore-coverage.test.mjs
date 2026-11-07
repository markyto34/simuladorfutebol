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

test("agrupa Liga Portugal e Liga Portugal Betclic sem perder os nomes de origem", () => {
  const report = buildFlashscoreCoverage([
    row({ match_id: "pt1", country: "PORTUGAL", competition: "Liga Portugal" }),
    row({ match_id: "pt2", country: "PORTUGAL", competition: "Liga Portugal Betclic" })
  ]);
  assert.equal(report.competition_count, 1);
  assert.equal(report.merged_alias_label_count, 1);
  assert.equal(report.competitions[0].competition, "Liga Portugal");
  assert.deepEqual(report.competitions[0].source_labels, ["Liga Portugal", "Liga Portugal Betclic"]);
  assert.equal(report.competitions[0].unique_matches, 2);
});

test("agrupa League Cup e Taça da Liga como a mesma competição", () => {
  const report = buildFlashscoreCoverage([
    row({ match_id: "cup1", country: "PORTUGAL", competition: "League Cup" }),
    row({ match_id: "cup2", country: "PORTUGAL", competition: "Taça da Liga" })
  ]);
  assert.equal(report.competition_count, 1);
  assert.equal(report.competitions[0].competition, "Taça da Liga");
  assert.deepEqual(report.competitions[0].source_labels, ["League Cup", "Taça da Liga"]);
});

test("mantém distintas Liga Portugal 2, Liga 3, feminino e séries do Campeonato de Portugal", () => {
  const labels = [
    "Liga Portugal", "Liga Portugal 2", "Liga 3",
    "Liga de Futebol Feminino",
    "Campeonato de Portugal - Série A",
    "Campeonato de Portugal - Série B"
  ];
  const report = buildFlashscoreCoverage(labels.map((competition, index) =>
    row({ match_id: "pt-distinct-" + index, country: "PORTUGAL", competition })
  ));
  assert.equal(report.competition_count, labels.length);
  assert.equal(report.merged_alias_label_count, 0);
});

test("identifica séries sem as fundir", () => {
 const report = buildFlashscoreCoverage([
  row({match_id:"a",country:"PORTUGAL",competition:"Campeonato de Portugal - Série A"}),
  row({match_id:"b",country:"PORTUGAL",competition:"Campeonato de Portugal - Série B"})
 ]);
 const a=report.competitions.find(x=>x.competition.endsWith("Série A"));
 const b=report.competitions.find(x=>x.competition.endsWith("Série B"));
 assert.equal(a.competition_family,"Campeonato de Portugal");
 assert.equal(a.division_or_group,"Série A");
 assert.equal(b.division_or_group,"Série B");
 assert.equal(report.competition_count,2);
});

test("aceita CSV vazio durante o reset e gera cobertura vazia", () => {
  const report = buildFlashscoreCoverage([]);
  assert.equal(report.source_rows, 0);
  assert.equal(report.unique_match_ids, 0);
  assert.equal(report.competition_count, 0);
  assert.deepEqual(report.competitions, []);
});
