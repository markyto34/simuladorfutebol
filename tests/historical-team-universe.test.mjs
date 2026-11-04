import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoricalTeamUniverse } from "../scripts/build-historical-team-universe.mjs";

test("builds unique team universe, ignores repeated odds observations and flags duplicate names", () => {
  const records = [
    { date_time: "2026-10-30 20:00", COUNTRY: "Portugal", LEAGUE: "Liga", TEAM_HOME: "Sporting CP", TEAM_AWAY: "Casa Pia" },
    { date_time: "2026-10-30 20:00", COUNTRY: "Portugal", LEAGUE: "Liga", TEAM_HOME: "Sporting CP", TEAM_AWAY: "Casa Pia" },
    { date_time: "2026-10-25 20:00", COUNTRY: "Portugal", LEAGUE: "Liga", TEAM_HOME: "Casa Pia", TEAM_AWAY: "Sporting CP" },
    { date_time: "2026-10-20 20:00", COUNTRY: "Europa", LEAGUE: "Champions League", TEAM_HOME: "Liverpool", TEAM_AWAY: "Sporting CP" },
    { date_time: "2026-10-22 20:00", COUNTRY: "Uruguai", LEAGUE: "Liga AUF", TEAM_HOME: "Nacional", TEAM_AWAY: "Penarol" },
    { date_time: "2026-10-21 20:00", COUNTRY: "Portugal", LEAGUE: "Liga", TEAM_HOME: "Nacional", TEAM_AWAY: "Braga" }
  ];
  const result = buildHistoricalTeamUniverse(records);
  assert.equal(result.unique_fixtures, 5);
  assert.equal(result.unique_teams, 6);
  const sporting = result.teams.find(team => team.normalized_name === "sporting cp");
  assert.equal(sporting.unique_matches, 3);
  assert.equal(sporting.home_matches, 1);
  assert.equal(sporting.away_matches, 2);
  assert.equal(sporting.primary_country, "Portugal");
  assert.equal(sporting.identity_status, "single_country");
  assert.equal(sporting.flashscore_team_id, null);
  const nacional = result.teams.find(team => team.normalized_name === "nacional");
  assert.equal(nacional.identity_status, "ambiguous_country_collision");
  assert.equal(nacional.primary_country, null);
});
