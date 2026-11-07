import test from "node:test";
import assert from "node:assert/strict";
import { selectTeamLastFiveMatchIds, buildTeamLastFiveCompetitionMap, normalizeCompetitionIdentity, filterMatchIdsToSelectedCompetitions } from "../scripts/collect-flashscore-csv.mjs";

test("selects only unique fixtures without complete core statistics", () => {
  const payload = { fixtures: [
    { match_id: "AbCd1234", stats_status: "already_complete" },
    { match_id: "EfGh5678", stats_status: "not_collected" },
    { match_id: "IjKl9012", stats_status: "partial_or_missing_core" },
    { match_id: "EfGh5678", stats_status: "not_collected" },
    { match_id: "bad id", stats_status: "not_collected" }
  ] };
  assert.deepEqual(selectTeamLastFiveMatchIds(payload), ["EfGh5678", "IjKl9012"]);
  assert.deepEqual(selectTeamLastFiveMatchIds(payload, 1), ["EfGh5678"]);
});


test("recovers country and competition labels from team feed fixture context", () => {
  const result = buildTeamLastFiveCompetitionMap({ fixtures: [
    { match_id: "AbCd1234", competition: "AUSTRALIA: A-League" },
    { match_id: "EfGh5678", competition: "ASIA: AFC Champions League 2" },
    { match_id: "IjKl9012", competition: null }
  ] });
  assert.deepEqual(result.AbCd1234, { status: "identified", country: "AUSTRALIA", competition: "A-League" });
  assert.deepEqual(result.EfGh5678, { status: "identified", country: "ASIA", competition: "AFC Champions League 2" });
  assert.equal(result.IjKl9012, undefined);
});

test("recolhe todos os jogos pendentes da época, sem limite implícito de cinco", () => {
  const fixtures = Array.from({ length: 12 }, (_, index) => ({
    match_id: "Season" + String(index).padStart(3, "0"),
    stats_status: index === 2 || index === 9 ? "already_complete" : "not_collected"
  }));
  const ids = selectTeamLastFiveMatchIds({ fixtures });
  assert.equal(ids.length, 10);
  assert.deepEqual(ids, fixtures.filter(f => f.stats_status !== "already_complete").map(f => f.match_id));
});


test("filters manual and recovery IDs strictly to selected Flashscore competitions", () => {
  const ids = ["Selected1", "Other001", "Unknown01"];
  const identities = {
    Selected1: { status: "identified", country: "Portugal", competition: "Primeira Liga" },
    Other001: { status: "identified", country: "Portugal", competition: "Taça da Liga" }
  };
  const selectedPairs = new Set([
    normalizeCompetitionIdentity("Portugal") + "|" + normalizeCompetitionIdentity("Primeira Liga")
  ]);
  assert.deepEqual(filterMatchIdsToSelectedCompetitions(ids, identities, selectedPairs), ["Selected1"]);
});

test("normalizes accents and whitespace in competition identities", () => {
  assert.equal(normalizeCompetitionIdentity("  ÁUSTRIA  "), "austria");
  assert.equal(normalizeCompetitionIdentity("Primeira   Liga"), "primeira liga");
});
