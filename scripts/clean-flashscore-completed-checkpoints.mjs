#!/usr/bin/env node
import fs from "node:fs";

const RESET_VERSION = 1;

// Os checkpoints anteriores não guardam prova por competição dos jogos descobertos.
// Esta migração invalida completed_paths antigos uma única vez. A versão da migração
// fica no próprio checkpoint, que é publicado juntamente com os dados no checkpoint().
export function resetCompletedCheckpoints({ checkpoint }) {
  if ((Number(checkpoint?.completed_paths_reset_version) || 0) >= RESET_VERSION) {
    return { checkpoint, removed: [], reset: false };
  }

  const removed = [...new Set(checkpoint?.completed_paths || [])].sort();
  return {
    checkpoint: {
      ...checkpoint,
      completed_paths: [],
      completed_paths_reset_version: RESET_VERSION,
      updated_at: new Date().toISOString()
    },
    removed,
    reset: true
  };
}

function main() {
  const file = "data/flashscore-season-backfill-checkpoint.json";
  const checkpoint = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = resetCompletedCheckpoints({ checkpoint });
  if (result.reset) {
    fs.writeFileSync(file, JSON.stringify(result.checkpoint, null, 2) + "\n");
  }
  console.log(JSON.stringify({
    reset_performed: result.reset,
    reset_checkpoints: result.removed.length,
    migration_version: RESET_VERSION,
    preserved_statistics_and_odds: true,
    note: result.reset
      ? "Reset único preparado; a versão da migração fica guardada no checkpoint."
      : "Reset global já aplicado anteriormente; checkpoints atuais preservados."
  }, null, 2));
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  try { main(); } catch (error) { console.error("[CHECKPOINT RESET ERROR] " + error.message); process.exitCode = 1; }
}
