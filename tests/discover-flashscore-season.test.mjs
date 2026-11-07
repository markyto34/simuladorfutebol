import test from "node:test";
import assert from "node:assert/strict";
import { discoverSeasonFromHtml, getCollectedMatchIds } from "../scripts/discover-flashscore-season.mjs";

test("descobre a época atual e pagina resultados Flashscore", async () => {
  const tick = String.fromCharCode(96);
  const html = [
    '<script>window.environment = {"sport_id":1,"selected_season_id":0,"season_list":[{"name":"2026/2027","pathname":"/standings/AbCd1234/EfGh5678/"}],"stages_group":{"stages":[{"countryId":174}]}};</script>',
    "<script>cjs.initialFeeds['results'] = {",
    " data: " + tick + "ZA÷ENGLAND: Premier League¬~ZEE÷TmPl1234¬~AA÷match001¬AD÷1790000000¬AB÷3¬AE÷Home FC¬AF÷Away FC¬~" + tick + ",",
    " allEventsCount: 2,"
    " seasonId: 2026",
    "}</script>"
  ].join("\n");
  const result = await discoverSeasonFromHtml({
    html, path: "/futebol/inglaterra/premier-league/",
    fetchFeedPage: async name => {
      assert.equal(name, "tr_1_174_TmPl1234_2026_1_5_en_1");
      return "AA÷match002¬AD÷1790001000¬AB÷3¬AE÷Other Home¬AF÷Other Away¬~";
    }
  });
  assert.equal(result.context.season_name, "2026/2027");
  assert.equal(result.context.tournament_id, "AbCd1234");
  assert.equal(result.context.stage_id, "EfGh5678");
  assert.deepEqual(result.fixtures.map(row => row.match_id), ["match001", "match002"]);
  assert.equal(result.fixtures[1].competition, "ENGLAND: Premier League");
});


test("considera já consultado qualquer jogo com registo Flashscore, mesmo com indicadores vazios", () => {
  const ids = getCollectedMatchIds([
    { match_id: "match001", source: "Flashscore", corners_ht_home: "" },
    { match_id: "match002", source: "Outro" },
    { match_id: "match003", source: "Flashscore" }
  ]);
  assert.deepEqual([...ids].sort(), ["match001", "match003"]);
});
