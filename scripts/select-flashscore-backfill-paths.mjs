#!/usr/bin/env node
import fs from "node:fs";
const PATH_RE = /^\/futebol\/[a-z0-9-]+\/[a-z0-9-]+\/$/;
const friendly = value => /friendly|friendlies|amig[aá]v|amistos/i.test(String(value || ""));
const pathOf = item => { try { return new URL(item.url).pathname; } catch { return ""; } };

export function selectBackfillPaths({catalog, selection, statusReport, competitionPath="", countrySlug="", resumeFromPath="", resumeAfterPath="", limit=15}) {
  if (!Array.isArray(catalog?.competitions)) throw new Error("Catálogo Flashscore inválido.");
  if (!Array.isArray(selection?.selected_paths) || !selection.selected_paths.length) throw new Error("Ainda não existem competições selecionadas.");
  for (const candidate of [competitionPath, resumeFromPath, resumeAfterPath]) {
    if (candidate && (!PATH_RE.test(candidate) || friendly(candidate))) throw new Error("Caminho inválido ou competição amigável excluída: " + candidate);
  }
  if (countrySlug && !/^[a-z0-9-]+$/.test(countrySlug)) throw new Error("Identificador de país inválido.");
  const batchLimit = Number(limit);
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 25) throw new Error("O limite por execução deve estar entre 1 e 25 competições.");
  const selected = new Set(selection.selected_paths);
  const catalogPaths = new Set(catalog.competitions.map(pathOf).filter(Boolean));
  const missing = [...selected].filter(path => !catalogPaths.has(path));
  if (missing.length) throw new Error("Há competições selecionadas que já não constam do catálogo. Primeira: " + missing[0]);
  const byPath = statusReport?.status_by_path || {};
  let candidates = [...catalogPaths].filter(path => selected.has(path) && !friendly(path) && byPath[path]?.checkpoint_completed !== true).sort();
  if (competitionPath) {
    if (!selected.has(competitionPath)) throw new Error("A competição pedida não está na seleção ativa: " + competitionPath);
    if (!catalogPaths.has(competitionPath)) throw new Error("A competição pedida não existe no catálogo atual: " + competitionPath);
    if (byPath[competitionPath]?.checkpoint_completed === true) throw new Error("Esta competição já está completa: " + competitionPath);
    candidates = [competitionPath];
  } else {
    if (countrySlug) candidates = candidates.filter(path => path.split("/")[2] === countrySlug);
    if (resumeFromPath) {
      const index = candidates.indexOf(resumeFromPath);
      if (index < 0) throw new Error("A competição indicada para retoma não está pendente no filtro atual: " + resumeFromPath);
      candidates = candidates.slice(index);
    } else if (resumeAfterPath) {
      // Cursor lexical exclusivo: não depende de índices que mudam quando o estado é atualizado.
      candidates = candidates.filter(path => path > resumeAfterPath);
    }
  }
  if (!candidates.length) throw new Error("Não existem competições pendentes para os filtros indicados.");
  const paths = candidates.slice(0, batchLimit);
  return {paths, summary: {selected: selected.size, pendingInScope: candidates.length, batch: paths.length, country: countrySlug || "todos", first: paths[0], last: paths.at(-1), morePending: candidates.length > paths.length}};
}
function main() {
  const read = path => JSON.parse(fs.readFileSync(path, "utf8"));
  const result = selectBackfillPaths({
    catalog: read("data/flashscore-competition-catalog.json"),
    selection: read("data/flashscore-competition-selection.json"),
    statusReport: read("data/flashscore-competition-status.json"),
    competitionPath: process.env.COMPETITION_PATH || "",
    countrySlug: process.env.COUNTRY_SLUG || "",
    resumeFromPath: process.env.RESUME_FROM_PATH || "",
    resumeAfterPath: process.env.RESUME_AFTER_PATH || "",
    limit: process.env.COMPETITION_LIMIT || "15"
  });
  fs.writeFileSync("/tmp/flashscore-season-paths.txt", result.paths.join("\n") + "\n");
  console.log(JSON.stringify(result.summary, null, 2));
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  try { main(); } catch (error) { console.error("[BACKFILL SELECTION ERROR] " + error.message); process.exitCode = 1; }
}
