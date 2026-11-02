"use strict";
const assert = require("node:assert/strict");

(async () => {
  const { inspectScoreEvidence } = await import("../flashscore-proxy/src/extract-scores.mjs");

  const html = '<meta property="og:title" content="LAN 1-1 GIM">' +
    '<div class="detailScore__wrapper"><span>1</span><span>1</span></div>' +
    '<div class="detailScore__period">1st Half</div>' +
    '<div data-testid="score-period">HT</div>';

  const result = inspectScoreEvidence(html);
  assert.ok(result.scoreEvidence.some(item => item.value === "1-1"));
  assert.ok(result.scoreRelatedAttributes.some(item => /detailScore__wrapper/.test(item)));
  assert.ok(result.scoreRelatedAttributes.some(item => /detailScore__period/.test(item)));
  assert.ok(result.scoreRelatedAttributes.some(item => /score-period/.test(item)));

  const escaped = String.raw\`\\u003Cdiv class="detailScore__wrapper">0-1\\u003C/div>\`;
  const escapedResult = inspectScoreEvidence(escaped);
  assert.ok(escapedResult.scoreEvidence.some(item => item.value === "0-1"));
  assert.ok(escapedResult.scoreRelatedAttributes.some(item => /detailScore__wrapper/.test(item)));

  const empty = inspectScoreEvidence("<html>no scores here</html>");
  assert.deepEqual(empty, { scoreEvidence: [], scoreRelatedAttributes: [] });

  console.log("Flashscore score evidence inspector: OK");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
