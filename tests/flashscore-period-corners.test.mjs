import test from "node:test";
import assert from "node:assert/strict";
import { extractPeriodCornersFromFeed } from "../flashscore-proxy/src/extract-period-corners.mjs";

test("extracts home and away corners from Flashscore first- and second-half feed periods", () => {
  const feed = [
    "SE÷Match", "SF÷Top stats", "SD÷432", "SG÷Corner kicks", "SH÷7", "SI÷5",
    "SE÷1st Half", "SF÷Top stats", "SD÷432", "SG÷Corner kicks", "SH÷3", "SI÷2",
    "SE÷2nd Half", "SF÷Top stats", "SD÷432", "SG÷Corner kicks", "SH÷4", "SI÷3"
  ].join("¬~");
  const result = extractPeriodCornersFromFeed(feed);
  assert.deepEqual(result.corners_ht, { home: 3, away: 2, source_label: "Corner kicks", source_period: "1st Half" });
  assert.deepEqual(result.corners_st, { home: 4, away: 3, source_label: "Corner kicks", source_period: "2nd Half" });
  assert.equal(result.diagnostics.first_half_ambiguous, false);
  assert.equal(result.diagnostics.second_half_ambiguous, false);
});

test("accepts Portuguese labels and repeated identical rows in multiple feed sections", () => {
  const feed = [
    "SE÷1st Half", "SF÷Top stats", "SD÷1", "SG÷Cantos", "SH÷2", "SI÷1",
    "SF÷Attack", "SD÷2", "SG÷Cantos", "SH÷2", "SI÷1",
    "SE÷2nd Half", "SF÷Top stats", "SD÷3", "SG÷Pontapés de canto", "SH÷5", "SI÷4"
  ].join("¬~");
  const result = extractPeriodCornersFromFeed(feed);
  assert.equal(result.corners_ht.home, 2);
  assert.equal(result.corners_ht.away, 1);
  assert.equal(result.corners_st.home, 5);
  assert.equal(result.corners_st.away, 4);
  assert.equal(result.diagnostics.first_half_corner_rows, 2);
});

test("does not infer period corners when a period or a numeric side is missing", () => {
  const feed = [
    "SE÷Match", "SF÷Top stats", "SD÷1", "SG÷Corner kicks", "SH÷8", "SI÷6",
    "SE÷1st Half", "SF÷Top stats", "SD÷2", "SG÷Corner kicks", "SH÷3", "SI÷-"
  ].join("¬~");
  const result = extractPeriodCornersFromFeed(feed);
  assert.equal(result.corners_ht, null);
  assert.equal(result.corners_st, null);
});

test("rejects conflicting duplicate values rather than selecting one arbitrarily", () => {
  const feed = [
    "SE÷1st Half", "SF÷Top stats", "SD÷1", "SG÷Corner kicks", "SH÷2", "SI÷1",
    "SF÷Attack", "SD÷2", "SG÷Corner kicks", "SH÷3", "SI÷1"
  ].join("¬~");
  const result = extractPeriodCornersFromFeed(feed);
  assert.equal(result.corners_ht, null);
  assert.equal(result.diagnostics.first_half_ambiguous, true);
});
