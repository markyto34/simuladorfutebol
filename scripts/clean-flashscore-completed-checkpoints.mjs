#!/usr/bin/env node
import fs from "node:fs";

// Os checkpoints antigos não guardam prova por competição dos jogos descobertos.
// Como uma versão anterior podia concluir competições com zero jogos, nenhum
// completed_path antigo é fiável. Os CSVs permanecem intactos; a recolha volta
// a descobrir cada época e ignora jogos que já tenham estatísticas completas.
export function resetCompletedCheckpoints({ checkpoint }) {
  const removed = [...new Set(checkpoint?.completed_paths || [])].sort();
  return {
    checkpoint: { ...checkpoint, completed_paths: [], updated_at: new Date().toISOString() },
    removed
  };
}

function main() {
  const file = "data/flashscore-season-backfill-checkpoint.json";
  const checkpoint = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = resetCompletedCheckpoints({ checkpoint });
  fs.writeFileSync(file, JSON.stringify(result.checkpoint, null, 2) + "\n");
  console.log(JSON.stringify({
    reset_checkpoints: result.removed.length,
    preserved_statistics_and_odds: true,
    note: "Os jogos completos serão reconhecidos novamente durante a descoberta."
  }, null, 2));
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  try { main(); } catch (error) { console.error("[CHECKPOINT RESET ERROR] " + error.message); process.exitCode = 1; }
}
