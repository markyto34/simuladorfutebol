const test = require("node:test");
const assert = require("node:assert/strict");

test("deduplicates by match, bookmaker and market, keeping the newest observation", async () => {
  const { keepLatestOddsRows } = await import("../scripts/odds-deduplication.mjs");
  const older = { match_id: "abc123", bookmaker: "Bwin", market: "1X2", odd_1: "2.5", retrieved_at: "2026-11-02T18:00:00Z" };
  const newer = { ...older, odd_1: "2.4", retrieved_at: "2026-11-02T22:00:00Z" };
  const otherMatch = { ...newer, match_id: "def456" };
  const result = keepLatestOddsRows([older, otherMatch, newer]);
  assert.equal(result.length, 2);
  assert.equal(result.find(row => row.match_id === "abc123").odd_1, "2.4");
});

test("prefers a valid retrieval timestamp over a missing or invalid timestamp", async () => {
  const { keepLatestOddsRows } = await import("../scripts/odds-deduplication.mjs");
  const invalid = { match_id: "abc123", bookmaker: "Bwin", market: "1X2", retrieved_at: "", odd_1: "2.5" };
  const valid = { ...invalid, retrieved_at: "2026-11-02T22:00:00Z", odd_1: "2.4" };
  assert.equal(keepLatestOddsRows([valid, invalid])[0].odd_1, "2.4");
});
