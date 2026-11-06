#!/usr/bin/env node
import fs from "node:fs";
import { parseCsv } from "./validate-flashscore-history.mjs";

const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const pathOf = item => { try { return new URL(item.url).pathname; } catch { return ""; } };

export function cleanCompletedCheckpoints({ catalog, stats, checkpoint }) {
  if (!Array.isArray(catalog?.competitions)) throw new Error("Catálogo Flashscore inválido.");
  const rowsByCompetition = new Set((stats || []).map(row =>
    normalize(row.country) + "|" + normalize(row.competition)
  ));
  const competitionByPath = new Map(catalog.competitions.map(item => [
    pathOf(item), normalize(item.country_name) + "|" + normalize(item.competition_name)
  ]));
  const completed = [...new Set(checkpoint?.completed_paths || [])];
  const kept = [];
  const removed = [];
  for (const path of completed) {
    const key = competitionByPath.get(path);
    if (key && rowsByCompetition.has(key)) kept.push(path);
    else removed.push(path);
  }
  return {
    checkpoint: { ...checkpoint, completed_paths: kept.sort(), updated_at: new Date().toISOString() },
    removed,
    kept: kept.length
  };
}

function main() {
  const catalog = JSON.parse(fs.readFileSync("data/flashscore-competition-catalog.json", "utf8"));
  const stats = parseCsv(fs.readFileSync("data/flashscore-statistics.csv", "utf8"));
  const checkpoint = JSON.parse(fs.readFileSync("data/flashscore-season-backfill-checkpoint.json", "utf8"));
  const result = cleanCompletedCheckpoints({ catalog, stats, checkpoint });
  fs.writeFileSync("data/flashscore-season-backfill-checkpoint.json", JSON.stringify(result.checkpoint, null, 2) + "\n");
  console.log(JSON.stringify({ kept: result.kept, removed: result.removed.length, removed_paths: result.removed }, null, 2));
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  try { main(); } catch (error) { console.error("[CHECKPOINT CLEANUP ERROR] " + error.message); process.exitCode = 1; }
}
