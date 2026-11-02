const test = require("node:test");
const assert = require("node:assert/strict");

test("extracts unique Flashscore match ids and visible anchor text", async () => {
  const { inspectMatchDiscovery } = await import("../flashscore-proxy/src/discover-matches.mjs");
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

test("ignores invalid links and reports empty results honestly", async () => {
  const { inspectMatchDiscovery } = await import("../flashscore-proxy/src/discover-matches.mjs");
  const result = inspectMatchDiscovery('<a href="/jogo/short/">x</a>', "2026-11-01");
  assert.equal(result.match_count, 0);
  assert.equal(result.truncated, false);
});


test("returns a compact summary with unique IDs and duplicate counts", async () => {
  const { inspectMatchDiscovery } = await import("../flashscore-proxy/src/discover-matches.mjs");
  const html = `<title>Futebol Ontem</title>
    <a href="/jogo/827gE8Kl/"><span>Lanus - Gimnasia Mendoza</span></a>
    <a href="/jogo/827gE8Kl/?s=3">duplicate</a>
    <a href="/jogo/AB12cd34/">Home - Away</a>`;
  const result = inspectMatchDiscovery(html, "2026-11-01", { summary: true });
  assert.equal(result.match_count, 2);
  assert.equal(result.duplicate_link_count, 1);
  assert.equal(result.sample_matches.length, 2);
  assert.equal(result.sample_matches[0].match_id, "827gE8Kl");
  assert.equal(Object.hasOwn(result, "matches"), false);
});


test("isolates one requested match and preserves surrounding HTML evidence", async () => {
  const { inspectMatchDiscovery } = await import("../flashscore-proxy/src/discover-matches.mjs");
  const html = `<h2>GERMANY: Bundesliga</h2>
    <div class="event"><a href="/jogo/hW5lOaOP/"><span>Union Berlin - FC Koln</span></a></div>
    <h2>PORTUGAL: Liga</h2>
    <div class="event"><a href="/jogo/AB12cd34/"><span>Home - Away</span></a></div>`;
  const result = inspectMatchDiscovery(html, "2026-11-01", { matchId: "hW5lOaOP" });
  assert.equal(result.target_match_id, "hW5lOaOP");
  assert.equal(result.match_count, 1);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].match_id, "hW5lOaOP");
  assert.match(result.matches[0].context, /GERMANY: Bundesliga/);
  assert.match(result.matches[0].context_html, /GERMANY: Bundesliga/);
});
