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

  // O Flashscore pode trocar <b> por span/strong/em sem alterar os rótulos visíveis.
  const alternateMarkup = html
    .replace('<b>1-1</b>', '<span>1-1</span>')
    .replace('(1-0,0-1)', '(<i>1-0</i>,<em>0-1</em>)')
    .replace('<b>1-0</b>', '<strong>1-0</strong>')
    .replace('<b>0-1</b>', '<span>0-1</span>');
  assert.deepEqual(extractPeriodScores(alternateMarkup).ht, "1-0");
  assert.equal(extractPeriodScores(alternateMarkup).second_half, "0-1");

  const inconsistent = html.replace("2ª Parte: <b>0-1</b>", "2ª Parte: <b>0-0</b>");
  assert.equal(extractPeriodScores(inconsistent), null);

  const missingPeriod = html.replace('<h4>2ª Parte: <b>0-1</b></h4>', "");
  assert.equal(extractPeriodScores(missingPeriod), null);

  const ambiguousFinal = html.replace(
    '<div class="detail"><b>1-1</b> (1-0,0-1)</div>',
    '<div class="detail"><b>1-1</b> (1-0,0-1)</div><div><b>1-1</b> (1-0,0-1)</div>'
  );
  assert.equal(extractPeriodScores(ambiguousFinal), null);

  const extraTime = [
    '<h3>1.FC Nurnberg F</h3><h3>Eintracht Frankfurt F</h3>',
    '<div class="detail"><b>0-0</b> (0-0,0-0,0-0)</div>',
    '<div class="detail">Depois de Prolongamento</div>',
    '<div id="detail-tab-content">',
    '<h4>1ª Parte: <b>0-0</b></h4>',
    '<h4>2ª Parte: <b>0-0</b></h4>',
    '<h4>Prolong.: <b>0-0</b></h4>',
    '<h4>Penáltis: <b>2-4</b></h4>',
    '</div>'
  ].join("");
  assert.deepEqual(extractPeriodScores(extraTime), {
    status: "validated",
    ht: "0-0",
    second_half: "0-0",
    extra_time: "0-0",
    ft: "0-0",
    evidence: "Explicit first half, second half and extra-time scores cross-checked against the FT breakdown and score arithmetic; penalties excluded."
  });

  const regulation = [
    '<div class="detail"><b>4-4</b> (2-0,2-4)</div>',
    '<div class="detail">Tempo Final</div>',
    '<h4>1ª Parte: <b>2-0</b></h4>',
    '<h4>2ª Parte: <b>2-4</b></h4>',
    '<h4>Penáltis: <b>4-5</b></h4>'
  ].join("");
  assert.equal(extractPeriodScores(regulation).ft, "4-4");

  console.log("Flashscore period score extraction: OK");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
