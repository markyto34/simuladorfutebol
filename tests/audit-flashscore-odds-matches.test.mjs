import test from "node:test";
import assert from "node:assert/strict";
import { auditMatches, parseCsv, normalize, summarizeHistoricalBase, summarizeStatsCoverage } from "../scripts/audit-flashscore-odds-matches.mjs";

const baseRow = (overrides = {}) => ({
  date_time: "2026-11-01T14:30", COUNTRY: "Germany", LEAGUE: "Bundesliga",
  TEAM_HOME: "Bayern München", TEAM_AWAY: "FC Köln", ...overrides
});
const quoteRow = (overrides = {}) => ({
  match_id: "match01", date_time: "2026-11-01T14:30", country: "Germany",
  competition: "Bundesliga", home_team: "Bayern Munchen", away_team: "FC Koln",
  bookmaker: "Bwin", market: "1X2", odd_1: "1.8", odd_x: "3.5", odd_2: "4.2", ...overrides
});

test("normaliza acentos, pontuação e espaços", () => {
  assert.equal(normalize("  Bayern München  "), "bayern munchen");
  assert.equal(normalize("FC-Köln"), "fc koln");
});

test("classifica correspondência exata com nomes normalizados", () => {
  const result = auditMatches([baseRow()], [quoteRow()]);
  assert.equal(result.counts.exact, 1);
});

test("identifica correspondência apenas pela identidade antiga", () => {
  const result = auditMatches([baseRow({ LEAGUE: "Bundesliga 1" })], [quoteRow()]);
  assert.equal(result.counts.legacy_only, 1);
});

test("não escolhe automaticamente quando a identidade antiga é ambígua", () => {
  const result = auditMatches([
    baseRow({ COUNTRY: "Germany", LEAGUE: "Bundesliga" }),
    baseRow({ COUNTRY: "Germany", LEAGUE: "Cup" })
  ], [quoteRow({ competition: "Unknown competition" })]);
  assert.equal(result.counts.ambiguous_legacy, 1);
  assert.equal(result.results[0].candidates.length, 2);
});

test("marca jogos sem correspondência e odds inválidas", () => {
  const result = auditMatches([], [
    quoteRow(),
    quoteRow({ match_id: "match02", odd_x: "" })
  ]);
  assert.equal(result.counts.missing, 1);
  assert.equal(result.counts.invalid_odds, 1);
});

test("lê CSV com campos entre aspas e vírgulas", () => {
  const rows = parseCsv('name,competition\n"FC, Porto","Liga, Portugal"\n');
  assert.equal(rows[0].name, "FC, Porto");
  assert.equal(rows[0].competition, "Liga, Portugal");
});


test("resume o histórico completo por jogos únicos sem apagar observações", () => {
  const summary = summarizeHistoricalBase([
    baseRow(),
    baseRow(),
    baseRow({ date_time: "2026-11-02T14:30", TEAM_HOME: "Porto", TEAM_AWAY: "Benfica", LEAGUE: "Primeira Liga" }),
    { date_time: "", COUNTRY: "", LEAGUE: "", TEAM_HOME: "", TEAM_AWAY: "" }
  ]);
  assert.equal(summary.total_records, 4);
  assert.equal(summary.unique_games, 2);
  assert.equal(summary.repeated_observations, 1);
  assert.equal(summary.records_without_match_identity, 1);
  assert.equal(summary.competitions.length, 2);
  assert.equal(summary.competitions.find(item => item.competition === "Bundesliga").unique_games, 1);
});


test("cruza jogos únicos com Flashscore e mede cobertura estatística", () => {
  const games = summarizeHistoricalBase([baseRow()]).unique_game_index;
  const coverage = summarizeStatsCoverage(games, [{
    date_time: "2026-11-01T14:30", country: "Germany", competition: "Bundesliga",
    home_team: "Bayern Munchen", away_team: "FC Koln",
    corners_home: "7", corners_away: "3", shots_home: "15", shots_away: "8"
  }]);
  assert.equal(coverage.games_with_stats, 1);
  assert.equal(coverage.exact_matches, 1);
  assert.equal(coverage.games_without_stats, 0);
  assert.equal(coverage.metric_coverage_total.corners, 1);
  assert.equal(coverage.metric_coverage_total.shots, 1);
});
