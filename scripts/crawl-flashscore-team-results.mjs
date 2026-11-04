#!/usr/bin/env node
// Pilot batch: deduplicate the last five completed matches for each discovered team.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalize, parseCsv } from "./audit-flashscore-odds-matches.mjs";

const PROXY = (process.env.FLASHSCORE_PROXY_URL || "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev").replace(/\/$/, "");
const arg = name => process.argv.find(value => value.startsWith("--" + name + "="))?.slice(name.length + 3);
const UNIVERSE_FILE = resolve(arg("universe") || "/tmp/historical-team-universe.json");
const SEEDS_FILE = resolve(arg("seeds") || "/tmp/flashscore-team-id-seeds.json");
const OUTPUT = resolve(arg("output") || "/tmp/team-last-five-pilot.json");
const MAX_TEAMS = Math.max(1, Number(arg("max-teams") || 40));
const DELAY_MS = Math.max(0, Number(arg("delay-ms") || 1500));
const STATS_FILE = resolve("data/flashscore-statistics.csv");
const CORE_METRICS = ["possession", "shots", "shots_on_target", "corners", "yellow_cards", "fouls"];
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

function hasCoreStats(row) {
  return CORE_METRICS.every(key =>
    String(row?.[key + "_home"] ?? "").trim() !== "" &&
    String(row?.[key + "_away"] ?? "").trim() !== ""
  );
}

