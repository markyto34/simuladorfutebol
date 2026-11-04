import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv, eligibleRows, applyScoreUpdate } from "../scripts/backfill-flashscore-scores.mjs";

test("CSV parser round-trips quoted team names", () => {
  const parsed = parseCsv('match_id,date_time,home_team,away_team,status,score_home,score_away\nabc123,2026-11-01T12:00,"A, B",C,Terminado,,\n');
  assert.equal(parsed.records[0].home_team, "A, B");
  assert.equal(parseCsv(toCsv(parsed.headers, parsed.records)).records[0].home_team, "A, B");
});

test("excludes postponed and already scored rows", () => {
  const rows = [
    { match_id: "abc123", status: "Terminado", score_home: "", score_away: "" },
    { match_id: "def456", status: "Adiado", score_home: "", score_away: "" },
    { match_id: "ghi789", status: "Terminado", score_home: "1", score_away: "0" }
  ];
  assert.deepEqual(eligibleRows(rows).map(row => row.match_id), ["abc123"]);
});

test("fills only missing score fields after validating ID, teams and date", () => {
  const row = { match_id: "abc123", date_time: "2026-11-01T12:00", home_team: "Corinthians F (Bra)", away_team: "Cruzeiro F (Bra)", score_home: "", score_away: "2", status: "" };
  const record = {
    match_id: "abc123",
    date_time_iso_local: "2026-11-01T12:00",
    teams: { home: { name: "Corinthians F (Bra)" }, away: { name: "Cruzeiro F (Bra)" } },
    status: "Tempo Final",
    score: { full_time: { home: 4, away: 4 } }
  };
  assert.deepEqual(applyScoreUpdate(row, record), { updated: true, reason: "filled" });
  assert.equal(row.score_home, "4");
  assert.equal(row.score_away, "2");
  assert.equal(row.status, "Tempo Final");
});

test("does not apply a score to another team, date or match ID", () => {
  const row = { match_id: "abc123", date_time: "2026-11-01T12:00", home_team: "A", away_team: "B", score_home: "", score_away: "", status: "" };
  const base = { match_id: "abc123", date_time_iso_local: "2026-11-01T12:00", teams: { home: { name: "A" }, away: { name: "B" } }, score: { full_time: { home: 1, away: 0 } } };
  assert.equal(applyScoreUpdate(row, { ...base, match_id: "def456" }).reason, "match_id_mismatch");
  assert.equal(applyScoreUpdate(row, { ...base, teams: { home: { name: "X" }, away: { name: "B" } } }).reason, "team_identity_mismatch");
  assert.equal(applyScoreUpdate(row, { ...base, date_time_iso_local: "2026-11-02T12:00" }).reason, "date_mismatch");
});

test("does not use penalty-only or unvalidated scores", () => {
  const row = { match_id: "abc123", date_time: "2026-11-01T12:00", home_team: "A", away_team: "B", score_home: "", score_away: "", status: "" };
  const record = { match_id: "abc123", date_time_iso_local: "2026-11-01T12:00", teams: { home: { name: "A" }, away: { name: "B" } }, score: null };
  assert.equal(applyScoreUpdate(row, record).reason, "validated_full_time_unavailable");
});
