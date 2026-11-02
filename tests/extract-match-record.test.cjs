"use strict";
const assert = require("node:assert/strict");

(async () => {
  const { extractStructuredMatch } = await import("../flashscore-proxy/src/extract-match-record.mjs");

const html = String.raw`
<!doctype html>
<html lang="pt">
<head><title>UNI 1-1 KOL | Union Berlin - FC Koln</title></head>
<body>
<h3>Union Berlin - FC Koln</h3>
<div class="detail"><b>1-1</b> (1-0,0-1)</div>
<div class="detail">Terminado</div>
<div class="detail">01.11.2026 14:30</div>
<div id="detail-tab-content">
<h4>1ª Parte: <b>1-0</b></h4>
<div class="incident soccer"><p class="i-field time">10'</p><p class="i-field icon ball">&nbsp;</p>Haberer J. (Skarke T.) [UNI]</div>
<div class="incident soccer"><p class="i-field time">37'</p><p class="i-field icon y-card">&nbsp;</p>Player A [KOL]</div>
<h4>2ª Parte: <b>0-1</b></h4>
<div class="incident soccer"><p class="i-field time-wide">45+1'</p><p class="i-field icon y-card">&nbsp;</p>Player B [UNI]</div>
</div>
<a data-event="odds_1" data-event-category="external_bookmaker_link" data-bookmaker-id="459">2.55 | 3.40 | 2.50 Odds fornecidas por bwin.pt</a>
</body></html>`;

  {
  const record = extractStructuredMatch(html, "hW5lOaOP", {
    retrievedAt: "2026-11-02T12:00:00.000Z",
    httpStatus: 200
  });
  assert.equal(record.teams.home.name, "Union Berlin");
  assert.equal(record.teams.away.name, "FC Koln");
  assert.equal(record.date_time, "01.11.2026 14:30");
  assert.equal(record.date_time_iso_local, "2026-11-01T14:30");
  assert.equal(record.status, "Terminado");
  assert.deepEqual(record.score.half_time, { home: 1, away: 0 });
  assert.deepEqual(record.score.second_half, { home: 0, away: 1 });
  assert.deepEqual(record.score.full_time, { home: 1, away: 1 });
  assert.equal(record.events.length, 3);
  assert.equal(record.events[0].type, "goal");
  assert.equal(record.events[0].minute, "10");
  assert.equal(record.odds.bookmaker, "Bwin");
  assert.deepEqual(record.odds.markets["1x2"], { home: 2.55, draw: 3.4, away: 2.5 });
  assert.equal(record.odds.odds_timestamp_type, "observed_at_collection");
  assert.equal(record.country, null);
  assert.equal(record.competition, null);
}

  {
  const record = extractStructuredMatch("<title>AAA - BBB</title>", "abcdef12", {
    retrievedAt: "2026-11-02T12:00:00.000Z"
  });
  assert.equal(record.teams.home.name, null);
  assert.equal(record.score, null);
  assert.equal(record.odds, null);
  assert.equal(record.country, null);
  assert.equal(record.competition, null);
  assert.ok(record.missing_fields.includes("country"));
});

  console.log("Flashscore structured match extraction: OK");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
