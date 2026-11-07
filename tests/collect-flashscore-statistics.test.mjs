import test from "node:test";
import assert from "node:assert/strict";
import { statisticsRow } from "../scripts/collect-flashscore-csv.mjs";

test("CSV preserves confirmed zero and leaves unknown statistics blank", () => {
  const row = statisticsRow({
    match_id: "ABC123",
    teams: { home: { name: "Casa" }, away: { name: "Fora" } },
    statistics: {
      red_cards: { home: 0, away: 0 },
      corners_ht: { home: 0, away: 2 }
    }
  });

  assert.equal(row.red_cards_home, 0);
  assert.equal(row.red_cards_away, 0);
  assert.equal(row.corners_ht_home, 0);
  assert.equal(row.corners_ht_away, 2);
  assert.equal(row.shots_home, "");
  assert.equal(row.shots_away, "");
});
