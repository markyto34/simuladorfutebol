import test from "node:test";
import assert from "node:assert/strict";
import { extractPageContext } from "../flashscore-proxy/src/extract-page-context.mjs";

test("extracts competition identity from visible breadcrumbs and structured metadata", () => {
  const html = `<html>
    <meta property="og:description" content="Primeira Liga">
    <a href="/futebol/portugal/">Portugal</a>
    <a href="/futebol/portugal/primeira-liga/">Primeira Liga</a>
    <script type="application/ld+json">{"@type":"SportsEvent","competition":"Primeira Liga","country":"Portugal","season":"2026/2027","round":"Jornada 10","referee":"João Silva","venue":"Estádio do Dragão"}</script>
  </html>`;
  const result = extractPageContext(html);
  assert.equal(result.fields.country, "Portugal");
  assert.equal(result.fields.competition, "Primeira Liga");
  assert.equal(result.fields.season, "2026/2027");
  assert.equal(result.fields.round, "Jornada 10");
  assert.equal(result.fields.referee, "João Silva");
  assert.equal(result.fields.venue, "Estádio do Dragão");
  assert.equal(result.diagnostics.ambiguous_fields.length, 0);
});

test("keeps contradictory competition candidates null and reports ambiguity", () => {
  const html = `<meta property="og:competition" content="Primeira Liga">
    <script type="application/json">{"competition":"Taça de Portugal"}</script>`;
  const result = extractPageContext(html);
  assert.equal(result.fields.competition, null);
  assert.ok(result.diagnostics.ambiguous_fields.includes("competition"));
});

test("extracts common statistics only from paired explicit statistic rows", () => {
  const html = `<div class="wcl-row_x"><span>Cantos</span><span>7</span><span>4</span></div>
    <div class="wcl-row_x"><span>Remates à baliza</span><span>5</span><span>2</span></div>
    <div class="wcl-row_x"><span>Posse de bola</span><span>61%</span><span>39%</span></div>`;
  const result = extractPageContext(html);
  assert.deepEqual(result.statistics.corners, { home: 7, away: 4, unit: null, source_label: "Cantos" });
  assert.deepEqual(result.statistics.shots_on_target, { home: 5, away: 2, unit: null, source_label: "Remates à baliza" });
  assert.deepEqual(result.statistics.possession, { home: 61, away: 39, unit: "%", source_label: "Posse de bola" });
});

test("does not invent fields when the page has no evidence", () => {
  const result = extractPageContext("<html><body>Jogo sem contexto</body></html>");
  assert.equal(result.fields.country, null);
  assert.equal(result.fields.competition, null);
  assert.deepEqual(result.statistics, {});
});
