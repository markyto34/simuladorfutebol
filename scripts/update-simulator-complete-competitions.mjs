#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv, normalize } from "./audit-flashscore-odds-matches.mjs";

const INPUT = "data/flashscore-statistics.csv";
const OUTPUT = "data/simulator-complete-competitions.json";
export const CORE_METRICS = ["xg", "possession", "shots", "shots_on_target", "corners", "corners_ht", "corners_st", "yellow_cards", "fouls"];
const COUNTRY_NAMES = new Map(Object.entries({
  "africa":"África","africa do sul":"África do Sul","alemanha":"Alemanha","argelia":"Argélia","argentina":"Argentina",
  "arabia saudita":"Arábia Saudita","australia":"Austrália","austria":"Áustria","belgica":"Bélgica","bolivia":"Bolívia",
  "brasil":"Brasil","bulgaria":"Bulgária","canada":"Canadá","cazaquistao":"Cazaquistão","chile":"Chile","china":"China",
  "chipre":"Chipre","colombia":"Colômbia","coreia do sul":"Coreia do Sul","croacia":"Croácia","dinamarca":"Dinamarca",
  "egito":"Egito","emirados arabes unidos":"Emirados Árabes Unidos","escocia":"Escócia","eslovaquia":"Eslováquia",
  "eslovenia":"Eslovénia","espanha":"Espanha","estados unidos":"Estados Unidos","eua":"Estados Unidos","europa":"Europa",
  "finlandia":"Finlândia","franca":"França","grecia":"Grécia","holanda":"Países Baixos","inglaterra":"Inglaterra",
  "irlanda":"Irlanda","irlanda do norte":"Irlanda do Norte","islandia":"Islândia","israel":"Israel","italia":"Itália",
  "japao":"Japão","marrocos":"Marrocos","mexico":"México","mocambique":"Moçambique","noruega":"Noruega",
  "nova zelandia":"Nova Zelândia","paises baixos":"Países Baixos","peru":"Peru","polonia":"Polónia","portugal":"Portugal",
  "qatar":"Qatar","republica checa":"Chéquia","romenia":"Roménia","russia":"Rússia","servia":"Sérvia",
  "suecia":"Suécia","suica":"Suíça","tailandia":"Tailândia","turquia":"Turquia","ucrania":"Ucrânia",
  "uruguai":"Uruguai","venezuela":"Venezuela","vietname":"Vietname","pais de gales":"País de Gales",
  "republica da coreia":"Coreia do Sul","estonia":"Estónia","letonia":"Letónia","lituania":"Lituânia",
  "uzbequistao":"Uzbequistão","costa rica":"Costa Rica","paraguai":"Paraguai","equador":"Equador","honduras":"Honduras",
  "panama":"Panamá","jamaica":"Jamaica","nicaragua":"Nicarágua","guatemala":"Guatemala","el salvador":"El Salvador",
  "africa":"África","america do norte e central":"América do Norte e Central","america do sul":"América do Sul"
}));
const present = value => String(value ?? "").trim() !== "";
const numeric = value => present(value) && Number.isFinite(Number(String(value).replace(",", ".")));
const sourceLabel = (country, competition) => String(country).trim() + " / " + String(competition).trim();
const labelKey = value => normalize(value).replace(/\s*\/\s*/g, "/");
const pct = (complete, total) => total ? Math.round(complete / total * 10000) / 100 : 0;

