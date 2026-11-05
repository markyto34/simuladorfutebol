#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && next === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(value => value !== '')) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(value => value.trim());
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

const STATS_FILE = process.env.FLASHSCORE_STATS_FILE || 'data/flashscore-statistics.csv';
const CATALOG_FILE = process.env.FLASHSCORE_CATALOG_FILE || 'data/flashscore-competition-catalog.json';
const OUTPUT = process.env.FLASHSCORE_CATALOG_COVERAGE || 'data/flashscore-competition-coverage.json';
const METRICS = ['corners', 'corners_ht', 'corners_st', 'shots', 'shots_on_target', 'xg', 'fouls', 'yellow_cards', 'red_cards'];

const COUNTRY_ALIASES = new Map([['europe', 'europa']]);
const COMPETITION_ALIASES = new Map([
  ['portugal|liga portugal betclic', 'liga portugal'],
  ['portugal|league cup', 'taca da liga'],
  ['portugal|taca da liga', 'taca da liga'],
  ['europa|champions league league phase', 'liga dos campeoes fase de liga'],
  ['europa|liga dos campeoes fase de liga', 'liga dos campeoes fase de liga'],
  ['espanha|laliga', 'laliga ea sports'],
  // Traduções/nomes locais confirmados para a mesma primeira divisão; país sempre faz parte da chave.
  ['turquia|superliga', 'super liga'],
  ['republica checa|chance liga', 'primeira liga'],
  ['argelia|primeira divisao', '1 divisao'],
  ['bielorrussia|liga superior', 'liga vysshaya'],
  ['montenegro|primeira liga', 'liga prva crnogorska'],
  ['uzbequistao|superliga', 'super liga'],
  ['brasil|pernambucano primeiro nivel', 'pernambucano'],
  ['eslovaquia|nike liga', 'primeira liga'],
  ['eslovenia|primeira liga', 'liga prva'],
  ['albania|superliga', 'super liga'],
  ['dinamarca|superliga', 'super liga'],
  ['georgia|primeira liga', 'liga crystalbet erovnuli'],
  ['india|superliga', 'super liga'],
  ['malasia|superliga', 'super liga'],
  ['nigeria|primeira liga', 'npfl'],
  ['emirados arabes unidos|primeira liga', 'liga uae']
]);

function countryKey(value) { return COUNTRY_ALIASES.get(normalize(value)) || normalize(value); }
function competitionKey(country, value) {
  const c = countryKey(country), label = normalize(value);
  return COMPETITION_ALIASES.get(c + '|' + label) || label;
}
function key(country, competition) { return countryKey(country) + '|' + competitionKey(country, competition); }

