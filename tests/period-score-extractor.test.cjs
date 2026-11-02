"use strict";
const assert = require("node:assert/strict");

(async () => {
  const { extractPeriodScores } = await import("../flashscore-proxy/src/extract-period-scores.mjs");

  const html = [
    '<h3>Lanus</h3><h3>Gimnasia Mendoza</h3>',
    '<div class="detail"><b>1-1</b> (1-0,0-1)</div>',
    '<div class="detail">Terminado</div>',
    '<div id="detail-tab-content">',
    '<h4>1ª Parte: <b>1-0</b></h4>',
    '<div class="detail">incidents</div>',
    '<h4>2ª Parte: <b>0-1</b></h4>',
    '</div>'
  ].join("");

  assert.deepEqual(extractPeriodScores(html), {
    status: "validated",
    ht: "1-0",
    second_half: "0-1",
    ft: "1-1",
    evidence: "Explicit 1.ª Parte and 2.ª Parte headings cross-checked against the FT breakdown and score arithmetic."
  });

  const escaped = html
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/"/g, "\\u0022");
  assert.equal(extractPeriodScores(escaped).ft, "1-1");

  const inconsistent = html.replace("2ª Parte: <b>0-1</b>", "2ª Parte: <b>0-0</b>");
  assert.equal(extractPeriodScores(inconsistent), null);

  const missingPeriod = html.replace('<h4>2ª Parte: <b>0-1</b></h4>', "");
  assert.equal(extractPeriodScores(missingPeriod), null);

  const ambiguousFinal = html.replace(
    '<div class="detail"><b>1-1</b> (1-0,0-1)</div>',
    '<div class="detail"><b>1-1</b> (1-0,0-1)</div><div><b>1-1</b> (1-0,0-1)</div>'
  );
  assert.equal(extractPeriodScores(ambiguousFinal), null);

  console.log("Flashscore period score extraction: OK");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
