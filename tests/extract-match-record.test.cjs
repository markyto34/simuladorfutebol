"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

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
<div class="incident soccer"><p class="i-field time">61'</p><p class="i-field icon substitution">&nbsp;</p>Player In (Player Out) [KOL]</div>
</div>
<a data-event="odds_1" data-event-category="external_bookmaker_link" data-bookmaker-id="459">2.55 | 3.40 | 2.50 Odds fornecidas por bwin.pt</a>
</body></html>`;

test("extracts match identity, date, period scores, events and Bwin 1X2", async () => {
  const { extractStructuredMatch } = await import("../flashscore-proxy/src/extract-match-record.mjs");
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
  assert.equal(record.events.length, 4);
  assert.equal(record.events[0].type, "goal");
  assert.equal(record.events[0].minute, "10");
  assert.deepEqual(record.substitutions, [{
    minute: "61",
    player_in: "Player In",
    player_out: "Player Out",
    team_abbreviation: "KOL"
  }]);
  assert.ok(record.missing_fields.includes("statistics"));
  assert.ok(record.missing_fields.includes("lineups"));
  assert.ok(record.missing_fields.includes("formations"));
  assert.equal(record.odds.bookmaker, "Bwin");
  assert.deepEqual(record.odds.markets["1x2"], { home: 2.55, draw: 3.4, away: 2.5 });
  assert.equal(record.odds.odds_timestamp_type, "observed_at_collection");
  assert.equal(record.country, null);
  assert.equal(record.competition, null);
});

test("does not invent unavailable fields or attach ambiguous Bwin odds", async () => {
  const { extractStructuredMatch } = await import("../flashscore-proxy/src/extract-match-record.mjs");
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

test("recognizes Tempo Final and preserves the regulation score before penalties", async () => {
  const { extractStructuredMatch } = await import("../flashscore-proxy/src/extract-match-record.mjs");
  const html = `<title>COR 4-4 CRU | Corinthians F (Bra) - Cruzeiro F (Bra)</title>
    <h3>Corinthians F (Bra) - Cruzeiro F (Bra)</h3>
    <div class="detail"><b>4-4</b> (2-0,2-4)</div><div class="detail">Tempo Final</div>
    <div class="detail">Penáltis: <b>4-5</b></div><div class="detail">01.11.2026 00:00</div>
    <div id="detail-tab-content"><h4>1ª Parte: <b>2-0</b></h4><h4>2ª Parte: <b>2-4</b></h4><h4>Penáltis: <b>4-5</b></h4></div>`;
  const record = extractStructuredMatch(html, "IPPZATYR");
  assert.equal(record.status, "Tempo Final");
  assert.deepEqual(record.score.full_time, { home: 4, away: 4 });
});

test("recognizes extra time and excludes the penalty shootout from full time", async () => {
  const { extractStructuredMatch } = await import("../flashscore-proxy/src/extract-match-record.mjs");
  const html = `<title>FCN 0-0 EIF | 1.FC Nurnberg F - Eintracht Frankfurt F</title>
    <h3>1.FC Nurnberg F - Eintracht Frankfurt F</h3>
    <div class="detail"><b>0-0</b> (0-0,0-0,0-0)</div><div class="detail">Depois de Prolongamento</div>
    <div class="detail">Penáltis: <b>2-4</b></div><div class="detail">01.11.2026 13:00</div>
    <div id="detail-tab-content"><h4>1ª Parte: <b>0-0</b></h4><h4>2ª Parte: <b>0-0</b></h4><h4>Prolong.: <b>0-0</b></h4><h4>Penáltis: <b>2-4</b></h4></div>`;
  const record = extractStructuredMatch(html, "C0jJWeam");
  assert.equal(record.status, "Depois de Prolongamento");
  assert.deepEqual(record.score.full_time, { home: 0, away: 0 });
  assert.deepEqual(record.score.extra_time, { home: 0, away: 0 });
});


test("Flashscore match record carries red-card statistics and validated period scores", async () => {
  const { extractStructuredMatch } = await import("../flashscore-proxy/src/extract-match-record.mjs");
  const html = `
    <title>UNI 1-1 KOL | Union Berlin - FC Koln</title>
    <h3>Union Berlin - FC Koln</h3>
    <div class="detail"><b>1-1</b> (1-0,0-1)</div>
    <div class="detail">Terminado</div>
    <div class="detail">01.11.2026 14:30</div>
    <div id="detail-tab-content">
      <h4>1ª Parte: <b>1-0</b></h4>
      <h4>2ª Parte: <b>0-1</b></h4>
    </div>
    <div data-testid="wcl-statistics">
      <div class="stat-row"><span>Cartões vermelhos</span><span>1</span><span>0</span></div>
      <div class="stat-row"><span>Cantos</span><span>2</span><span>6</span></div>
      <div class="stat-row"><span>Faltas</span><span>11</span><span>10</span></div>
    </div>`;
  const record = extractStructuredMatch(html, "hW5lOaOP", { retrievedAt: "2026-11-04T10:00:00.000Z" });
  assert.deepEqual(record.score.half_time, { home: 1, away: 0 });
  assert.deepEqual(record.score.second_half, { home: 0, away: 1 });
  assert.deepEqual(record.statistics.red_cards, {
    home: 1, away: 0, unit: null, source_label: "Cartões vermelhos"
  });
  assert.deepEqual(record.statistics.corners, {
    home: 2, away: 6, unit: null, source_label: "Cantos"
  });
  assert.deepEqual(record.statistics.fouls, {
    home: 11, away: 10, unit: null, source_label: "Faltas"
  });
});
