import test from "node:test";
import assert from "node:assert/strict";
import { inspectPageStructure } from "../flashscore-proxy/src/inspect-page-structure.mjs";

test("discovers internal tabs, scripts, relevant data attributes and text evidence", () => {
  const html = `<a href="/jogo/abc123/#/estatisticas" class="tab stat-tab" aria-label="Estatísticas">Estatísticas</a>
    <a href="https://www.flashscore.pt/futebol/alemanha/bundesliga/" class="breadcrumb">Bundesliga</a>
    <a href="https://example.com/not-internal">External</a>
    <script id="app-data" type="application/json">{"competition":"Bundesliga"}</script>
    <div class="match__tabs" data-testid="match-statistics" data-tab="statistics" data-match-id="abc123"></div>
    <span>Classificações · Época · Árbitro · Estádio</span>`;
  const result = inspectPageStructure(html);
  assert.equal(result.counts.links, 2);
  assert.ok(result.links.some(link => link.href.includes("#/estatisticas")));
  assert.equal(result.counts.scripts, 1);
  assert.equal(result.scripts[0].type, "application/json");
  assert.ok(result.data_attributes.some(item => item.name === "data-testid"));
  assert.ok(result.class_tokens.includes("stat-tab"));
  assert.ok(result.text_terms.some(item => item.term === "Bundesliga"));
  assert.ok(result.text_terms.some(item => item.term === "Estatísticas"));
});

test("does not expose arbitrary external links or inline script contents", () => {
  const result = inspectPageStructure(`<a href="https://evil.example/path">x</a>
    <script>window.secret = "not returned"</script>`);
  assert.equal(result.links.length, 0);
  assert.equal(result.scripts.length, 1);
  assert.equal(JSON.stringify(result).includes("not returned"), false);
});

test("applies documented limits to collected structure", () => {
  const links = Array.from({ length: 75 }, (_, i) => `<a href="/tab/${i}" class="match-tab">Tab ${i}</a>`).join("");
  const scripts = Array.from({ length: 50 }, (_, i) => `<script id="s${i}">{"x":1}</script>`).join("");
  const attrs = Array.from({ length: 100 }, (_, i) => `<div class="match-statistics" data-stat-${i}="corners"></div>`).join("");
  const result = inspectPageStructure(links + scripts + attrs);
  assert.equal(result.counts.links, 60);
  assert.equal(result.counts.scripts, 40);
  assert.equal(result.counts.data_attributes, 80);
});
