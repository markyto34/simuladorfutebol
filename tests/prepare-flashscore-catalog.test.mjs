import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFlashscoreCatalog } from '../scripts/prepare-flashscore-catalog.mjs';

const raw = (competitions) => ({
  generated_at: '2026-11-04T00:00:00.000Z', country_page_count: 2,
  country_pages_successful: 2, country_pages_failed: 0,
  countries: [{country_name:'Portugal',country_slug:'portugal',url:'https://www.flashscore.pt/futebol/portugal/',fetch_status:'success',competition_count:4}],
  competitions: competitions.map((name, i) => ({country_name:'Portugal',country_slug:'portugal',competition_name:name,competition_slug:'slug-'+i,url:'https://www.flashscore.pt/futebol/portugal/slug-'+i+'/',source_country_url:'https://www.flashscore.pt/futebol/portugal/',status:'candidate_not_yet_validated'}))
});

test('exclui links de navegação e odds sem os confundir com competições', () => {
  const result = prepareFlashscoreCatalog(raw(['Odds','Futebol ontem','Liga Portugal']));
  assert.equal(result.summary.raw_links, 3);
  assert.equal(result.summary.excluded_navigation_or_odds_links, 2);
  assert.equal(result.competitions.length, 1);
  assert.equal(result.competitions[0].competition_name, 'Liga Portugal');
});

test('preserva divisões, grupos e fases como entradas distintas', () => {
  const result = prepareFlashscoreCatalog(raw(['Campeonato de Portugal - Série A','Campeonato de Portugal - Série B','Campeonato de Portugal - Playoffs']));
  assert.equal(result.competitions.length, 3);
  assert.equal(result.competitions[0].validation_status, 'discovered_not_yet_validated');
});

test('identifica feminino e formação sem fundir competições', () => {
  const result = prepareFlashscoreCatalog(raw(['Liga Portugal','Liga de Futebol Feminino','Campeonato Nacional sub-19']));
  assert.equal(result.competitions.length, 3);
  assert.equal(result.competitions.find(x => x.competition_name.includes('Feminino')).gender, 'feminino');
  assert.equal(result.competitions.find(x => x.competition_name.includes('sub-19')).age_category, 'sub 19');
});

test('assinala nomes repetidos no mesmo país para revisão sem os eliminar', () => {
  const result = prepareFlashscoreCatalog(raw(['Liga Portugal','Liga Portugal']));
  assert.equal(result.competitions.length, 2);
  assert.equal(result.summary.local_duplicate_name_groups_for_review, 1);
  assert.ok(result.competitions.every(x => x.review_flags.includes('same_country_same_name_multiple_urls')));
});
