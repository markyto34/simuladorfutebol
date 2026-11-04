import test from "node:test";
import assert from "node:assert/strict";
import { collectTeamIdSeeds } from "../scripts/seed-flashscore-team-ids.mjs";

test("seeds unique team IDs from a greedy set of distinct historical matches", async () => {
  const targetRows = [
    { stats_status: "matched_exact", flashscore_match_id: "AbCd1234", date: "2025-01-01", country: "Portugal", competition: "Liga", home_team: "Sporting", away_team: "Porto" },
    { stats_status: "matched_exact", flashscore_match_id: "EfGh5678", date: "2025-01-02", country: "Portugal", competition: "Liga", home_team: "Benfica", away_team: "Braga" },
    { stats_status: "matched_exact", flashscore_match_id: "IjKl9012", date: "2025-01-03", country: "Portugal", competition: "Liga", home_team: "Sporting", away_team: "Benfica" },
    { stats_status: "missing", flashscore_match_id: "MnOp3456", date: "2025-01-04", country: "Portugal", competition: "Liga", home_team: "Arouca", away_team: "Casa Pia" }
  ];
  const calls = [];
  const result = await collectTeamIdSeeds({
    targetRows, limit: 2, delayMs: 0, sleep: async () => {},
    fetchImpl: async url => {
      calls.push(url);
      const id = new URL(url).searchParams.get("id");
      const links = id === "AbCd1234"
        ? [{ team_id: "tljXuHBC", name: "Sporting CP", slug: "sporting-cp" }, { team_id: "4ENWX2OA", name: "Porto", slug: "porto" }]
        : [{ team_id: "zBkyuyRI", name: "Benfica", slug: "benfica" }, { team_id: "u8XQp2Lm", name: "Braga", slug: "braga" }];
      return new Response(JSON.stringify({ ok: true, inspection: { team_links: links } }), { status: 200 });
    }
  });
  assert.equal(calls.length, 2);
  assert.equal(result.requests, 2);
  assert.equal(result.unique_team_ids, 4);
  assert.equal(result.successful_matches, 2);
});
