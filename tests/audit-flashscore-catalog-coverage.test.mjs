import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlashscoreCatalogCoverage } from '../scripts/audit-flashscore-catalog-coverage.mjs';

const candidate = (country, competition, extra = {}) => ({country_name:country,competition_name:competition,competition_slug:competition.toLowerCase().replace(/\s+/g,'-'),url:'https://example.test/'+competition,...extra});
const row = (country, competition, match_id, extra = {}) => ({country,competition,match_id,corners_home:'4',corners_away:'5',shots_home:'10',shots_away:'8',shots_on_target_home:'3',shots_on_target_away:'2',...extra});
const catalog = competitions => ({competitions,local_duplicate_groups_for_review:[]});

test('associa por país e competição e calcula cobertura das métricas', () => {
  const report = buildFlashscoreCatalogCoverage(catalog([candidate('Portugal','Liga Portugal')]), [row('PORTUGAL','Liga Portugal','m1'),row('PORTUGAL','Liga Portugal','m2',{corners_away:''})]);
  assert.equal(report.summary.candidates_with_stats,1);
  assert.equal(report.competitions[0].unique_stats_matches,2);
  assert.equal(report.competitions[0].metrics.corners.complete_matches,1);
  assert.equal(report.competitions[0].metrics.shots.complete_matches,2);
});

test('aplica apenas aliases confirmados para Liga Portugal e Taça da Liga', () => {
  const report = buildFlashscoreCatalogCoverage(catalog([candidate('Portugal','Liga Portugal'),candidate('Portugal','Taça da Liga')]), [row('PORTUGAL','Liga Portugal Betclic','m1'),row('PORTUGAL','League Cup','m2')]);
  assert.equal(report.competitions[0].unique_stats_matches,1);
  assert.equal(report.competitions[1].unique_stats_matches,1);
});

test('não mistura países, séries ou competições femininas', () => {
  const report = buildFlashscoreCatalogCoverage(catalog([candidate('Portugal','Série A'),candidate('Portugal','Série B'),candidate('Portugal','Liga Feminina')]), [row('PORTUGAL','Série A','m1'),row('PORTUGAL','Liga Feminina','m2'),row('Brasil','Série B','m3')]);
  assert.equal(report.competitions.find(x=>x.competition_name==='Série A').unique_stats_matches,1);
  assert.equal(report.competitions.find(x=>x.competition_name==='Série B').unique_stats_matches,0);
  assert.equal(report.competitions.find(x=>x.competition_name==='Liga Feminina').unique_stats_matches,1);
});

test('coloca candidatos com URL duplicada em revisão e não os conta como cobertura validada', () => {
  const c = candidate('Portugal','Liga Portugal');
  const report = buildFlashscoreCatalogCoverage({competitions:[c,{...c,url:'https://example.test/another'}],local_duplicate_groups_for_review:[{key:'portugal|liga portugal'}]},[row('Portugal','Liga Portugal','m1')]);
  assert.equal(report.summary.duplicate_name_candidates_for_review,2);
  assert.equal(report.summary.candidates_with_stats,0);
  assert.ok(report.competitions.every(x=>x.sample_status==='rever_nome_duplicado'));
});

test('separa estatísticas sem correspondência no catálogo e fecha a contagem dos candidatos', () => {
  const report = buildFlashscoreCatalogCoverage(catalog([candidate('Portugal','Liga Portugal'),candidate('Portugal','Liga Portugal 2')]), [row('Portugal','Liga Portugal','m1'),row('Brasil','Série B','m2')]);
  assert.equal(report.summary.stats_competitions,2);
  assert.equal(report.summary.stats_competitions_matched_to_catalog,1);
  assert.equal(report.summary.stats_competitions_not_in_catalog,1);
  assert.equal(report.unmatched_stats_competitions[0].source_labels[0],'Brasil / Série B');
  assert.equal(report.summary.catalog_candidates, report.summary.candidates_with_stats + report.summary.candidates_without_stats + report.summary.duplicate_name_candidates_for_review);
});


test('lista etiquetas estatísticas sem correspondência exata no catálogo para revisão', () => {
  const report = buildFlashscoreCatalogCoverage(
    catalog([candidate('Portugal','Liga Portugal')]),
    [row('Portugal','Liga Portugal Betclic','m1'),row('Portugal','Liga 3','m2'),row('Brasil','Série B','m3')]
  );
  assert.equal(report.summary.stats_competition_labels,3);
  assert.equal(report.summary.matched_stats_competition_labels,1);
  assert.equal(report.summary.unmatched_stats_competition_labels,2);
  assert.deepEqual(report.unmatched_stats_labels.map(x=>x.competition_name),['Série B','Liga 3']);
});


test('reconhece LaLiga como alias de LaLiga EA Sports sem alargar a outras competições', () => {
  const report = buildFlashscoreCatalogCoverage(catalog([candidate('Espanha','LaLiga EA Sports')]), [row('ESPANHA','LaLiga','laliga-1')]);
  assert.equal(report.competitions[0].unique_stats_matches,1);
  assert.equal(report.summary.unmatched_stats_competition_labels,0);
});


test('identifica a competição-base de uma fase sem misturar nem atribuir os jogos à competição-base', () => {
  const report = buildFlashscoreCatalogCoverage(
    catalog([candidate('Europa','Liga dos Campeões')]),
    [row('EUROPA','Liga dos Campeões - Fase de Liga','u1'),row('EUROPA','Liga dos Campeões - Fase de Liga','u2')]
  );
  assert.equal(report.summary.unmatched_stats_competition_labels,1);
  assert.equal(report.summary.stats_competitions_matched_to_catalog,0);
  assert.equal(report.competitions[0].unique_stats_matches,0);
  assert.equal(report.unmatched_stats_labels[0].reason,'catalog_base_found_stage_kept_separate');
  assert.equal(report.unmatched_stats_labels[0].related_catalog_competition,'Liga dos Campeões');
  assert.deepEqual(report.unmatched_stats_labels[0].stage_markers,['Fase de Liga']);
});