export function buildFlashscoreCatalogCoverage(catalog, statsRows) {
  if (!catalog || !Array.isArray(catalog.competitions) || !Array.isArray(statsRows)) {
    throw new Error('Catálogo ou registos estatísticos inválidos.');
  }
  const stats = new Map();
  for (const row of statsRows) {
    const country = String(row.country || '').trim();
    const competition = String(row.competition || '').trim();
    if (!country || !competition) continue;
    const k = key(country, competition);
    let item = stats.get(k);
    if (!item) {
      item = { ids: new Set(), rows: 0, labels: new Set(), metricIds: Object.fromEntries(METRICS.map(m => [m, new Set()])) };
      stats.set(k, item);
    }
    item.rows++;
    item.labels.add(country + ' / ' + competition);
    if (row.match_id) item.ids.add(String(row.match_id));
    const rowId = String(row.match_id || 'row-' + item.rows);
    for (const metric of METRICS) {
      if (String(row[metric + '_home'] ?? '').trim() !== '' && String(row[metric + '_away'] ?? '').trim() !== '') item.metricIds[metric].add(rowId);
    }
  }

  const catalogKeys = new Set(catalog.competitions.map(candidate => key(candidate.country_name, candidate.competition_name)));
  const rawStatsLabels = new Map();
  for (const row of statsRows) {
    const country = String(row.country || '').trim();
    const competition = String(row.competition || '').trim();
    if (!country || !competition) continue;
    const labelKey = normalize(country) + '|' + normalize(competition);
    let label = rawStatsLabels.get(labelKey);
    if (!label) {
      label = { country_name: country, competition_name: competition, stats_match_key: key(country, competition), ids: new Set(), rows: 0 };
      rawStatsLabels.set(labelKey, label);
    }
    label.rows++;
    if (row.match_id) label.ids.add(String(row.match_id));
  }
  const stageSuffix = /\s*(?:-\s*)?(fase de liga|playoffs?|abertura|encerramento|apertura|clausura|quadrangular|octogonal|hexagonal|grupo campeonato|grupo rebaixamento)\s*$/i;
  function findStageRelatedCandidate(label) {
    let base = label.competition_name;
    const stages = [];
    while (stageSuffix.test(base)) {
      const match = base.match(stageSuffix);
      stages.unshift(match[1]);
      base = base.replace(stageSuffix, '').trim().replace(/[-–—\s]+$/, '').trim();
    }
    if (!stages.length || !base) return null;
    const matches = catalog.competitions.filter(candidate =>
      countryKey(candidate.country_name) === countryKey(label.country_name) &&
      normalize(candidate.competition_name) === normalize(base)
    );
    if (matches.length !== 1) return null;
    return {
      relationship: 'same_base_competition_distinct_stage_not_merged',
      stage_markers: stages,
      related_catalog_competition: matches[0].competition_name,
      related_catalog_url: matches[0].url
    };
  }
  const unmatchedStatsLabels = [...rawStatsLabels.values()]
    .filter(label => !catalogKeys.has(label.stats_match_key))
    .map(label => {
      const stageRelation = findStageRelatedCandidate(label);
      return {
        country_name: label.country_name,
        competition_name: label.competition_name,
        unique_stats_matches: label.ids.size || label.rows,
        stats_rows: label.rows,
        reason: stageRelation ? 'catalog_base_found_stage_kept_separate' : 'no_exact_catalog_match_review_alias_or_missing_competition',
        ...(stageRelation || {})
      };
    })
    .sort((a, b) => b.unique_stats_matches - a.unique_stats_matches || a.country_name.localeCompare(b.country_name) || a.competition_name.localeCompare(b.competition_name));
  const matchedStatsLabelCount = rawStatsLabels.size - unmatchedStatsLabels.length;

  const duplicateKeys = new Set((catalog.local_duplicate_groups_for_review || []).map(x => x.key));
  const matchedStatsKeys = new Set();
  const competitions = catalog.competitions.map(candidate => {
    const candidateKey = key(candidate.country_name, candidate.competition_name);
    const found = stats.get(candidateKey);
    if (found) matchedStatsKeys.add(candidateKey);
    const games = found ? (found.ids.size || found.rows) : 0;
    const sampleStatus = games >= 20 ? 'amostra_20_plus' : games >= 10 ? 'amostra_10_19' : games >= 5 ? 'amostra_5_9' : games >= 1 ? 'amostra_1_4' : 'sem_dados';
    const metrics = Object.fromEntries(METRICS.map(metric => [metric, {
      complete_matches: found?.metricIds[metric].size || 0,
      coverage_pct: games ? Math.round((found?.metricIds[metric].size || 0) / games * 1000) / 10 : 0
    }]));
    const duplicate = duplicateKeys.has(normalize(candidate.country_name) + '|' + normalize(candidate.competition_name));
    return {
      ...candidate,
      stats_match_key: candidateKey,
      stats_source_labels: found ? [...found.labels].sort() : [],
      unique_stats_matches: games,
      stats_rows: found?.rows || 0,
      sample_status: duplicate ? 'rever_nome_duplicado' : sampleStatus,
      metrics
    };
  });
  const count = status => competitions.filter(x => x.sample_status === status).length;
  const unmatchedStatsCompetitions = [...stats.entries()].filter(([k]) => !matchedStatsKeys.has(k)).map(([k, item]) => ({
    stats_match_key: k,
    source_labels: [...item.labels].sort(),
    unique_stats_matches: item.ids.size || item.rows,
    metrics: Object.fromEntries(METRICS.map(metric => [metric, {
      complete_matches: item.metricIds[metric].size,
      coverage_pct: (item.ids.size || item.rows) ? Math.round(item.metricIds[metric].size / (item.ids.size || item.rows) * 1000) / 10 : 0
    }]))
  })).sort((a, b) => b.unique_stats_matches - a.unique_stats_matches);
  const withData = competitions.filter(x => x.unique_stats_matches > 0 && x.sample_status !== 'rever_nome_duplicado').length;
  return {
    generated_at: new Date().toISOString(),
    source: 'Flashscore catalog + data/flashscore-statistics.csv',
    scope: 'Correspondência por país e competição com normalização e apenas aliases explicitamente confirmados. Nomes repetidos no mesmo país ficam em revisão e não são considerados cobertura validada.',
    summary: {
      catalog_candidates: competitions.length,
      candidates_with_stats: withData,
      candidates_without_stats: competitions.filter(x => x.unique_stats_matches === 0 && x.sample_status !== 'rever_nome_duplicado').length,
      candidates_1_to_4_matches: competitions.filter(x => x.unique_stats_matches >= 1 && x.unique_stats_matches <= 4 && x.sample_status !== 'rever_nome_duplicado').length,
      candidates_5_plus_matches: competitions.filter(x => x.unique_stats_matches >= 5 && x.sample_status !== 'rever_nome_duplicado').length,
      candidates_10_plus_matches: competitions.filter(x => x.unique_stats_matches >= 10 && x.sample_status !== 'rever_nome_duplicado').length,
      candidates_20_plus_matches: competitions.filter(x => x.unique_stats_matches >= 20 && x.sample_status !== 'rever_nome_duplicado').length,
      duplicate_name_candidates_for_review: count('rever_nome_duplicado'),
      stats_competitions: stats.size,
      stats_competitions_matched_to_catalog: matchedStatsKeys.size,
      stats_competitions_not_in_catalog: unmatchedStatsCompetitions.length,
      stats_rows: statsRows.length,
      stats_unique_match_ids: new Set(statsRows.map(x => String(x.match_id || '').trim()).filter(Boolean)).size,
      stats_competition_labels: rawStatsLabels.size,
      matched_stats_competition_labels: matchedStatsLabelCount,
      unmatched_stats_competition_labels: unmatchedStatsLabels.length
    },
    unmatched_stats_labels: unmatchedStatsLabels,
    competitions: competitions.sort((a, b) => b.unique_stats_matches - a.unique_stats_matches || a.country_name.localeCompare(b.country_name) || a.competition_name.localeCompare(b.competition_name)),
    unmatched_stats_competitions: unmatchedStatsCompetitions
  };
}

async function main() {
  const [catalog, csv] = await Promise.all([readFile(CATALOG_FILE, 'utf8'), readFile(STATS_FILE, 'utf8')]);
  const report = buildFlashscoreCatalogCoverage(JSON.parse(catalog), parseCsv(csv));
  await writeFile(OUTPUT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(JSON.stringify(report.competitions.filter(x => x.unique_stats_matches >= 5).slice(0, 20).map(x => ({country:x.country_name,competition:x.competition_name,matches:x.unique_stats_matches,status:x.sample_status,corners:x.metrics.corners,shots:x.metrics.shots,shots_on_target:x.metrics.shots_on_target,xg:x.metrics.xg})), null, 2));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
