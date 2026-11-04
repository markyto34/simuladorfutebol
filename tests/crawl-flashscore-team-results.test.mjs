import test from "node:test";
import assert from "node:assert/strict";
import { crawlTeamLastFive } from "../scripts/crawl-flashscore-team-results.mjs";

test("crawls seeded teams, discovers target opponents and deduplicates shared fixtures", async () => {
  const universe = { teams: [
    { team_name: "Sporting CP", normalized_name: "sporting cp", unique_matches: 170, identity_status: "single_country" },
    { team_name: "Porto", normalized_name: "porto", unique_matches: 150, identity_status: "single_country" },
    { team_name: "Benfica", normalized_name: "benfica", unique_matches: 160, identity_status: "single_country" }
  ] };
  const seeds = { teams: [{ team_id: "tljXuHBC", team_name: "Sporting CP", slug: "sporting-cp" }] };
  const calls = [];
  const fixture = (id, homeId, awayId, homeName, awayName) => ({
    match_id: id, start_time: 1000, start_time_iso: "2026-10-30T20:00:00.000Z", stage: "finished",
    home: { id: homeId, name: homeName, score: 1 }, away: { id: awayId, name: awayName, score: 0 }, competition: "PORTUGAL: Liga"
  });
  const result = await crawlTeamLastFive({
    universe, seeds, existingStats: [], maxTeams: 2, delayMs: 0, sleepImpl: async () => {},
    fetchImpl: async url => {
      const id = new URL(url).searchParams.get("id");
      calls.push(id);
      const rows = id === "tljXuHBC"
        ? [fixture("AbCd1234", "tljXuHBC", "4ENWX2OA", "Sporting CP", "Porto")]
        : [fixture("AbCd1234", "tljXuHBC", "4ENWX2OA", "Sporting CP", "Porto")];
      const discovered = id === "tljXuHBC"
        ? [{ team_id: "4ENWX2OA", name: "Porto", slug: "porto" }, { team_id: "zBkyuyRI", name: "Benfica", slug: "benfica" }]
        : [];
      return new Response(JSON.stringify({ ok: true, team_id: id, latest_finished_matches: rows, discovered_teams: discovered }), { status: 200 });
    }
  });
  assert.deepEqual(calls, ["tljXuHBC", "4ENWX2OA"]);
  assert.equal(result.queried_teams, 2);
  assert.equal(result.unique_fixtures, 1);
  assert.equal(result.fixtures[0].source_team_ids.length, 2);
  assert.equal(result.known_team_ids, 2);
});