test('audita separadamente cobertura de cantos HT e ST', () => {
  const report = buildFlashscoreCatalogCoverage(
    catalog([candidate('Portugal','Liga Portugal')]),
    [
      row('Portugal','Liga Portugal','m1',{corners_ht_home:'2',corners_ht_away:'3',corners_st_home:'4',corners_st_away:'2'}),
      row('Portugal','Liga Portugal','m2',{corners_ht_home:'1',corners_ht_away:'1',corners_st_home:'',corners_st_away:''})
    ]
  );
  assert.equal(report.competitions[0].metrics.corners_ht.complete_matches,2);
  assert.equal(report.competitions[0].metrics.corners_ht.coverage_pct,100);
  assert.equal(report.competitions[0].metrics.corners_st.complete_matches,1);
  assert.equal(report.competitions[0].metrics.corners_st.coverage_pct,50);
});


test('resolve nomes locais de primeiras divisões apenas dentro do respetivo país', () => {
  const aliases = [
    ['Turquia','Super Liga','Superliga'],
    ['República Checa','Primeira Liga','Chance Liga'],
    ['Argélia','1 Divisao','Primeira Divisão'],
    ['Bielorrússia','Liga Vysshaya','Liga Superior'],
    ['Montenegro','Liga Prva Crnogorska','Primeira Liga'],
    ['Uzbequistão','Super Liga','Superliga'],
    ['Brasil','Pernambucano','Pernambucano - Primeiro nível'],
    ['Eslováquia','Primeira Liga','Niké liga'],
    ['Eslovénia','Liga Prva','Primeira Liga'],
    ['Albânia','Super Liga','Superliga'],
    ['Dinamarca','Super Liga','Superliga'],
    ['Geórgia','Liga Crystalbet Erovnuli','Primeira Liga'],
    ['Índia','Super Liga','Superliga'],
    ['Malásia','Super Liga','Superliga'],
    ['Nigéria','NPFL','Primeira Liga'],
    ['Emirados Árabes Unidos','Liga UAE','Primeira Liga']
  ];
  const report = buildFlashscoreCatalogCoverage(
    catalog(aliases.map(([country, name]) => candidate(country, name))),
    aliases.map(([country, , statsName], index) => row(country, statsName, 'alias-' + index))
  );
  assert.equal(report.summary.unmatched_stats_competition_labels, 0);
  assert.ok(report.competitions.every(item => item.unique_stats_matches === 1));
});


test('reconhece fases adicionais sem as fundir com a competição-base', () => {
  const cases = [
    ['China','Liga 2','Liga 2 - Grupo de Promoção'],
    ['Coreia do Sul','Liga K1','Liga K1 - Grupo de Despromoção'],
    ['Equador','Liga Pro','Liga Pro - Grupo de Colocação'],
    ['Turquia','Taça da Turquia','Taça da Turquia - Qualificação'],
    ['Rússia','Taça da Rússia','Taça da Rússia - Caminho das Regiões'],
    ['Argentina','Torneio Federal','Torneio Federal - Playoffs de Promoção'],
    ['Colômbia','Taça da Colômbia','Taça da Colômbia - Segundo nível'],
    ['Chile','Segunda Divisão','Segunda Divisão - Grupo de Promoção'],
    ['Malta','Primeira Liga','Primeira Liga - Primeira Fase - Principal'],
    ['Europa','Liga dos Campeões','Champions League - League phase']
  ];
  const report = buildFlashscoreCatalogCoverage(
    catalog(cases.map(([country, base]) => candidate(country, base))),
    cases.map(([country, , label], index) => row(country, label, 'stage-' + index))
  );
  assert.equal(report.summary.unmatched_stats_competition_labels, cases.length);
  for (const item of report.unmatched_stats_labels) {
    assert.equal(item.reason, 'catalog_base_found_stage_kept_separate', item.country_name + ' / ' + item.competition_name);
    assert.equal(item.relationship, 'same_base_competition_distinct_stage_not_merged');
  }
});


test('mede cobertura por indicador nas fases que permanecem separadas', () => {
  const report = buildFlashscoreCatalogCoverage(
    catalog([candidate('México','Liga MX')]),
    [
      row('México','Liga MX - Abertura','stage-m1',{corners_home:'4',corners_away:'3',corners_ht_home:'2',corners_ht_away:'1'}),
      row('México','Liga MX - Abertura','stage-m2',{corners_home:'6',corners_away:'2',corners_ht_home:'',corners_ht_away:''})
    ]
  );
  const stage = report.unmatched_stats_labels[0];
  assert.equal(stage.reason,'catalog_base_found_stage_kept_separate');
  assert.equal(stage.unique_stats_matches,2);
  assert.equal(stage.metrics.corners.complete_matches,2);
  assert.equal(stage.metrics.corners.coverage_pct,100);
  assert.equal(stage.metrics.corners_ht.complete_matches,1);
  assert.equal(stage.metrics.corners_ht.coverage_pct,50);
  assert.equal(stage.metrics.corners_st.complete_matches,0);
  assert.equal(report.summary.unmatched_stage_labels_kept_separate,1);
  assert.equal(report.summary.unmatched_labels_without_catalog_base,0);
});
