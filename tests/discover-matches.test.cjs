import test from "node:test";
import assert from "node:assert/strict";
import { inspectMatchDiscovery } from "../flashscore-proxy/src/discover-matches.mjs";

test("extracts unique Flashscore match ids and visible anchor text", () => {
  const html = `<title>Futebol Hoje</title><h2>PORTUGAL: Liga</h2>
    <a href="/jogo/827gE8Kl/"><span>Lanus - Gimnasia Mendoza</span></a>
    <a href="/jogo/827gE8Kl/?s=3">duplicate</a>
    <a href="/jogo/AB12cd34/">Home - Away</a>`;
  const result = inspectMatchDiscovery(html, "2026-11-01");
  assert.equal(result.match_count, 2);
  assert.equal(result.matches[0].match_id, "827gE8Kl");
  assert.match(result.matches[0].anchor_text, /Lanus/);
  assert.equal(result.requested_date, "2026-11-01");
});

test("ignores invalid links and reports empty results honestly", () => {
  const result = inspectMatchDiscovery('<a href="/jogo/short/">x</a>', "2026-11-01");
  assert.equal(result.match_count, 0);
  assert.equal(result.truncated, false);
});
