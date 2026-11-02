import test from "node:test";
import assert from "node:assert/strict";
import { validateMatchRecord } from "../flashscore-proxy/src/match-record.mjs";

const validBase = {
  schema_version: "1.0.0",
  match_id: "827gE8Kl",
  source: "Flashscore",
  date_time: "2026-11-01T23:45:00+00:00",
  teams: { home: { name: "Lanús" }, away: { name: "Gimnasia Mendoza" } },
  source_capture: {
    url: "https://m.flashscore.pt/jogo/827gE8Kl/",
    retrieved_at: "2026-11-02T00:10:00Z",
    http_status: 200
  }
};

test("accepts a match with core identity and provenance even when secondary data is absent", () => {
  const result = validateMatchRecord(validBase);
  assert.equal(result.valid, true);
  assert.equal(result.completeness, 0);
  assert.ok(result.missing_fields.includes("country"));
  assert.ok(result.missing_fields.includes("odds.markets.1x2.home"));
});

test("does not treat numeric zero statistics as missing", () => {
  const result = validateMatchRecord({
    ...validBase,
    statistics: { corners: { home: 0, away: 0 } }
  });
  assert.equal(result.valid, true);
});

test("rejects a record without reliable team identity", () => {
  const result = validateMatchRecord({ ...validBase, teams: { home: {}, away: {} } });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("missing_team_identity"));
});

test("rejects an invalid match id or missing source provenance", () => {
  const result = validateMatchRecord({ ...validBase, match_id: "bad id", source_capture: {} });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("invalid_match_id"));
  assert.ok(result.errors.includes("missing_source_provenance"));
});
