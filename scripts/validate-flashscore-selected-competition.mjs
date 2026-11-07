#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCsv } from "./validate-flashscore-history.mjs";
import { REQUIRED_PAIRS, REQUIRED_SCORE_FIELDS } from "./backfill-flashscore-selected-indicators.mjs";

export function validateSelectedCompetition({ manifest, rows }) {
  const fixtures = Array.isArray(manifest?.fixtures) ? manifest.fixtures : [];
  if (!fixtures.length) throw new Error("Manifesto sem jogos; não pode ser marcado como concluído.");
  const byId = new Map((rows || []).map(row => [String(row.match_id), row]));
  const fields = [...REQUIRED_SCORE_FIELDS, ...REQUIRED_PAIRS.flatMap(key => [key + "_home", key + "_away"])];
  const missing = [];
  for (const fixture of fixtures) {
    const row = byId.get(String(fixture.match_id));
    const absent = !row ? fields : fields.filter(field => String(row[field] ?? "").trim() === "");
    if (absent.length) missing.push({ match_id: fixture.match_id, fields: absent });
  }
  return { fixtures: fixtures.length, complete: missing.length === 0, missing };
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error("Indica o caminho do manifesto da competição.");
  const [manifest, csv] = await Promise.all([
    readFile(resolve(manifestPath), "utf8").then(JSON.parse),
    readFile("data/flashscore-statistics.csv", "utf8")
  ]);
  const result = validateSelectedCompetition({ manifest, rows: parseCsv(csv) });
  console.log("[COMPETITION INDICATORS VALIDATION] " + JSON.stringify({
    fixtures: result.fixtures, complete: result.complete, matches_missing_indicators: result.missing.length
  }));
  if (!result.complete) {
    for (const item of result.missing.slice(0, 20)) {
      console.error("[MISSING] " + item.match_id + ": " + item.fields.join(", "));
    }
    throw new Error("A competição continua pendente: faltam indicadores selecionados em " + result.missing.length + " jogos.");
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => { console.error("[COMPETITION VALIDATION ERROR] " + (error?.stack || error)); process.exitCode = 1; });
}
