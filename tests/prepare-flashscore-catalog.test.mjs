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
  const result = prepareFlashscoreCatalog(raw(['Odds','Futebol ontem','Liga Portugal','Amigável Clubes']));
  assert.equal(result.summary.raw_links, 4);
  assert.equal(result.summary.excluded_navigation_or_odds_links, 2);
  assert.equal(result.summary.excluded_friendlies, 1);
  assert.equal(result.competitions.length, 1);
  assert.ok(result.excluded_links.some(item => item.reason === 'friendly_match_excluded_by_project_scope'));
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


test('classifica abertura, encerramento e quadrangulares como fases sem fundir as entradas', () => {
  const result = prepareFlashscoreCatalog(raw(['Liga Profesional - Abertura','Liga Profesional - Encerramento','Primeira A - Encerramento - Quadrangular']));
  assert.equal(result.competitions.length,3);
  assert.ok(result.competitions.every(x => x.has_stage_or_playoff_marker));
  assert.ok(result.competitions.every(x => x.competition_type === 'fase_especial'));
  assert.equal(result.competitions.find(x => x.competition_name === 'Liga Profesional - Abertura').competition_family_candidate,'Liga Profesional');
  assert.equal(result.competitions.find(x => x.competition_name === 'Liga Profesional - Encerramento').competition_family_candidate,'Liga Profesional');
});


test('corrige o nome quando o link lateral não corresponde ao título oficial da página', () => {
  const source = {
    generated_at: '2026-11-05T00:00:00.000Z',
    country_page_count: 2,
    country_pages_successful: 2,
    country_pages_failed: 0,
    countries: [
      {country_name:'Catar',country_slug:'qatar',url:'https://www.flashscore.pt/futebol/qatar/',fetch_status:'success'},
      {country_name:'Lituânia',country_slug:'lituania',url:'https://www.flashscore.pt/futebol/lituania/',fetch_status:'success'}
    ],
    competitions: [
      {country_name:'Catar',country_slug:'qatar',competition_name:'Taça',competition_slug:'primeira-liga',url:'https://www.flashscore.pt/futebol/qatar/primeira-liga/',status:'success'},
      {country_name:'Lituânia',country_slug:'lituania',competition_name:'Segunda Liga',competition_slug:'primeira-liga',url:'https://www.flashscore.pt/futebol/lituania/primeira-liga/',status:'success'}
    ]
  };
  const result = prepareFlashscoreCatalog(source);
  const overridden = result.competitions.filter(item => item.name_override_reason === 'official_flashscore_page_title_verified');
  assert.ok(overridden.every(item => item.competition_name === 'Primeira Liga'));
  assert.deepEqual(overridden.map(item => item.source_competition_name).sort(), ['Segunda Liga', 'Taça']);
  const supplemental = result.competitions.find(item => item.competition_slug === 'i-lyga');
  assert.equal(supplemental.competition_name, 'Segunda Liga');
  assert.equal(supplemental.supplemental_source_locale, 'en');
  assert.equal(supplemental.country_name, 'Lituânia');
  assert.notEqual(supplemental.url, overridden.find(item => item.country_slug === 'lituania').url);
});


test('exclui amigáveis de clubes e seleções do catálogo principal', () => {
  const result = prepareFlashscoreCatalog(raw([
    'Amigável Clubes',
    'Amigável internacional',
    'Amigável Clubes Feminino',
    'Liga Portugal'
  ]));
  assert.equal(result.summary.excluded_friendlies, 3);
  assert.deepEqual(result.competitions.map(item => item.competition_name), ['Liga Portugal']);
  assert.ok(result.excluded_links.every(item => item.reason === 'friendly_match_excluded_by_project_scope'));
});


test('normaliza escalões equivalentes e identifica formatos Kings League como especiais', () => {
  const result = prepareFlashscoreCatalog(raw([
    'Liga U20',
    'Liga Sub-20',
    'Liga Under 20',
    'Kings Liga Portugal'
  ]));
  const ages = result.competitions.filter(item => item.competition_name.startsWith('Liga ')).map(item => item.age_category);
  assert.deepEqual(ages, ['sub 20', 'sub 20', 'sub 20']);
  const kings = result.competitions.find(item => item.competition_name.startsWith('Kings'));
  assert.equal(kings.competition_type, 'formato_especial');
  assert.equal(kings.non_standard_format, true);
});
