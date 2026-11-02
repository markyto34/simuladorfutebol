"use strict";
const assert = require("node:assert/strict");
const { inspectHtml } = require("../scripts/inspect-flashscore-html.cjs");

const html = `<html><script type="application/json">{"bookmaker":{"name":"Bwin"},"odds":{"home":1.8,"draw":3.4,"away":4.2},"score":{"home":1,"away":0}}</script></html>`;
const report = inspectHtml(html);
assert.equal(report.parsedJsonScripts, 1);
assert.equal(report.bwinStructuredCandidates.length, 1);
assert.equal(report.bwinMentionCount, 1);
assert.ok(report.scoreRelatedKeys.includes("score"));
assert.match(report.conclusion, /objetos JSON/);

const absent = inspectHtml("<html><body>sem operador</body></html>");
assert.equal(absent.bwinMentionCount, 0);
assert.equal(absent.bwinStructuredCandidates.length, 0);
console.log("Flashscore HTML inspector: OK");
