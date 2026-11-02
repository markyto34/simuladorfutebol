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


test("identifies country and competition only from the explicit score-data group containing the match", async () => {
  const { inspectMatchDiscovery } = await import("../flashscore-proxy/src/discover-matches.mjs");
  const html = `<div id="score-data">
    <h4>ALEMANHA: Bundesliga <a href="/classificacoes/KY7LrA6d/jg0MwVuC/">Classificações</a></h4>
    <span>14:30</span>Union Berlin - FC Koln <a href="/jogo/hW5lOaOP/?d=-1" class="fin">1-1</a><br />
    <span>16:30</span>Frankfurt - Hamburger SV <a href="/jogo/fuGf2I16/?d=-1" class="fin">3-1</a><br />
    <h4>ESPANHA: LaLiga <a href="/classificacoes/QeI1Oeyi/dWdJXP6U/">Classificações</a></h4>
    <span>13:00</span>Getafe - Sevilla <a href="/jogo/EoME4ck5/?d=-1">3-1</a>
  </div>`;
  const result = inspectMatchDiscovery(html, "2026-11-01", { matchId: "hW5lOaOP" });
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0].competition_identity, {
    status: "identified", heading: "ALEMANHA: Bundesliga",
    country: "ALEMANHA", competition: "Bundesliga"
  });
});

test("does not assign a competition if the target match has no explicit group heading", async () => {
  const { inspectMatchDiscovery } = await import("../flashscore-proxy/src/discover-matches.mjs");
  const html = `<div id="score-data"><span>14:30</span>Union Berlin - FC Koln
    <a href="/jogo/hW5lOaOP/">1-1</a></div>`;
  const result = inspectMatchDiscovery(html, "2026-11-01", { matchId: "hW5lOaOP" });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].competition_identity, undefined);
});
