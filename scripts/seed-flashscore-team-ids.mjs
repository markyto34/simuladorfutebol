#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsv, normalize } from "./audit-flashscore-odds-matches.mjs";

const BASE_FILE = resolve("ganhonasodds_com_20261101.csv");
const STATS_FILE = resolve("data/flashscore-statistics.csv");
const PROXY = (process.env.FLASHSCORE_PROXY_URL || "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev").replace(/\/$/, "");
const OUTPUT = resolve(process.argv.find(value => value.startsWith("--output="))?.slice(9) || "flashscore-team-id-seeds.json");
const limitArg = Number(process.argv.find(value => value.startsWith("--limit="))?.slice(8) || 20);
const delayArg = Number(process.argv.find(value => value.startsWith("--delay-ms="))?.slice(11) || 1500);

export function selectSeedTargets(rows, limit = 20) {
  const candidates = rows.filter(row =>
    /^[A-Za-z0-9]{6,16}$/.test(String(row.flashscore_match_id || "")) &&
    normalize(row.home_team) && normalize(row.away_team)
  );
  const unique = [...new Map(candidates.map(row => [row.flashscore_match_id, row])).values()];
  const remaining = new Set(unique);
  const coveredTeams = new Set();
  const coveredCompetitions = new Set();
  const selected = [];
  const max = Number.isInteger(limit) && limit > 0 ? Math.min(limit, unique.length) : unique.length;
  while (remaining.size && selected.length < max) {
    let best = null, bestScore = -1;
    for (const row of remaining) {
      const home = normalize(row.home_team), away = normalize(row.away_team);
      const newTeams = Number(!coveredTeams.has(home)) + Number(!coveredTeams.has(away));
      const compKey = normalize(row.country) + "|" + normalize(row.competition);
      const score = newTeams * 100 + Number(!coveredCompetitions.has(compKey)) * 10;
      if (score > bestScore || (score === bestScore && String(row.date).localeCompare(String(best?.date || "")) < 0)) {
        best = row;
        bestScore = score;
      }
    }
    if (!best) break;
    selected.push(best);
    remaining.delete(best);
    coveredTeams.add(normalize(best.home_team));
    coveredTeams.add(normalize(best.away_team));
    coveredCompetitions.add(normalize(best.country) + "|" + normalize(best.competition));
  }
  return selected;
}

export async function collectTeamIdSeeds({
  targetRows, fetchImpl = fetch, sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms)),
  limit = 20, delayMs = 1500, proxy = PROXY
} = {}) {
  const targets = selectSeedTargets(targetRows || [], limit);
  if (!targets.length) throw new Error("Não existem jogos matched_exact com match_id para semear IDs de equipas.");
  const teams = new Map();
  const failures = [];
  let requests = 0, successfulMatches = 0, matchesWithoutTeamLinks = 0, stopReason = null;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const url = proxy + "/inspect?id=" + encodeURIComponent(target.flashscore_match_id) + "&summary=1";
    requests++;
    try {
      const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(45_000) });
      if (response.status === 403 || response.status === 429) {
        stopReason = "Flashscore upstream HTTP " + response.status + "; recolha interrompida para evitar bloqueio.";
        break;
      }
      if (!response.ok) {
        failures.push({ match_id: target.flashscore_match_id, status: response.status, reason: "http_error" });
      } else {
        const payload = await response.json();
        const links = payload?.inspection?.team_links;
        if (payload?.ok !== true || !Array.isArray(links) || links.length < 2) {
          matchesWithoutTeamLinks++;
          failures.push({ match_id: target.flashscore_match_id, status: response.status, reason: "team_links_missing" });
        } else {
          successfulMatches++;
          for (const link of links) {
            if (!/^[A-Za-z0-9]{8}$/.test(String(link.team_id || ""))) continue;
            const current = teams.get(link.team_id) || {
              team_id: link.team_id, team_name: link.name || "", slug: link.slug || "",
              name_variants: new Set(), source_matches: new Set(), country_contexts: new Set(), competitions: new Set()
            };
            if (link.name) current.name_variants.add(link.name);
            current.source_matches.add(target.flashscore_match_id);
            if (target.country) current.country_contexts.add(target.country);
            if (target.competition) current.competitions.add(target.competition);
            if (!current.team_name && link.name) current.team_name = link.name;
            if (!current.slug && link.slug) current.slug = link.slug;
            teams.set(link.team_id, current);
          }
        }
      }
    } catch (error) {
      failures.push({ match_id: target.flashscore_match_id, status: null, reason: String(error?.message || error).slice(0, 180) });
    }
    if (i < targets.length - 1 && delayMs > 0) await sleep(delayMs);
    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      console.log("[SEED] " + (i + 1) + "/" + targets.length + " matches; " + teams.size + " team IDs found.");
    }
  }

  const teamRows = [...teams.values()].map(team => ({
    team_id: team.team_id, team_name: team.team_name, slug: team.slug,
    name_variants: [...team.name_variants].sort(),
    source_matches: [...team.source_matches].sort(),
    country_contexts: [...team.country_contexts].sort(),
    competitions: [...team.competitions].sort()
  })).sort((a, b) => a.team_name.localeCompare(b.team_name) || a.team_id.localeCompare(b.team_id));

  return {
    generated_at: new Date().toISOString(), source_files: ["ganhonasodds_com_20261101.csv", "data/flashscore-statistics.csv"],
    selected_matches: targets.length, requests, successful_matches: successfulMatches, matches_without_team_links: matchesWithoutTeamLinks,
    unique_team_ids: teamRows.length, stop_reason: stopReason, failures, teams: teamRows
  };
}

export async function main() {
  const [baseRows, statsRows] = await Promise.all([readFile(BASE_FILE, "utf8"), readFile(STATS_FILE, "utf8")]);
  const base = parseCsv(baseRows), stats = parseCsv(statsRows);
  const dateKey = value => String(value || "").match(/^\s*(\d{4}-\d{2}-\d{2})/)?.[1] || "";
  const fixtureKey = row => [dateKey(row.date_time), normalize(row.COUNTRY ?? row.country), normalize(row.LEAGUE ?? row.competition), normalize(row.TEAM_HOME ?? row.home_team), normalize(row.TEAM_AWAY ?? row.away_team)].join("|");
  const baseKeys = new Set(base.map(fixtureKey));
  const targetRows = [...new Map(stats.filter(row => row.match_id && baseKeys.has(fixtureKey(row))).map(row => [row.match_id, {
    stats_status: "matched_exact", flashscore_match_id: row.match_id, date: dateKey(row.date_time),
    country: row.country, competition: row.competition, home_team: row.home_team, away_team: row.away_team
  }])).values()];
  const result = await collectTeamIdSeeds({
    targetRows, limit: Number.isFinite(limitArg) ? limitArg : 20,
    delayMs: Number.isFinite(delayArg) ? Math.max(0, delayArg) : 1500
  });
  await writeFile(OUTPUT, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log("[SUMMARY] " + JSON.stringify({
    selected_matches: result.selected_matches, requests: result.requests,
    successful_matches: result.successful_matches, unique_team_ids: result.unique_team_ids,
    matches_without_team_links: result.matches_without_team_links,
    stop_reason: result.stop_reason, failures: result.failures.length, output: OUTPUT
  }));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error("[ERROR] " + (error?.stack || error)); process.exitCode = 1; });
}
