#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsv, normalize } from "./audit-flashscore-odds-matches.mjs";

const SOURCE = "ganhonasodds_com_20261101.csv";
const dateKey = value => String(value || "").match(/^\s*(\d{4}-\d{2}-\d{2})/)?.[1] || "";
const outputArg = process.argv.find(value => value.startsWith("--output="))?.slice(9);
const OUTPUT = resolve(outputArg || "historical-team-universe.json");

export function buildHistoricalTeamUniverse(records) {
  const fixtures = new Set();
  const teams = new Map();
  const addTeam = (name, side, opponent, row, fixtureKey) => {
    const normalized = normalize(name);
    if (!normalized) return;
    const key = normalized;
    const team = teams.get(key) || {
      team_name: String(name).trim(),
      normalized_name: normalized,
      unique_matches: 0,
      home_matches: 0,
      away_matches: 0,
      first_date: "",
      last_date: "",
      name_variants: new Set(),
      countries: new Set(),
      competitions: new Set(),
      fixture_keys: new Set()
    };
    team.name_variants.add(String(name).trim());
    if (row.COUNTRY) team.countries.add(String(row.COUNTRY).trim());
    if (row.LEAGUE) team.competitions.add(String(row.LEAGUE).trim());
    if (!team.fixture_keys.has(fixtureKey)) {
      team.fixture_keys.add(fixtureKey);
      team.unique_matches++;
      if (side === "home") team.home_matches++;
      else team.away_matches++;
    }
    const date = dateKey(row.date_time);
    if (date && (!team.first_date || date < team.first_date)) team.first_date = date;
    if (date && (!team.last_date || date > team.last_date)) team.last_date = date;
    teams.set(key, team);
  };

  for (const row of records) {
    const date = dateKey(row.date_time);
    const country = normalize(row.COUNTRY);
    const competition = normalize(row.LEAGUE);
    const home = normalize(row.TEAM_HOME);
    const away = normalize(row.TEAM_AWAY);
    if (!date || !country || !competition || !home || !away) continue;
    const fixtureKey = [date, country, competition, home, away].join("|");
    if (fixtures.has(fixtureKey)) continue;
    fixtures.add(fixtureKey);
    addTeam(row.TEAM_HOME, "home", row.TEAM_AWAY, row, fixtureKey);
    addTeam(row.TEAM_AWAY, "away", row.TEAM_HOME, row, fixtureKey);
  }

  const result = [...teams.values()].map(team => ({
    team_name: team.team_name,
    normalized_name: team.normalized_name,
    unique_matches: team.unique_matches,
    home_matches: team.home_matches,
    away_matches: team.away_matches,
    first_date: team.first_date,
    last_date: team.last_date,
    name_variants: [...team.name_variants].sort(),
    countries: [...team.countries].sort(),
    competitions: [...team.competitions].sort(),
    flashscore_team_id: null
  })).sort((a, b) => b.unique_matches - a.unique_matches || a.team_name.localeCompare(b.team_name));

  return {
    generated_at: new Date().toISOString(),
    source_file: SOURCE,
    source_records: records.length,
    unique_fixtures: fixtures.size,
    unique_teams: result.length,
    teams: result
  };
}

export async function main() {
  const records = parseCsv(await readFile(resolve(SOURCE), "utf8"));
  if (!records.length) throw new Error("CSV histórico vazio; não foi criado qualquer manifesto.");
  const manifest = buildHistoricalTeamUniverse(records);
  await writeFile(OUTPUT, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({
    source_records: manifest.source_records,
    unique_fixtures: manifest.unique_fixtures,
    unique_teams: manifest.unique_teams,
    top_teams: manifest.teams.slice(0, 20).map(({ team_name, unique_matches }) => ({ team_name, unique_matches })),
    output: OUTPUT
  }, null, 2));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
