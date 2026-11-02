"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { enrichFlashscoreStats, enrichOddsPeriods } = require("../data-enrichment.js");

test("Flashscore enriches a matching fixture and does not overwrite existing values", () => {
  const matches = [{
    date: "2026-11-01", home: "1. FC Köln", away: "Union Berlin", hg: 1, ag: 1,
    hc: 4, ac: null, homeShots: null, awayShots: null, homeTarget: null, awayTarget: null,
    homeFouls: null, awayFouls: null, homeYellow: null, awayYellow: null
  }];
  const csv = [
    "match_id,date_time,country,competition,home_team,away_team,score_home,score_away,xg_home,xg_away,corners_home,corners_away,shots_home,shots_away,shots_on_target_home,shots_on_target_away,fouls_home,fouls_away,yellow_cards_home,yellow_cards_away,possession_home,possession_away",
    'abc123,2026-11-01T14:30,Germany,"Bundesliga, Germany",FC Koln,Union Berlin,1,1,0.68,1.17,2,6,5,14,2,2,11,10,4,3,37,63'
  ].join("\n");

  const result = enrichFlashscoreStats(matches, csv);
  assert.deepEqual(result, { matched: 1, enriched: 1 });
  assert.equal(matches[0].hc, 4, "existing valid corners must be preserved");
  assert.equal(matches[0].ac, 6);
  assert.equal(matches[0].homeShots, 5);
  assert.equal(matches[0].homeXg, 0.68);
  assert.equal(matches[0].awayPossession, 63);
  assert.equal(matches[0].flashscoreMatchId, "abc123");
});

test("Flashscore does not join when the full-time score is missing or different", () => {
  const csv = [
    "match_id,date_time,home_team,away_team,score_home,score_away,corners_home,corners_away",
    "abc123,2026-11-01T14:30,Union Berlin,FC Koln,1,1,2,6"
  ].join("\n");
  const mismatch = [{ date: "2026-11-01", home: "Union Berlin", away: "FC Koln", hg: 2, ag: 1, hc: null, ac: null }];
  const missing = [{ date: "2026-11-01", home: "Union Berlin", away: "FC Koln", hg: 1, ag: 1, hc: null, ac: null }];
  const missingScoreCsv = csv.replace(",1,1,2,6", ",,1,2,6");

  assert.equal(enrichFlashscoreStats(mismatch, csv).matched, 0);
  assert.equal(enrichFlashscoreStats(missing, missingScoreCsv).matched, 0);
  assert.equal(mismatch[0].hc, null);
  assert.equal(missing[0].hc, null);
});

test("CSV Odds adds HT and second-half goals only when FT matches", () => {
  const matches = [{ date: "2026-11-01", home: "Union Berlin", away: "FC Koln", hg: 1, ag: 1, htHome: null, htAway: null }];
  const csv = [
    "date_time,TEAM_HOME,TEAM_AWAY,score_fh_home,score_fh_away,score_sh_home,score_sh_away,score_ft_home,score_ft_away",
    "2026-11-01T14:30,Union Berlin,FC Koln,1,0,0,1,1,1"
  ].join("\n");

  const result = enrichOddsPeriods(matches, csv);
  assert.deepEqual(result, { matched: 1, ht: 1, secondHalf: 1 });
  assert.deepEqual([matches[0].htHome, matches[0].htAway], [1, 0]);
  assert.deepEqual([matches[0].shHome, matches[0].shAway], [0, 1]);
});

test("CSV Odds rejects a fixture whose FT score differs", () => {
  const matches = [{ date: "2026-11-01", home: "Union Berlin", away: "FC Koln", hg: 2, ag: 1, htHome: null, htAway: null }];
  const csv = [
    "date_time,TEAM_HOME,TEAM_AWAY,score_fh_home,score_fh_away,score_sh_home,score_sh_away,score_ft_home,score_ft_away",
    "2026-11-01T14:30,Union Berlin,FC Koln,1,0,0,1,1,1"
  ].join("\n");

  assert.deepEqual(enrichOddsPeriods(matches, csv), { matched: 0, ht: 0, secondHalf: 0 });
  assert.equal(matches[0].htHome, null);
});
