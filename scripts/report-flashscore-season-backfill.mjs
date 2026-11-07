#!/usr/bin/env node
/**
 * Gera um relatório pequeno e legível da cobertura real do CSV estatístico.
 * Conta apenas valores presentes para ambas as equipas; não confunde colunas
 * existentes com estatísticas efetivamente recolhidas.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./validate-flashscore-history.mjs";

const csvPath = "data/flashscore-statistics.csv";
const outputPath = "artifacts/flashscore-season-backfill-report.json";
const statFields = [
  "shots", "shots_on_target", "corners", "corners_ht", "corners_st",
  "fouls", "yellow_cards", "red_cards", "shots_off_target", "blocked_shots",
  "shots_inside_box", "shots_outside_box", "offsides", "big_chances",
  "possession", "xg"
];
const indicators = [
  { key: "score_ft", label: "Resultado final", fields: ["score_home", "score_away"] },
  { key: "score_ht", label: "Resultado ao intervalo", fields: ["ht_home", "ht_away"] },
  { key: "score_st", label: "Golos da segunda parte", fields: ["sh_home", "sh_away"] },
  ...statFields.map(key => ({ key, label: key, fields: [key + "_home", key + "_away"] }))
];
const present = (row, fields) => fields.every(field => String(row[field] ?? "").trim() !== "");
const outcome = (a, b) => Number(a) > Number(b) ? "home" : Number(a) < Number(b) ? "away" : "draw";

const csv = await readFile(csvPath, "utf8");
const rows = parseCsv(csv);
const groups = new Map();
for (const row of rows) {
  const name = [row.country || "País desconhecido", row.competition || "Competição desconhecida"].join(" | ");
  if (!groups.has(name)) groups.set(name, { competition: name, matches: 0, indicators: {}, first_half: { home_wins: 0, draws: 0, away_wins: 0, available: 0 }, second_half: { home_wins: 0, draws: 0, away_wins: 0, available: 0 } });
  const group = groups.get(name);
  group.matches++;
  for (const item of indicators) {
    const count = group.indicators[item.key] || { present: 0, missing: 0 };
    if (present(row, item.fields)) count.present++;
    else count.missing++;
    group.indicators[item.key] = count;
  }
  if (present(row, ["ht_home", "ht_away"])) {
    group.first_half.available++;
    const result = outcome(row.ht_home, row.ht_away);
    group.first_half[result === "home" ? "home_wins" : result === "away" ? "away_wins" : "draws"]++;
  }
  if (present(row, ["sh_home", "sh_away"])) {
    group.second_half.available++;
    const result = outcome(row.sh_home, row.sh_away);
    group.second_half[result === "home" ? "home_wins" : result === "away" ? "away_wins" : "draws"]++;
  }
}
const competitions = [...groups.values()].sort((a, b) => a.competition.localeCompare(b.competition));
const totals = Object.fromEntries(indicators.map(item => [item.key, { present: 0, missing: 0 }]));
for (const group of competitions) for (const item of indicators) {
  totals[item.key].present += group.indicators[item.key].present;
  totals[item.key].missing += group.indicators[item.key].missing;
}
const report = {
  report_version: 1,
  generated_at: new Date().toISOString(),
  run_id: process.env.GITHUB_RUN_ID || null,
  run_number: process.env.GITHUB_RUN_NUMBER || null,
  job_status_at_report: process.env.BACKFILL_JOB_STATUS || "unknown",
  scope: "snapshot de todo o CSV estatístico atual; não representa apenas os registos acrescentados nesta execução",
  csv_rows: rows.length,
  flashscore_consulted_records: rows.filter(row => row.source === "Flashscore" && row.match_id).length,
  records_with_ft_score: rows.filter(row => present(row, ["score_home", "score_away"])).length,
  records_with_ht_score: rows.filter(row => present(row, ["ht_home", "ht_away"])).length,
  records_with_second_half_score: rows.filter(row => present(row, ["sh_home", "sh_away"])).length,
  competitions_count: competitions.length,
  indicators: totals,
  competitions
};
await mkdir("artifacts", { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
const summary = [];
summary.push("## Relatório compacto — backfill Flashscore");
summary.push("");
summary.push(`- Execução: ${report.run_id || "—"} (${report.job_status_at_report})`);
summary.push(`- Registos estatísticos no CSV: **${report.csv_rows}**`);
summary.push(`- Consultas Flashscore guardadas: **${report.flashscore_consulted_records}**`);
summary.push(`- Resultados FT / HT / segunda parte: **${report.records_with_ft_score} / ${report.records_with_ht_score} / ${report.records_with_second_half_score}**`);
summary.push(`- Competições presentes no CSV: **${report.competitions_count}**`);
summary.push("- Âmbito: fotografia do CSV completo, não apenas dos jogos acrescentados nesta execução.");
summary.push("");
summary.push("| Indicador | Com valores | Em falta |");
summary.push("|---|---:|---:|");
for (const item of indicators) summary.push(`| ${item.label} | ${totals[item.key].present} | ${totals[item.key].missing} |`);
summary.push("");
summary.push("Detalhe por competição disponível no artefacto JSON.");
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary.join("\n") + "\n", { flag: "a" });
console.log(`[BACKFILL REPORT] ${report.csv_rows} registos; ${report.competitions_count} competições; relatório: ${outputPath}`);
