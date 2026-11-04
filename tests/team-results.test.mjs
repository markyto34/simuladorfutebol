import test from "node:test";
import assert from "node:assert/strict";
import { extractTeamProfileLinks, extractTeamResultCandidates, parseTeamResultsFeed, selectLatestFinishedTeamMatches } from "../flashscore-proxy/src/team-results.mjs";

test("extracts unique Flashscore team profile IDs in Portuguese and English URL forms", () => {
  const html = '<a href="/equipa/sporting-cp/tljXuHBC/">Sporting CP</a><a href="/team/benfica/zBkyuyRI/">Benfica</a><a href="/equipa/sporting-cp/tljXuHBC/">Sporting</a><a href="/jogo/AbCd1234/">match</a>';
  assert.deepEqual(extractTeamProfileLinks(html), [
    { team_id: "tljXuHBC", slug: "sporting-cp", name: "Sporting CP", href: "/equipa/sporting-cp/tljXuHBC/" },
    { team_id: "zBkyuyRI", slug: "benfica", name: "Benfica", href: "/team/benfica/zBkyuyRI/" }
  ]);
});

test("extracts unique match IDs and nearby date and score candidates from team results HTML", () => {
  const html = '<div>30.10.2026 Sporting CP 2 - 0 Casa Pia</div><a href="/jogo/AbCd1234/">Sporting CP - Casa Pia</a><a href="/jogo/AbCd1234/">duplicate</a><div>27.10.2026 Sporting CP 2 - 1 Marítimo</div><a href="/jogo/EfGh5678/">Sporting CP - Marítimo</a>';
  const rows = extractTeamResultCandidates(html);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.match_id), ["AbCd1234", "EfGh5678"]);
  assert.equal(rows[0].date_text, "30.10.2026");
  assert.deepEqual(rows[0].score_candidates[0], [2, 0]);
});


test("parses Flashscore team feed and selects the five latest finished matches only", () => {
  const feed = [
    "ZA÷PORTUGAL: Liga Portugal¬",
    "AA÷AbCd1234¬AD÷1793380000¬AB÷3¬AE÷Sporting CP¬AF÷Casa Pia¬AG÷2¬AH÷0¬AU÷tljXuHBC¬AV÷AbCd9999¬",
    "AA÷EfGh5678¬AD÷1793466400¬AB÷1¬AE÷Sporting CP¬AF÷Benfica¬AG÷¬AH÷¬",
    "AA÷IjKl9012¬AD÷1793552800¬AB÷3¬AE÷Braga¬AF÷Sporting CP¬AG÷1¬AH÷3¬ZA÷EUROPA: Champions League¬",
    "AA÷MnOp3456¬AD÷1793639200¬AB÷2¬AE÷Sporting CP¬AF÷Porto¬AG÷1¬AH÷1¬"
  ].join("~");
  const events = parseTeamResultsFeed(feed);
  assert.equal(events.length, 4);
  assert.equal(events[0].match_id, "MnOp3456");
  assert.equal(events[0].stage, "live");
  assert.equal(events[1].competition, "EUROPA: Champions League");
  const latest = selectLatestFinishedTeamMatches(events, 5);
  assert.deepEqual(latest.map(item => item.match_id), ["IjKl9012", "AbCd1234"]);
  assert.deepEqual(latest.map(item => item.stage), ["finished", "finished"]);
});
