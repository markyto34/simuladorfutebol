import { normalize } from "./audit-flashscore-odds-matches.mjs";

const CORE_METRICS = ["possession","shots","shots_on_target","corners","yellow_cards","fouls"];

export function normalizeFixtureTeam(value) {
  return normalize(String(value || "").replace(/\s*\((?:eng|esp|por|ita|ger|fra|ned|hol|bra|arg|usa|mex|jpn|sco|wal|bel|tur|gre|cro|srb|ukr|rus|pol|swe|nor|den|aut|sui|irl|aus)\)\s*$/i, ""));
}

function dateKey(value) {
  const match = String(value || "").match(/^\s*(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function teamsKey(date, home, away) {
  return [date, normalizeFixtureTeam(home), normalizeFixtureTeam(away)].join("|");
}

function competitionKey(country, competition) {
  return [normalize(country), normalize(competition)].join("|");
}

function hasCoreStats(row) {
  return CORE_METRICS.every(key =>
    String(row?.[key + "_home"] ?? "").trim() !== "" &&
    String(row?.[key + "_away"] ?? "").trim() !== ""
  );
}

export function filterHistoricalMatchIds({
  date, matchIds, fixturesByMatchId = {}, competitionByMatchId = {},
  historicalRows = [], existingStats = []
}) {
  const targetsByTeams = new Map();
  const seenTargets = new Set();
  for (const row of historicalRows) {
    if (dateKey(row.date_time) !== date) continue;
    const key = teamsKey(date, row.TEAM_HOME, row.TEAM_AWAY);
    if (key.endsWith("||")) continue;
    const identity = [key, competitionKey(row.COUNTRY, row.LEAGUE)].join("|");
    if (seenTargets.has(identity)) continue;
    seenTargets.add(identity);
    const list = targetsByTeams.get(key) || [];
    list.push(row);
    targetsByTeams.set(key, list);
  }

  const statsByTeams = new Map();
  for (const row of existingStats) {
    const key = teamsKey(date, row.home_team, row.away_team);
    if (!key.endsWith("||")) {
      const list = statsByTeams.get(key) || [];
      list.push(row);
      statsByTeams.set(key, list);
    }
  }

  const selected = [];
  let matchedTargets = 0, unmatchedFixtures = 0, ambiguousFixtures = 0, skippedComplete = 0, missingFixtureNames = 0;
  for (const matchId of [...new Set(matchIds)]) {
    const fixture = fixturesByMatchId[matchId];
    if (!fixture?.home || !fixture?.away) { missingFixtureNames++; continue; }
    const key = teamsKey(date, fixture.home, fixture.away);
    const candidates = targetsByTeams.get(key) || [];
    if (!candidates.length) { unmatchedFixtures++; continue; }
    let target = candidates[0];
    if (candidates.length > 1) {
      const competition = competitionByMatchId[matchId];
      const compKey = competition?.status === "identified"
        ? competitionKey(competition.country, competition.competition)
        : "";
      const narrowed = compKey ? candidates.filter(row => competitionKey(row.COUNTRY, row.LEAGUE) === compKey) : [];
      if (narrowed.length === 1) target = narrowed[0];
      else { ambiguousFixtures++; continue; }
    }
    matchedTargets++;
    const existingCandidates = statsByTeams.get(key) || [];
    let existing = existingCandidates.length === 1 ? existingCandidates[0] : null;
    if (existingCandidates.length > 1) {
      const compKey = competitionKey(target.COUNTRY, target.LEAGUE);
      const narrowed = existingCandidates.filter(row => competitionKey(row.country, row.competition) === compKey);
      if (narrowed.length === 1) existing = narrowed[0];
    }
    if (existing && hasCoreStats(existing)) { skippedComplete++; continue; }
    selected.push(matchId);
  }
  return {
    matchIds: selected,
    discovered: [...new Set(matchIds)].length,
    historical_targets_for_date: seenTargets.size,
    matched_targets: matchedTargets,
    unmatched_fixtures: unmatchedFixtures,
    ambiguous_fixtures: ambiguousFixtures,
    missing_fixture_names: missingFixtureNames,
    skipped_complete_stats: skippedComplete,
    queued_for_collection: selected.length
  };
}
