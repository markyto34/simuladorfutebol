import test from "node:test";
import assert from "node:assert/strict";
import { extractPageContext } from "../flashscore-proxy/src/extract-page-context.mjs";

test("extracts explicit country and competition data attributes", () => {
  const html = '<nav data-testid="competition-breadcrumb" data-country="Germany" data-league="Bundesliga">Bundesliga</nav>';
  const result = extractPageContext(html);
  assert.equal(result.fields.country, "Germany");
  assert.equal(result.fields.competition, "Bundesliga");
  assert.ok(result.evidence.some(item => item.field === "country" && item.candidates.some(candidate => candidate.source === "attribute:data-country")));
  assert.ok(result.evidence.some(item => item.field === "competition" && item.candidates.some(candidate => candidate.source === "attribute:data-league")));
});

test("extracts statistics from modern wcl-statistics DOM containers", () => {
  const html = '<div data-testid="wcl-statistics" class="wcl-statistics_vZTGP statisticsMobi">' +
    '<div class="stat-row"><span>Golos esperados (xG)</span><span>0.68</span><span>1.17</span></div>' +
    '<div class="stat-row"><span>Posse de bola</span><span>37%</span><span>63%</span></div>' +
    '<div class="stat-row"><span>Total remates</span><span>5</span><span>14</span></div>' +
    '<div class="stat-row"><span>Remates à baliza</span><span>2</span><span>2</span></div>' +
    '<div class="stat-row"><span>Grandes oportunidades</span><span>1</span><span>3</span></div></div>';
  const result = extractPageContext(html);
  assert.deepEqual(result.statistics.expected_goals, { home: 0.68, away: 1.17, unit: null, source_label: "Golos esperados (xG)" });
  assert.deepEqual(result.statistics.possession, { home: 37, away: 63, unit: "%", source_label: "Posse de bola" });
  assert.deepEqual(result.statistics.shots, { home: 5, away: 14, unit: null, source_label: "Total remates" });
  assert.deepEqual(result.statistics.shots_on_target, { home: 2, away: 2, unit: null, source_label: "Remates à baliza" });
  assert.deepEqual(result.statistics.big_chances, { home: 1, away: 3, unit: null, source_label: "Grandes oportunidades" });
});

test("does not guess identity from team names or unrelated text", () => {
  const html = '<title>UNI 1-1 KOL | Union Berlin - FC Koln</title><div>Germany Bundesliga</div>';
  const result = extractPageContext(html);
  assert.equal(result.fields.country, null);
  assert.equal(result.fields.competition, null);
});


test("extracts first-half and second-half corners only from explicitly labelled statistics", () => {
  const html = '<div data-testid="wcl-statistics">' +
    '<div class="stat-row"><span>Cantos 1.ª Parte</span><span>3</span><span>2</span></div>' +
    '<div class="stat-row"><span>2ª Parte - Cantos</span><span>4</span><span>5</span></div>' +
    '<div class="stat-row"><span>Cantos</span><span>7</span><span>7</span></div>' +
    '</div>';
  const result = extractPageContext(html);
  assert.deepEqual(result.statistics.corners_ht, { home: 3, away: 2, unit: null, source_label: "Cantos 1.ª Parte" });
  assert.deepEqual(result.statistics.corners_st, { home: 4, away: 5, unit: null, source_label: "2ª Parte - Cantos" });
  assert.deepEqual(result.statistics.corners, { home: 7, away: 7, unit: null, source_label: "Cantos" });
});

test("does not infer period corners from total corners or score periods", () => {
  const html = '<div data-testid="wcl-statistics">' +
    '<div class="stat-row"><span>Cantos</span><span>7</span><span>5</span></div>' +
    '</div>';
  const result = extractPageContext(html);
  assert.equal(result.statistics.corners_ht, undefined);
  assert.equal(result.statistics.corners_st, undefined);
});
