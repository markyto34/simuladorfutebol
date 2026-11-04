import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv, datesNeedingMetadata, applyMetadata } from "../scripts/backfill-flashscore-metadata.mjs";

test("CSV parser preserva vírgulas e aspas em nomes", () => {
  const parsed = parseCsv('match_id,date_time,country,competition,home_team\nabc,2026-11-01T12:00,,,"A, \"\"B\"\""\n');
  assert.equal(parsed.records[0].home_team, 'A, "B"');
  assert.equal(parseCsv(toCsv(parsed.headers, parsed.records)).records[0].home_team, 'A, "B"');
});

test("seleciona apenas datas com metadados em falta", () => {
  const stats = [
    { match_id: "abc123", date_time: "2026-11-01T12:00", country: "", competition: "" },
    { match_id: "def456", date_time: "2026-11-02T12:00", country: "PT", competition: "Liga" }
  ];
  const odds = [{ match_id: "ghi789", date_time: "2026-11-03T12:00", country: "", competition: "Cup" }];
  assert.deepEqual(datesNeedingMetadata(stats, odds), ["2026-11-01", "2026-11-03"]);
});

test("preenche apenas campos vazios e não altera identidades ambíguas", () => {
  const stats = [
    { match_id: "abc123", date_time: "2026-11-01T12:00", country: "", competition: "", home_team: "A" },
    { match_id: "def456", date_time: "2026-11-01T13:00", country: "PT", competition: "", home_team: "B" },
    { match_id: "ghi789", date_time: "2026-11-01T14:00", country: "", competition: "", home_team: "C" }
  ];
  const odds = [
    { match_id: "abc123", date_time: "2026-11-01T12:00", country: "", competition: "" },
    { match_id: "ghi789", date_time: "2026-11-01T14:00", country: "", competition: "" }
  ];
  const identities = new Map([["2026-11-01", {
    abc123: { status: "identified", country: "DE", competition: "Bundesliga" },
    def456: { status: "identified", country: "PT", competition: "Primeira Liga" },
    ghi789: { status: "ambiguous", country: null, competition: null }
  }]]);
  const result = applyMetadata(stats, odds, identities);
  assert.deepEqual(result, { statsUpdated: 2, oddsUpdated: 1, ambiguous: 2, unmatched: 0 });
  assert.equal(stats[0].country, "DE");
  assert.equal(stats[1].country, "PT");
  assert.equal(stats[1].competition, "Primeira Liga");
  assert.equal(stats[2].country, "");
  assert.equal(odds[0].competition, "Bundesliga");
  assert.equal(odds[1].country, "");
});
