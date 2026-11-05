#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const INPUT = process.env.FLASHSCORE_RAW_CATALOG || 'data/flashscore-competition-catalog-raw.json';
const OUTPUT = process.env.FLASHSCORE_PREPARED_CATALOG || 'data/flashscore-competition-catalog.json';
const EXCLUDED_NAVIGATION = new Set(['odds', 'futebol ontem', 'futebol amanha']);

// O texto do link lateral nem sempre corresponde ao título real da página.
const VERIFIED_NAME_OVERRIDES = new Map([
  ['qatar|primeira-liga', 'Primeira Liga'],
  ['lituania|primeira-liga', 'Primeira Liga']
]);

// A página PT lista esta competição, mas expõe o link da primeira divisão.
const VERIFIED_SUPPLEMENTAL_COMPETITIONS = [
  {
    country_name: 'Lituânia',
    country_slug: 'lituania',
    competition_name: 'Segunda Liga',
    competition_slug: 'i-lyga',
    url: 'https://www.flashscore.com/football/lithuania/i-lyga/',
    source_country_url: 'https://www.flashscore.pt/futebol/lituania/',
    source_status: 'verified_supplemental_locale_fallback',
    supplemental_source_locale: 'en'
  }
];

export function normalizeLabel(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function classify(name, country) {
  const n = normalizeLabel(name);
  const c = normalizeLabel(country);
  const female = /\b(feminina|feminino|women|ladies|senhoras)\b/.test(n);
  const age = n.match(/\b(?:u\s?\d{2}|sub\s?\d{1,2}|under\s?\d{1,2}|juniores?|youth|junior)\b/);
  const stage = /\b(playoffs?|play offs?|promocao|despromocao|relegation|promotion|fase de grupos|group stage|league phase|fase de liga|final round|championship round|abertura|encerramento|apertura|clausura|quadrangular|octogonal|hexagonal)\b/.test(n);
  const group = /\b(serie|grupo|group|north|south|east|west|norte|sul|este|oeste|nordeste|noroeste|sudeste|sudoeste)\b/.test(n);
  const friendly = /\b(amigavel|friendly)\b/.test(n);
  const cup = /\b(taca|cup|copa|pokal|coppa|coupe|knockout)\b/.test(n);
  const globalRegion = /^(mundo|europa|asia|africa|america do sul|america do norte e central|oceania)$/.test(c);
  const category = female ? 'feminino' : age ? 'formacao' : 'masculino_misto';
  const competitionType = friendly ? 'amigavel' : cup ? 'taca' : stage ? 'fase_especial' : 'liga_ou_torneio';
  return {
    gender: female ? 'feminino' : 'masculino_misto',
    age_category: age ? age[0].replace(/\s+/g, ' ') : 'senior',
    category,
    competition_type: competitionType,
    has_stage_or_playoff_marker: stage,
    has_division_or_group_marker: group,
    geographic_scope: globalRegion ? 'regional_ou_global' : 'pais_ou_regiao'
  };
}

function familyName(name) {
  return String(name).trim()
    .replace(/\s*[-–—:]\s*(?:s[eé]rie|grupo|group|division|divis[aã]o|north|south|east|west|norte|sul|este|oeste)\s+[a-z0-9]+\s*$/i, '')
    .replace(/\s*[-–—:]\s*(?:play-?offs?|promotion|relegation|fase de grupos|group stage|league phase|fase de liga|final round|championship round|abertura|encerramento|apertura|clausura|quadrangular|octogonal|hexagonal)\s*$/i, '')
    .trim() || String(name).trim();
}

export function prepareFlashscoreCatalog(raw) {
  if (!raw || !Array.isArray(raw.competitions) || !Array.isArray(raw.countries)) {
    throw new Error('O catálogo bruto não tem a estrutura esperada.');
  }
  const excluded = [];
  const candidates = [];
  for (const item of raw.competitions) {
    const key = normalizeLabel(item.competition_name);
    if (EXCLUDED_NAVIGATION.has(key)) {
      excluded.push({ country_name: item.country_name, competition_name: item.competition_name, url: item.url, reason: 'navigation_or_odds_link' });
      continue;
    }
    const overrideKey = String(item.country_slug || '').toLowerCase() + '|' + String(item.competition_slug || '').toLowerCase();
    const competitionName = VERIFIED_NAME_OVERRIDES.get(overrideKey) || item.competition_name;
    candidates.push({
      country_name: item.country_name,
      country_slug: item.country_slug,
      competition_name: competitionName,
      ...(competitionName !== item.competition_name ? {
        source_competition_name: item.competition_name,
        name_override_reason: 'official_flashscore_page_title_verified'
      } : {}),
      competition_slug: item.competition_slug,
      url: item.url,
      source_country_url: item.source_country_url,
      source_status: item.status || 'candidate_not_yet_validated',
      validation_status: 'discovered_not_yet_validated',
      competition_family_candidate: familyName(competitionName),
      ...classify(competitionName, item.country_name)
    });
  }

  for (const item of VERIFIED_SUPPLEMENTAL_COMPETITIONS) {
    const countryIsInSource = raw.countries.some(country => country.country_slug === item.country_slug)
      || raw.competitions.some(candidate => candidate.country_slug === item.country_slug);
    if (!countryIsInSource) continue;
    const exists = candidates.some(candidate =>
      candidate.country_slug === item.country_slug && candidate.competition_slug === item.competition_slug
    );
    if (exists) continue;
    candidates.push({
      ...item,
      validation_status: 'discovered_not_yet_validated',
      competition_family_candidate: familyName(item.competition_name),
      ...classify(item.competition_name, item.country_name)
    });
  }

  const duplicateGroups = new Map();
  for (const item of candidates) {
    const key = normalizeLabel(item.country_name) + '|' + normalizeLabel(item.competition_name);
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key).push(item);
  }
  const localDuplicates = [];
  for (const [key, group] of duplicateGroups) {
    if (group.length < 2) continue;
    for (const item of group) item.review_flags = [...(item.review_flags || []), 'same_country_same_name_multiple_urls'];
    localDuplicates.push({ key, country_name: group[0].country_name, competition_name: group[0].competition_name, urls: group.map(x => x.url) });
  }

  candidates.sort((a, b) => a.country_name.localeCompare(b.country_name, 'pt') || a.competition_name.localeCompare(b.competition_name, 'pt') || a.url.localeCompare(b.url));
  const countrySummary = raw.countries.map(country => ({
    country_name: country.country_name,
    country_slug: country.country_slug,
    url: country.url,
    fetch_status: country.fetch_status || 'unknown',
    competition_count_raw: country.competition_count || 0
  }));
  return {
    generated_at: new Date().toISOString(),
    catalog_discovery_version: '2.0',
    source: 'Flashscore.pt',
    source_catalog_generated_at: raw.generated_at,
    scope: 'Catálogo descoberto nas páginas públicas de futebol por país/região. As entradas são candidatas; a presença no índice não confirma histórico estatístico, odds ou disponibilidade atual.',
    summary: {
      country_pages: raw.country_page_count,
      country_pages_successful: raw.country_pages_successful,
      country_pages_failed: raw.country_pages_failed,
      raw_links: raw.competitions.length,
      excluded_navigation_or_odds_links: excluded.length,
      competition_candidates: candidates.length,
      verified_supplemental_candidates: VERIFIED_SUPPLEMENTAL_COMPETITIONS.length,
      local_duplicate_name_groups_for_review: localDuplicates.length
    },
    countries: countrySummary,
    competitions: candidates,
    excluded_links: excluded,
    local_duplicate_groups_for_review: localDuplicates
  };
}

async function main() {
  const raw = JSON.parse(await readFile(INPUT, 'utf8'));
  const report = prepareFlashscoreCatalog(raw);
  await writeFile(OUTPUT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report.summary, duplicate_groups: report.local_duplicate_groups_for_review }, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
