#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./validate-flashscore-history.mjs";

const CATALOG = process.env.FLASHSCORE_PREPARED_CATALOG || "data/flashscore-competition-catalog.json";
const STATS = process.env.FLASHSCORE_STATS_CSV || "data/flashscore-statistics.csv";
const CHECKPOINT = process.env.FLASHSCORE_CHECKPOINT || "data/flashscore-season-backfill-checkpoint.json";
const OUTPUT = process.env.FLASHSCORE_STATUS_OUTPUT || "data/flashscore-competition-status.json";
const REQUIRED_INDICATORS = [
  "shots", "shots_on_target", "corners", "corners_ht", "corners_st",
  "yellow_cards", "red_cards", "blocked_shots", "fouls"
];
const ALL_FIELDS = [
  "score_home", "score_away", "ht_home", "ht_away", "sh_home", "sh_away",
  ...REQUIRED_INDICATORS.flatMap(key => [key + "_home", key + "_away"])
];
const CORE_FIELDS = ALL_FIELDS;
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const pathOf = item => { try { return new URL(item.url).pathname; } catch { return ""; } };

export function buildCompetitionStatus({ catalog, stats, checkpoint }) {
  if (!Array.isArray(catalog?.competitions)) throw new Error("Catálogo preparado inválido.");
  const rowsByCompetition = new Map();
  for (const row of stats || []) {
    const key = normalize(row.country) + "|" + normalize(row.competition);
    if (!rowsByCompetition.has(key)) rowsByCompetition.set(key, []);
    rowsByCompetition.get(key).push(row);
  }
  const completedPaths = new Set(checkpoint?.completed_paths || []);
  const skippedPaths = new Set(checkpoint?.skipped_paths || []);
  const statusByPath = {};
  const competitions = catalog.competitions.map(item => {
    const path = pathOf(item);
    const key = normalize(item.country_name) + "|" + normalize(item.competition_name);
    const rows = rowsByCompetition.get(key) || [];
    const observedFields = ALL_FIELDS.filter(field => rows.some(row => String(row[field] ?? "").trim() !== ""));
    const missingFields = CORE_FIELDS.filter(field => rows.some(row => String(row[field] ?? "").trim() === ""));
    const allFieldsComplete = rows.length > 0 && missingFields.length === 0;
    const skipped = skippedPaths.has(path);
    const status = skipped ? "unavailable" : allFieldsComplete ? "complete" : rows.length ? "partial" : "new";
    const result = {
      path, status, checkpoint_completed: completedPaths.has(path), checkpoint_skipped: skipped,
      matches_with_stats: rows.length, observed_indicator_count: observedFields.length,
      missing_indicator_count: missingFields.length, all_available_indicators_complete: allFieldsComplete
    };
    if (path) statusByPath[path] = result;
    return result;
  });
  return {
    generated_at: new Date().toISOString(),
    source: "flashscore-statistics.csv + flashscore-season-backfill-checkpoint.json",
    indicator_fields: ALL_FIELDS,
    summary: {
      competitions: competitions.length,
      complete: competitions.filter(x => x.status === "complete").length,
      partial: competitions.filter(x => x.status === "partial").length,
      new: competitions.filter(x => x.status === "new").length,
      checkpoint_completed: competitions.filter(x => x.checkpoint_completed).length,
      skipped_unavailable: competitions.filter(x => x.checkpoint_skipped).length
    },
    status_by_path: statusByPath
  };
}

async function main() {
  const [catalog, statsText, checkpoint] = await Promise.all([
    readFile(CATALOG, "utf8").then(JSON.parse),
    readFile(STATS, "utf8"),
    readFile(CHECKPOINT, "utf8").then(JSON.parse)
  ]);
  const report = buildCompetitionStatus({ catalog, stats: parseCsv(statsText), checkpoint });
  await writeFile(OUTPUT, JSON.stringify(report) + "\n");
  console.log(JSON.stringify(report.summary, null, 2));
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