export async function crawlTeamLastFive({
  universe, seeds, existingStats = [], fetchImpl = fetch, sleepImpl = sleep,
  maxTeams = 40, delayMs = 1500, proxy = PROXY
} = {}) {
  const targetByName = new Map((universe?.teams || []).map(team => [team.normalized_name || normalize(team.team_name), team]));
  const teamMap = new Map();
  const queue = [];
  const queued = new Set();
  const queried = new Set();
  const failures = [];
  const fixtures = new Map();
  let requests = 0, successfulTeams = 0, teamsWithFive = 0, mismatchedFixtures = 0, stopReason = null;

  const addCandidate = candidate => {
    if (!candidate?.team_id || !/^[A-Za-z0-9]{8}$/.test(candidate.team_id)) return;
    const normalized = normalize(candidate.team_name || candidate.name);
    const target = targetByName.get(normalized);
    if (!target && !candidate.seed) return;
    const current = teamMap.get(candidate.team_id) || {
      team_id: candidate.team_id,
      team_name: candidate.team_name || candidate.name || "",
      slug: candidate.slug || "",
      normalized_name: normalized,
      target_match_count: target?.unique_matches || 0,
      target_identity_status: target?.identity_status || "seeded_match",
      source: candidate.seed ? "historical_match_seed" : "recent_team_feed"
    };
    if (!current.team_name && (candidate.team_name || candidate.name)) current.team_name = candidate.team_name || candidate.name;
    if (!current.slug && candidate.slug) current.slug = candidate.slug;
    teamMap.set(candidate.team_id, current);
    if (!queued.has(candidate.team_id) && !queried.has(candidate.team_id)) {
      queue.push(candidate.team_id);
      queued.add(candidate.team_id);
    }
  };

  for (const team of seeds?.teams || []) addCandidate({ ...team, seed: true });
  const initialSeedCount = queue.length;

  while (queue.length && requests < maxTeams) {
    const teamId = queue.shift();
    queued.delete(teamId);
    if (queried.has(teamId)) continue;
    queried.add(teamId);
    requests++;
    const url = proxy + "/team-inspect?id=" + encodeURIComponent(teamId);
    try {
      const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (response.status === 403 || response.status === 429) {
        stopReason = "Flashscore upstream HTTP " + response.status + "; processamento interrompido.";
        break;
      }
      if (!response.ok) {
        failures.push({ team_id: teamId, status: response.status, reason: "http_error" });
      } else {
        const payload = await response.json();
        const team = teamMap.get(teamId);
        if (!payload?.ok || payload.team_id !== teamId || !Array.isArray(payload.latest_finished_matches)) {
          failures.push({ team_id: teamId, status: response.status, reason: "invalid_team_feed" });
        } else {
          successfulTeams++;
          const lastFive = payload.latest_finished_matches.slice(0, 5);
          if (lastFive.length === 5) teamsWithFive++;
          for (const match of lastFive) {
            if (match.home?.id !== teamId && match.away?.id !== teamId) {
              mismatchedFixtures++;
              continue;
            }
            const existing = fixtures.get(match.match_id);
            if (!existing) fixtures.set(match.match_id, {
              ...match,
              source_team_ids: [teamId]
            });
            else if (!existing.source_team_ids.includes(teamId)) existing.source_team_ids.push(teamId);
          }
          const discovered = Array.isArray(payload.discovered_teams) ? payload.discovered_teams : [];
          for (const candidate of discovered) addCandidate(candidate);
        }
      }
    } catch (error) {
      failures.push({ team_id: teamId, status: null, reason: String(error?.message || error).slice(0, 180) });
    }
    if (requests % 10 === 0 || requests === maxTeams || !queue.length) {
      console.log("[CRAWL] " + requests + " team feeds; " + teamMap.size + " team IDs known; " + fixtures.size + " unique fixtures.");
    }
    if (queue.length && requests < maxTeams && delayMs > 0) await sleepImpl(delayMs);
  }

  const statsById = new Map((existingStats || []).filter(row => row.match_id).map(row => [row.match_id, row]));
  const uniqueFixtures = [...fixtures.values()].sort((a, b) => (b.start_time || 0) - (a.start_time || 0)).map(match => {
    const existing = statsById.get(match.match_id);
    return {
      ...match,
      stats_status: existing && hasCoreStats(existing) ? "already_complete" : existing ? "partial_or_missing_core" : "not_collected"
    };
  });
  const queriedTeams = [...queried].map(teamId => teamMap.get(teamId)).filter(Boolean).sort((a, b) => a.team_name.localeCompare(b.team_name));
  const discoveredNames = new Set(queriedTeams.map(team => team.normalized_name).filter(Boolean));
  return {
    generated_at: new Date().toISOString(),
    mode: "team_last_five_pilot",
    max_teams: maxTeams,
    initial_seed_team_ids: initialSeedCount,
    queried_teams: queriedTeams.length,
    successful_teams: successfulTeams,
    teams_with_five_finished_matches: teamsWithFive,
    known_team_ids: teamMap.size,
    target_name_groups_covered: discoveredNames.size,
    target_name_groups_total: targetByName.size,
    unique_fixtures: uniqueFixtures.length,
    fixtures_already_complete: uniqueFixtures.filter(match => match.stats_status === "already_complete").length,
    fixtures_to_collect: uniqueFixtures.filter(match => match.stats_status !== "already_complete").length,
    mismatched_fixtures: mismatchedFixtures,
    stop_reason: stopReason,
    failures,
    teams: queriedTeams,
    fixtures: uniqueFixtures
  };
}

export async function main() {
  const [universe, seeds, statsText] = await Promise.all([
    readFile(UNIVERSE_FILE, "utf8").then(JSON.parse),
    readFile(SEEDS_FILE, "utf8").then(JSON.parse),
    readFile(STATS_FILE, "utf8")
  ]);
  const existingStats = parseCsv(statsText);
  const result = await crawlTeamLastFive({ universe, seeds, existingStats, maxTeams: MAX_TEAMS, delayMs: DELAY_MS });
  await writeFile(OUTPUT, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log("[SUMMARY] " + JSON.stringify({
    initial_seed_team_ids: result.initial_seed_team_ids,
    queried_teams: result.queried_teams,
    successful_teams: result.successful_teams,
    teams_with_five_finished_matches: result.teams_with_five_finished_matches,
    known_team_ids: result.known_team_ids,
    target_name_groups_covered: result.target_name_groups_covered,
    unique_fixtures: result.unique_fixtures,
    fixtures_to_collect: result.fixtures_to_collect,
    mismatched_fixtures: result.mismatched_fixtures,
    stop_reason: result.stop_reason,
    failures: result.failures.length,
    output: OUTPUT
  }));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error("[ERROR] " + (error?.stack || error)); process.exitCode = 1; });
}
