import test from "node:test";
import assert from "node:assert/strict";
import { filterHistoricalMatchIds, normalizeFixtureTeam } from "../scripts/historical-fixture-matching.mjs";

const game = (overrides = {}) => ({
  date_time: "2025-08-04T14:30", COUNTRY: "INGLATERRA", LEAGUE: "Premier League",
  TEAM_HOME: "Liverpool (Eng)", TEAM_AWAY: "Arsenal (Eng)", ...overrides
});
const stats = (overrides = {}) => ({
  match_id: "existing1", date_time: "2025-08-04T14:30", country: "INGLATERRA",
  competition: "Premier League", home_team: "Liverpool", away_team: "Arsenal",
  possession_home: "55", possession_away: "45", shots_home: "14", shots_away: "8",
  shots_on_target_home: "6", shots_on_target_away: "3", corners_home: "7", corners_away: "2",
  yellow_cards_home: "1", yellow_cards_away: "2", fouls_home: "10", fouls_away: "12",
  ...overrides
});

test("normaliza sufixos de país nas equipas sem alterar nomes-base", () => {
  assert.equal(normalizeFixtureTeam("Liverpool (Eng)"), "liverpool");
  assert.equal(normalizeFixtureTeam("Athletic Bilbao"), "athletic bilbao");
});

test("filtra apenas jogos do CSV histórico e ignora os que já têm estatísticas completas", () => {
  const result = filterHistoricalMatchIds({
    date: "2025-08-04",
    matchIds: ["already", "target", "unrelated", "no-teams"],
    fixturesByMatchId: {
      already: { home: "Liverpool", away: "Arsenal" },
      target: { home: "Manchester City", away: "Chelsea" },
      unrelated: { home: "Everton", away: "Tottenham" }
    },
    competitionByMatchId: {},
    historicalRows: [
      game(),
      game({ TEAM_HOME: "Manchester City", TEAM_AWAY: "Chelsea" })
    ],
    existingStats: [stats()]
  });
  assert.deepEqual(result.matchIds, ["target"]);
  assert.equal(result.skipped_complete_stats, 1);
  assert.equal(result.unmatched_fixtures, 1);
  assert.equal(result.missing_fixture_names, 1);
});

test("não escolhe jogos ambíguos sem identidade de competição", () => {
  const result = filterHistoricalMatchIds({
    date: "2025-08-04",
    matchIds: ["same"],
    fixturesByMatchId: { same: { home: "Liverpool", away: "Arsenal" } },
    historicalRows: [
      game({ LEAGUE: "Premier League" }),
      game({ LEAGUE: "Taça" })
    ],
    existingStats: []
  });
  assert.deepEqual(result.matchIds, []);
  assert.equal(result.ambiguous_fixtures, 1);
});

test("usa a competição explícita para resolver jogos com as mesmas equipas e data", () => {
  const result = filterHistoricalMatchIds({
    date: "2025-08-04",
    matchIds: ["same"],
    fixturesByMatchId: { same: { home: "Liverpool", away: "Arsenal" } },
    competitionByMatchId: { same: { status: "identified", country: "INGLATERRA", competition: "Taça" } },
    historicalRows: [
      game({ LEAGUE: "Premier League" }),
      game({ LEAGUE: "Taça" })
    ],
    existingStats: []
  });
  assert.deepEqual(result.matchIds, ["same"]);
  assert.equal(result.matched_targets, 1);
});
