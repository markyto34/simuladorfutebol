import test from "node:test";
import assert from "node:assert/strict";
import { extractBwin1x2 } from "../flashscore-proxy/src/extract-bwin.mjs";

test("extracts only a confirmed Bwin 1X2 triplet from Flashscore HTML", () => {
  const html = `
    <div class="bookmaker">bwin.pt</div>
    <a data-bookmaker-id="459" data-event="odds_1">1.91 | 3.45 | 4.10</a>
    <a data-bookmaker-id="999" data-event="odds_1">2.00 | 3.20 | 3.80</a>
  `;
  const result = extractBwin1x2(html);
  assert.equal(result.length, 1);
  assert.equal(result[0].bookmaker, "Bwin");
  assert.equal(result[0].bookmaker_id, "459");
  assert.deepEqual([result[0].home, result[0].draw, result[0].away], [1.91, 3.45, 4.10]);
});

test("does not treat other bookmakers or unlabelled odds as Bwin", () => {
  const html = `
    <a data-bookmaker-id="999" data-event="odds_1">1.91 | 3.45 | 4.10</a>
    <a data-bookmaker-id="459" data-event="odds_1">1.91 | 3.45 | 4.10</a>
  `;
  assert.deepEqual(extractBwin1x2(html), []);
});

test("does not accept invalid decimal values", () => {
  const html = `
    <div>bwin.pt</div>
    <a data-bookmaker-id="459" data-event="odds_1">1.00 | 3.45 | 4.10</a>
  `;
  assert.deepEqual(extractBwin1x2(html), []);
});
