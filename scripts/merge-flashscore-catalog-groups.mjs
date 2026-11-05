#!/usr/bin/env node
import { readFile, writeFile, readdir } from "node:fs/promises";

const INPUT_DIR = process.env.FLASHSCORE_CATALOG_GROUP_DIR || "data/flashscore-catalog-groups";
const OUTPUT = process.env.FLASHSCORE_CATALOG_OUTPUT || "data/flashscore-competition-catalog-raw.json";

async function main() {
  const files = (await readdir(INPUT_DIR)).filter(name => /^group-\d+\.json$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!files.length) throw new Error("Não foram encontrados ficheiros dos grupos Flashscore.");
  const reports = await Promise.all(files.map(async file => JSON.parse(await readFile(`${INPUT_DIR}/${file}`, "utf8"))));
  const expected = reports[0].group_count;
  const indices = new Set(reports.map(report => report.group_index));
  if (reports.some(report => report.group_count !== expected) || indices.size !== expected || files.length !== expected) {
    throw new Error(`Grupos incompletos: recebidos ${indices.size}/${expected}.`);
  }
  const countries = reports.flatMap(report => report.countries || []);
  const unique = new Map();
  for (const item of reports.flatMap(report => report.competitions || [])) unique.set(item.url, item);
  const errors = reports.flatMap(report => report.errors || []);
  const output = {
    generated_at: new Date().toISOString(),
    source: "Flashscore.pt",
    source_index: reports[0].source_index,
    supplemental_index: reports[0].supplemental_index,
    scope: "Catálogo bruto descoberto por grupos de países/regiões. Não confirma que todas as competições têm histórico estatístico ou odds.",
    total_country_page_count: reports[0].total_country_page_count,
    group_count: expected,
    groups_completed: indices.size,
    country_page_count: countries.length,
    country_pages_successful: countries.filter(item => item.fetch_status === "success").length,
    country_pages_failed: countries.filter(item => item.fetch_status === "error").length,
    competition_candidate_count: unique.size,
    countries,
    competitions: [...unique.values()].sort((a, b) => a.country_name.localeCompare(b.country_name, "pt") || a.competition_name.localeCompare(b.competition_name, "pt")),
    errors
  };
  if (countries.length !== output.total_country_page_count) throw new Error(`Páginas de países incompletas: ${countries.length}/${output.total_country_page_count}.`);
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify({ output: OUTPUT, groups_completed: indices.size, country_pages: countries.length, successful: output.country_pages_successful, failed: output.country_pages_failed, competition_candidates: output.competition_candidate_count }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
