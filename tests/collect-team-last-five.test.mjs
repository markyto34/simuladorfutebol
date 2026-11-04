import test from "node:test";
import assert from "node:assert/strict";
import { selectTeamLastFiveMatchIds } from "../scripts/collect-flashscore-csv.mjs";

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
