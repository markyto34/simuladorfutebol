const test = require("node:test");
const assert = require("node:assert/strict");
const CSVOdds = require("../csv-odds-core.js");

function row(overrides = {}) {
  return {
    date_time: "2026-10-01 18:00:00",
    COUNTRY: "Portugal",
    LEAGUE: "Primeira Liga",
    TEAM_HOME: "Casa FC",
    TEAM_AWAY: "Fora FC",
    odd_ft_1: "1.85",
    odd_ft_x: "3.40",
    odd_ft_2: "4.50",
    score_fh_home: "1",
    score_fh_away: "0",
    score_sh_home: "1",
    score_sh_away: "1",
    score_ft_home: "2",
    score_ft_away: "1",
    score_final_home: "3",
    score_final_away: "1",
    ...overrides
  };
}

test("CSV parser handles BOM, quoted commas, escaped quotes and embedded newlines", () => {
  const parsed = CSVOdds.parseCSV('\uFEFFname,notes\r\n"Casa, FC","linha 1\nlinha 2"\r\n"Clube ""B""",ok');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, "Casa, FC");
  assert.equal(parsed[0].notes, "linha 1\nlinha 2");
  assert.equal(parsed[1].name, 'Clube "B"');
});

test("1X2 outcome uses FT regulation score, not a final score including extra time", () => {
  const [match] = CSVOdds.normalizeRows([row({
    score_ft_home: "1", score_ft_away: "1",
    score_final_home: "2", score_final_away: "1"
  })]);
  assert.equal(match.outcome, "X");
  assert.deepEqual(match.ft, [1, 1]);
  assert.deepEqual(match.final, [2, 1]);
});

test("exact triplet search only includes matches with all three identical odds", () => {
  const matches = CSVOdds.normalizeRows([
    row(),
    row({ TEAM_HOME: "Casa 2", odd_ft_1: "1.86" }),
    row({ TEAM_HOME: "Casa 3", odd_ft_x: "3.41" })
  ]);
  const result = CSVOdds.evaluateCurrentOdds(matches, { "1": 1.85, X: 3.4, "2": 4.5 });
  assert.equal(result.matchedOddsSample, 1);
  assert.equal(result.sample, 1);
  assert.equal(result.matches[0].home, "Casa FC");
});

test("period markets use only records with the required period score", () => {
  const matches = CSVOdds.normalizeRows([
    row(),
    row({ TEAM_HOME: "Sem HT", score_fh_home: "", score_fh_away: "" }),
    row({ TEAM_HOME: "Sem ST", score_sh_home: "", score_sh_away: "" })
  ]);
  const result = CSVOdds.evaluateCurrentOdds(matches, { "1": 1.85, X: 3.4, "2": 4.5 });
  assert.equal(result.marketAnalysis.firstHalf.over05.count, 2);
  assert.equal(result.marketAnalysis.secondHalf.over05.count, 2);
  assert.equal(result.marketAnalysis.fullTime.over15.count, 3);
});

test("missing scores are not converted to zero and incomplete odds are rejected", () => {
  const [match] = CSVOdds.normalizeRows([row({ score_ft_home: "", score_ft_away: "" })]);
  assert.deepEqual(match.ft, [null, null]);
  assert.equal(match.completed, false);
  assert.equal(CSVOdds.hasCompleteOdds({ "1": 1.85, X: 3.4, "2": null }), false);
  assert.equal(CSVOdds.impliedProbabilities({ "1": 1.85, X: 3.4, "2": null }), null);
});

test("odds range helper includes boundaries and excludes incomplete odds", () => {
  const matches = CSVOdds.normalizeRows([
    row(),
    row({ TEAM_HOME: "Odd abaixo", odd_ft_1: "1.80" }),
    row({ TEAM_HOME: "Odd incompleta", odd_ft_2: "" })
  ]);
  const filtered = CSVOdds.filterOddsRanges(matches, {
    "1": { min: 1.85, max: 1.85 },
    X: { min: 3.4, max: 3.4 },
    "2": { min: 4.5, max: 4.5 }
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].home, "Casa FC");
});


test("incremental CSV parser handles chunk boundaries inside quoted fields and CRLF", () => {
  const rows = [];
  const parser = CSVOdds.createCSVParser(row => rows.push(row));
  parser.feed('\uFEFFname,notes\r', false);
  parser.feed('\n"Casa, FC","linha 1', false);
  parser.feed('\nlinha 2"\r', false);
  parser.feed('\n"Clube ""B""",ok', true);
  assert.deepEqual(rows, [
    ["name", "notes"],
    ["Casa, FC", "linha 1\nlinha 2"],
    ['Clube "B"', "ok"]
  ]);
});

test("incremental parser emits a final row without a trailing newline", () => {
  const rows = [];
  const parser = CSVOdds.createCSVParser(row => rows.push(row));
  parser.feed("a,b\n1,2", true);
  assert.deepEqual(rows, [["a", "b"], ["1", "2"]]);
});

test("range evaluation includes completed matches at both boundaries", () => {
  const matches = CSVOdds.normalizeRows([
    row({ odd_ft_1: "1.80" }),
    row({ TEAM_HOME: "Limite", odd_ft_1: "1.90" }),
    row({ TEAM_HOME: "Fora", odd_ft_1: "1.91" }),
    row({ TEAM_HOME: "Pendente", odd_ft_1: "1.85", score_ft_home: "", score_ft_away: "" })
  ]);
  const result = CSVOdds.evaluateOddsRanges(matches, {
    "1": { min: 1.8, max: 1.9 },
    X: { min: 3.4, max: 3.4 },
    "2": { min: 4.5, max: 4.5 }
  });
  assert.equal(result.sample, 2);
  assert.equal(result.matches.length, 2);
  assert.ok(result.market);
  assert.equal(result.marketAnalysis.fullTime.over15.count, 2);
});