export function buildCompleteCompetitions(records, previous = {}) {
  if (!Array.isArray(records) || records.length === 0) throw new Error("O CSV de estatísticas está vazio; índice anterior preservado.");
  const previousItems = Array.isArray(previous.complete_competitions) ? previous.complete_competitions : [];
  const previousByLabel = new Map();
  for (const item of previousItems) {
    for (const label of item.stats_source_labels || []) previousByLabel.set(labelKey(label), item);
  }

  const groups = new Map();
  for (const row of records) {
    const country = String(row.country || "").trim();
    const competition = String(row.competition || "").trim();
    const matchId = String(row.match_id || "").trim();
    if (!country || !competition || !matchId) continue;
    const label = sourceLabel(country, competition);
    const previousItem = previousByLabel.get(labelKey(label));
    const key = previousItem
      ? "previous:" + normalize(previousItem.country_name) + "|" + normalize(previousItem.competition_name)
      : normalize(country) + "|" + normalize(competition);
    let item = groups.get(key);
    if (!item) {
      item = { country, competition, labels: new Set(), matches: new Map() };
      groups.set(key, item);
    }
    item.labels.add(label);
    // A match ID is the identity boundary: repeated CSV rows never inflate the sample.
    if (!item.matches.has(matchId)) item.matches.set(matchId, row);
  }

  const computed = [];
  const unidentified = [];
  for (const item of groups.values()) {
    const previousItem = [...item.labels].map(label => previousByLabel.get(labelKey(label))).find(Boolean);
    const countryName = previousItem?.country_name || COUNTRY_NAMES.get(normalize(item.country));
    if (!countryName) {
      unidentified.push({ country: item.country, competition: item.competition, source_labels: [...item.labels].sort() });
      continue;
    }
    const matches = [...item.matches.values()];
    if (matches.length < 5) continue;
    const metricCoverage = {};
    let allComplete = true;
    for (const metric of CORE_METRICS) {
      const complete = matches.filter(row => numeric(row[metric + "_home"]) && numeric(row[metric + "_away"])).length;
      metricCoverage[metric] = { complete, total: matches.length, pct: pct(complete, matches.length) };
      if (complete !== matches.length) allComplete = false;
    }
    if (!allComplete) continue;
    const entry = {
      country_name: previousItem?.country_name || countryName,
      competition_name: previousItem?.competition_name || item.competition,
      stats_source_labels: [...new Set([...(previousItem?.stats_source_labels || []), ...item.labels])].sort(),
      unique_stats_matches: matches.length,
      complete_core: true,
      core_metrics: [...CORE_METRICS],
      metric_coverage: metricCoverage
    };
    computed.push(entry);
  }

  // Never remove an already-published complete competition because a partial/in-progress
  // CSV snapshot temporarily lacks rows. Refresh it when the current CSV still proves 100%.
  const resultByKey = new Map();
  for (const item of previousItems) {
    const key = normalize(item.country_name) + "|" + normalize(item.competition_name);
    resultByKey.set(key, item);
  }
  for (const item of computed) {
    const key = normalize(item.country_name) + "|" + normalize(item.competition_name);
    resultByKey.set(key, item);
  }
  const complete = [...resultByKey.values()].sort((a, b) =>
    a.country_name.localeCompare(b.country_name) || a.competition_name.localeCompare(b.competition_name)
  );
  const unchanged = JSON.stringify(complete) === JSON.stringify(previousItems);
  return {
    index: {
      generated_from: INPUT,
      generated_at: unchanged && previous.generated_at ? previous.generated_at : new Date().toISOString(),
      definition: "At least 5 unique matches and 100% paired home/away values for every core metric listed.",
      core_metrics: [...CORE_METRICS],
      complete_competitions: complete
    },
    newly_eligible: computed.filter(item => !previousItems.some(old =>
      normalize(old.country_name) === normalize(item.country_name) &&
      normalize(old.competition_name) === normalize(item.competition_name)
    )),
    unidentified
  };
}

async function main() {
  const records = parseCsv(await readFile(INPUT, "utf8"));
  let previous = {};
  try { previous = JSON.parse(await readFile(OUTPUT, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const { index, newly_eligible, unidentified } = buildCompleteCompetitions(records, previous);
  await writeFile(OUTPUT, JSON.stringify(index, null, 2) + "\n");
  console.log(JSON.stringify({
    source_rows: records.length,
    complete_competitions: index.complete_competitions.length,
    newly_eligible: newly_eligible.map(x => ({ country: x.country_name, competition: x.competition_name, unique_matches: x.unique_stats_matches })),
    unidentified_country_labels: unidentified,
    index: OUTPUT
  }, null, 2));
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
