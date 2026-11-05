import test from "node:test";
import assert from "node:assert/strict";
import { selectRowsNeedingPeriodCorners, backfillPeriodCorners } from "../scripts/backfill-flashscore-period-corners.mjs";

const row = (match_id, date_time, extra = {}) => ({
  match_id, date_time, corners_home: "7", corners_away: "5",
  corners_ht_home: "", corners_ht_away: "", corners_st_home: "", corners_st_away: "",
  ...extra
});

test("seleciona apenas jogos no intervalo que ainda precisam de HT ou ST", () => {
  const rows = [
    row("match01", "2026-10-31T12:00"),
    row("match02", "2026-11-01T12:00", { corners_ht_home: "2", corners_ht_away: "1", corners_st_home: "3", corners_st_away: "2" }),
    row("match03", "2026-11-02T12:00"),
    row("match04", "2026-10-31T13:00", { corners_ht_home: "2" }),
    row("bad!", "2026-10-31T13:00")
  ];
  assert.deepEqual(selectRowsNeedingPeriodCorners(rows, "2026-10-31", "2026-11-01").map(x => x.match_id), ["match01", "match04"]);
});

test("recolhe pares HT/ST explícitos e preserva os valores que já existiam", async () => {
  const rows = [
    row("match01", "2026-10-31T12:00", { corners_ht_home: "2" }),
    row("match02", "2026-10-31T13:00")
  ];
  const result = await backfillPeriodCorners(rows, {
    startDate: "2026-10-31", endDate: "2026-10-31", concurrency: 1, delayMs: 0,
    fetchRecord: async id => id === "match01"
      ? { statistics: { corners_ht: { home: 3, away: 2 }, corners_st: { home: 4, away: 1 } } }
      : { statistics: { corners_ht: null, corners_st: { home: 2, away: 3 } } }
  });
  assert.equal(result.summary.selected, 2);
  assert.equal(result.summary.ht_available, 1);
  assert.equal(result.summary.st_available, 2);
  assert.deepEqual(
    [result.rows[0].corners_ht_home, result.rows[0].corners_ht_away, result.rows[0].corners_st_home, result.rows[0].corners_st_away],
    ["2", 2, 4, 1]
  );
  assert.deepEqual(
    [result.rows[1].corners_ht_home, result.rows[1].corners_st_home, result.rows[1].corners_st_away],
    ["", 2, 3]
  );
});

test("interrompe novas consultas quando Flashscore responde 403/429", async () => {
  const rows = [row("match01", "2026-10-31T12:00"), row("match02", "2026-10-31T13:00")];
  let calls = 0;
  const result = await backfillPeriodCorners(rows, {
    startDate: "2026-10-31", endDate: "2026-10-31", concurrency: 1, delayMs: 0,
    fetchRecord: async () => { calls++; const error = new Error("HTTP 429"); error.blocked = true; throw error; }
  });
  assert.equal(calls, 1);
  assert.equal(result.summary.blocked, true);
  assert.equal(result.summary.failed, 1);
});
