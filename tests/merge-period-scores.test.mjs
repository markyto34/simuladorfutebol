import test from "node:test";
import assert from "node:assert/strict";
import { mergeValidatedPeriodScores } from "../flashscore-proxy/src/merge-period-scores.mjs";

test("fills missing HT/ST from validated summary while preserving the statistics FT", () => {
  const record = {
    score: { half_time: null, second_half: null, full_time: { home: 2, away: 1 } },
    missing_fields: ["statistics", "score_periods"]
  };
  const summary = {
    score: {
      half_time: { home: 1, away: 0 },
      second_half: { home: 1, away: 1 },
      full_time: { home: 2, away: 1 }
    }
  };

  assert.equal(mergeValidatedPeriodScores(record, summary), true);
  assert.deepEqual(record.score, {
    half_time: { home: 1, away: 0 },
    second_half: { home: 1, away: 1 },
    full_time: { home: 2, away: 1 }
  });
});

test("does not merge summary periods when the FT conflicts", () => {
  const record = { score: { full_time: { home: 2, away: 1 } } };
  const summary = {
    score: {
      half_time: { home: 1, away: 0 },
      second_half: { home: 0, away: 1 },
      full_time: { home: 1, away: 1 }
    }
  };

  assert.equal(mergeValidatedPeriodScores(record, summary), false);
  assert.deepEqual(record.score, { full_time: { home: 2, away: 1 } });
});

test("does not accept incomplete summary periods", () => {
  const record = { score: { full_time: { home: 0, away: 0 } } };
  const summary = { score: { half_time: { home: 0, away: 0 }, second_half: null, full_time: { home: 0, away: 0 } } };
  assert.equal(mergeValidatedPeriodScores(record, summary), false);
});
