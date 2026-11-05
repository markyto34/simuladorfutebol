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
