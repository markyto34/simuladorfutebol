#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsv, normalize } from "./audit-flashscore-odds-matches.mjs";

const SOURCE = "ganhonasodds_com_20261101.csv";
const dateKey = value => String(value || "").match(/^\s*(\d{4}-\d{2}-\d{2})/)?.[1] || "";
const outputArg = process.argv.find(value => value.startsWith("--output="))?.slice(9);
const OUTPUT = resolve(outputArg || "historical-team-universe.json");
const INTERNATIONAL_COUNTRIES = new Set([
  "europa", "america do sul", "america do norte e central", "mundo", "world",
  "internacional", "international", "africa", "asia", "oceania"
]);

export function buildHistoricalTeamUniverse(records) {
  const fixtures = new Set();
  const teams = new Map();
  const addTeam = (name, side, row, fixtureKey) => {
    const normalized = normalize(name);
    if (!normalized) return;
    const team = teams.get(normalized) || {
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
      country_match_counts: new Map(),
      fixture_keys: new Set()
    };
    team.name_variants.add(String(name).trim());
    if (row.COUNTRY) team.countries.add(String(row.COUNTRY).trim());
    if (row.LEAGUE) team.competitions.add(String(row.LEAGUE).trim());
    if (!team.fixture_keys.has(fixtureKey)) {
      team.fixture_keys.add(fixtureKey);
      team.unique_matches++;
      const country = String(row.COUNTRY || "").trim();
      team.country_match_counts.set(country, (team.country_match_counts.get(country) || 0) + 1);
      if (side === "home") team.home_matches++;
      else team.away_matches++;
    }
    const date = dateKey(row.date_time);
    if (date && (!team.first_date || date < team.first_date)) team.first_date = date;
    if (date && (!team.last_date || date > team.last_date)) team.last_date = date;
    teams.set(normalized, team);
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
    addTeam(row.TEAM_HOME, "home", row, fixtureKey);
    addTeam(row.TEAM_AWAY, "away", row, fixtureKey);
  }

  const result = [...teams.values()].map(team => {
    const countryCounts = [...team.country_match_counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const domestic = countryCounts.filter(([country]) => !INTERNATIONAL_COUNTRIES.has(normalize(country)));
    const top = domestic[0] || null;
    const second = domestic[1] || null;
    const primaryCountry = top && (!second || top[1] >= second[1] * 1.5) ? top[0] : null;
    const identityStatus = !domestic.length
      ? "international_only"
      : domestic.length === 1
        ? "single_country"
        : primaryCountry
          ? "dominant_country"
          : "ambiguous_country_collision";
    return {
      team_name: team.team_name,
      normalized_name: team.normalized_name,
      unique_matches: team.unique_matches,
      home_matches: team.home_matches,
      away_matches: team.away_matches,
      first_date: team.first_date,
      last_date: team.last_date,
      name_variants: [...team.name_variants].sort(),
      countries: [...team.countries].sort(),
      country_match_counts: Object.fromEntries(countryCounts),
      primary_country: primaryCountry,
      identity_status: identityStatus,
      competitions: [...team.competitions].sort(),
      flashscore_team_id: null
    };
  }).sort((a, b) => b.unique_matches - a.unique_matches || a.team_name.localeCompare(b.team_name));

  return {
    generated_at: new Date().toISOString(),
    source_file: SOURCE,
    source_records: records.length,
    unique_fixtures: fixtures.size,
    unique_teams: result.length,
    ambiguous_name_groups: result.filter(team => team.identity_status === "ambiguous_country_collision").length,
    international_only_groups: result.filter(team => team.identity_status === "international_only").length,
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
    ambiguous_name_groups: manifest.ambiguous_name_groups,
    international_only_groups: manifest.international_only_groups,
    top_teams: manifest.teams.slice(0, 20).map(({ team_name, unique_matches, primary_country, identity_status }) => ({ team_name, unique_matches, primary_country, identity_status })),
    output: OUTPUT
  }, null, 2));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
