import test from "node:test";
import assert from "node:assert/strict";
import { extractPageContext } from "../flashscore-proxy/src/extract-page-context.mjs";

test("parses current Flashscore WCL order: home value, label, away value", () => {
  const html = '<div class="wcl-statistics_vZTGP statisticsMobi" data-testid="wcl-statistics">' +
    '<div class="wcl-labelRow"><div><div class="wcl-value">0.68</div></div>' +
    '<div class="wcl-label"><span>Golos esperados (xG)</span></div>' +
    '<div class="wcl-awayValue"><div class="wcl-value">1.17</div></div></div>' +
    '<div class="wcl-labelRow"><div><div class="wcl-value">37%</div></div>' +
    '<div class="wcl-label"><span>Posse de bola</span></div>' +
    '<div class="wcl-awayValue"><div class="wcl-value">63%</div></div></div>' +
    '<div class="wcl-labelRow"><div><div class="wcl-value">5</div></div>' +
    '<div class="wcl-label"><span>Total remates</span></div>' +
    '<div class="wcl-awayValue"><div class="wcl-value">14</div></div></div>' +
    '<div class="wcl-labelRow"><div><div class="wcl-value">2</div></div>' +
    '<div class="wcl-label"><span>Remates à baliza</span></div>' +
    '<div class="wcl-awayValue"><div class="wcl-value">2</div></div></div>' +
    '<div class="wcl-labelRow"><div><div class="wcl-value">1</div></div>' +
    '<div class="wcl-label"><span>Grandes oportunidades</span></div>' +
    '<div class="wcl-awayValue"><div class="wcl-value">2</div></div></div></div>';
  const result = extractPageContext(html);
  assert.deepEqual(result.statistics.expected_goals, { home: 0.68, away: 1.17, unit: null, source_label: "Golos esperados (xG)" });
  assert.deepEqual(result.statistics.possession, { home: 37, away: 63, unit: "%", source_label: "Posse de bola" });
  assert.deepEqual(result.statistics.shots, { home: 5, away: 14, unit: null, source_label: "Total remates" });
  assert.deepEqual(result.statistics.shots_on_target, { home: 2, away: 2, unit: null, source_label: "Remates à baliza" });
  assert.deepEqual(result.statistics.big_chances, { home: 1, away: 2, unit: null, source_label: "Grandes oportunidades" });
});
