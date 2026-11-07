#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCsv } from "./validate-flashscore-history.mjs";

/**
 * Uma competição fica consultada quando existe um registo Flashscore válido
 * para cada jogo do manifesto. A cobertura dos indicadores é informativa:
 * campos vazios significam "não disponibilizado", nunca zero nem erro técnico.
 */
export function validateSelectedCompetition({ manifest, rows }) {
  const fixtures = Array.isArray(manifest?.fixtures) ? manifest.fixtures : [];
  if (!fixtures.length) throw new Error("Manifesto sem jogos; não pode ser marcado como concluído.");
  const byId = new Map((rows || [])
    .filter(row => row?.source === "Flashscore" && String(row.match_id || "").trim())
    .map(row => [String(row.match_id), row]));
  const missing = [];
  let withAnyIndicators = 0;
  for (const fixture of fixtures) {
    const row = byId.get(String(fixture.match_id));
    if (!row) {
      missing.push({ match_id: fixture.match_id, reason: "registo Flashscore não encontrado" });
      continue;
    }
    if (Object.entries(row).some(([key, value]) =>
      !["match_id", "date_time", "country", "competition", "home_team", "away_team", "status", "source", "source_url", "retrieved_at"].includes(key) &&
      String(value ?? "").trim() !== "")) withAnyIndicators++;
  }
  return {
    fixtures: fixtures.length,
    consulted: fixtures.length - missing.length,
    complete: missing.length === 0,
    missing,
    with_any_indicators: withAnyIndicators
  };
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error("Indica o caminho do manifesto da competição.");
  const [manifest, csv] = await Promise.all([
    readFile(resolve(manifestPath), "utf8").then(JSON.parse),
    readFile("data/flashscore-statistics.csv", "utf8")
  ]);
  const result = validateSelectedCompetition({ manifest, rows: parseCsv(csv) });
  console.log("[COMPETITION COLLECTION VALIDATION] " + JSON.stringify({
    fixtures: result.fixtures, consulted: result.consulted,
    complete: result.complete, games_without_record: result.missing.length,
    games_with_any_indicators: result.with_any_indicators
  }));
  if (!result.complete) {
    for (const item of result.missing.slice(0, 5)) {
      console.error("[NOT CONSULTED] " + item.match_id + ": " + item.reason);
    }
    if (result.missing.length > 5) {
      console.error("[NOT CONSULTED] ... mais " + (result.missing.length - 5) + " jogos omitidos do log; consultar o relatório da execução.");
    }
    throw new Error("A competição continua pendente: " + result.missing.length +
      " jogos sem registo Flashscore válido (falha técnica ou consulta não concluída).");
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => { console.error("[COMPETITION VALIDATION ERROR] " + (error?.stack || error)); process.exitCode = 1; });
}
