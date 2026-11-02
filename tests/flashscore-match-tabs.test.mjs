import test from "node:test";
import assert from "node:assert/strict";
import { buildMatchTabUrl, resolveMatchTab } from "../flashscore-proxy/src/match-tabs.mjs";

test("maps only explicitly observed match tabs to fixed same-origin paths", () => {
  assert.equal(buildMatchTabUrl("hW5lOaOP", "summary"), "/jogo/hW5lOaOP/");
  assert.equal(buildMatchTabUrl("hW5lOaOP", "statistics"), "/jogo/hW5lOaOP/?t=estatisticas");
  assert.equal(buildMatchTabUrl("hW5lOaOP", "lineups"), "/jogo/hW5lOaOP/?t=equipas");
  assert.equal(buildMatchTabUrl("hW5lOaOP", "standings"), "/jogo/hW5lOaOP/?t=classificacoes");
  assert.equal(buildMatchTabUrl("hW5lOaOP", "commentary"), "/jogo/hW5lOaOP/?t=comentarios-ao-vivo");
  assert.equal(buildMatchTabUrl("hW5lOaOP", "h2h"), "/jogo/hW5lOaOP/?t=h2h");
});

test("rejects unknown tabs and malformed match identifiers", () => {
  assert.equal(resolveMatchTab("odds"), null);
  assert.throws(() => buildMatchTabUrl("hW5lOaOP", "unknown"), /invalid_match_tab/);
  assert.throws(() => buildMatchTabUrl("../other", "summary"), /invalid_match_id/);
});
