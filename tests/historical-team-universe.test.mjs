import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoricalTeamUniverse } from "../scripts/build-historical-team-universe.mjs";

test("builds unique team universe from unique fixtures, ignoring repeated odds observations", () => {
  const records = [
    { date_time: "2026-10-30 20:00", COUNTRY: "Portugal", LEAGUE: "Liga", TEAM_HOME: "Sporting CP", TEAM_AWAY: "Casa Pia" },
    { date_time: "2026-10-30 20:00", COUNTRY: "Portugal", LEAGUE: "Liga", TEAM_HOME: "Sporting CP", TEAM_AWAY: "Casa Pia" },
    { date_time: "2026-10-25 20:00", COUNTRY: "Portugal", LEAGUE: "Liga", TEAM_HOME: "Casa Pia", TEAM_AWAY: "Sporting CP" },
    { date_time: "2026-10-20 20:00", COUNTRY: "England", LEAGUE: "Premier League", TEAM_HOME: "Liverpool", TEAM_AWAY: "Sporting CP" }
  ];
  const result = buildHistoricalTeamUniverse(records);
  assert.equal(result.unique_fixtures, 3);
  assert.equal(result.unique_teams, 3);
  const sporting = result.teams.find(team => team.normalized_name === "sporting cp");
  assert.equal(sporting.unique_matches, 3);
  assert.equal(sporting.home_matches, 1);
  assert.equal(sporting.away_matches, 2);
  assert.equal(sporting.flashscore_team_id, null);
});
