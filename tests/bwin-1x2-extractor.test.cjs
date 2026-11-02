"use strict";
const assert = require("node:assert/strict");

(async () => {
  const { extractBwin1x2 } = await import("../flashscore-proxy/src/extract-bwin.mjs");
  const html = '<div>Odds 1.43 | 3.80 | 5.50</div>' +
    '<a data-event="odds_1" data-bookmaker-id="459">5.50 Odds fornecidas por bwin.pt</a>';
  const result = extractBwin1x2(html);
  assert.equal(result.length, 1);
  assert.deepEqual(
    { home: result[0].home, draw: result[0].draw, away: result[0].away },
    { home: 1.43, draw: 3.8, away: 5.5 }
  );
  assert.equal(result[0].bookmaker, "Bwin");
  assert.equal(result[0].market, "1X2");
  assert.deepEqual(result[0].selection_order, ["1", "X", "2"]);

  const escaped = "<div>Odds 1.43 | 3.80 | 5.50</div>" +
    "\\u003Ca data-event=\\u0022odds_1\\u0022 data-bookmaker-id=\\u0022459\\u0022\\u003E" +
    "5.50 Odds fornecidas por bwin.pt\\u003C/a\\u003E";
  assert.equal(extractBwin1x2(escaped).length, 1);

  assert.deepEqual(extractBwin1x2("<div>1.43 | 3.80 | 5.50</div>"), []);
  assert.deepEqual(extractBwin1x2('<a data-event="odds_1" data-bookmaker-id="999">1.43 | 3.80 | 5.50 bwin.pt</a>'), []);
  assert.deepEqual(extractBwin1x2('<a data-event="odds_1" data-bookmaker-id="459">1.43 / 3.80 / 5.50 bwin.pt</a>'), []);
  console.log("Bwin 1X2 extractor: OK");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
