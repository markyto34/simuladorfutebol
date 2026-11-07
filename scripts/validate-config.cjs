"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const enrichment = fs.readFileSync(path.join(root, "data-enrichment.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const config = fs.readFileSync(path.join(root, "config.js"), "utf8");
const proxy = fs.readFileSync(path.join(root, "windrawwin-proxy/src/index.js"), "utf8");

function fail(message) { console.error("VALIDAÇÃO FALHOU: " + message); process.exitCode = 1; }
const mapStart = app.indexOf("const WDW_LEAGUES={");
const mapEnd = app.indexOf("const WDW_ALIASES=", mapStart);
if (mapStart < 0 || mapEnd < 0) {
  fail("Não foi possível localizar o mapa WDW_LEAGUES.");
} else {
  const mapText = app.slice(mapStart, mapEnd);
  const mapped = new Set([...mapText.matchAll(/"([^"]+)"\s*:/g)].map(m => m[1]));
  const leagueSelect = html.match(/<select id="league">([\s\S]*?)<\/select>/);
  if (!leagueSelect) fail("Seletor de competições não encontrado.");
  else {
    const options = [...leagueSelect[1].matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
    if (options.length === 0) {
      if (!/<option value="" disabled selected>A carregar competições…<\/option>/.test(leagueSelect[1])) {
        fail("O seletor deve iniciar vazio e carregar as competições dinamicamente.");
      } else {
        console.log("OK: seletor sem lista estática; as competições são carregadas dinamicamente.");
      }
    } else {
      const missing = options.filter(id => !mapped.has(id));
      const extra = [...mapped].filter(id => !options.includes(id));
      if (missing.length) fail("Competições sem slug WDW: " + missing.join(", "));
      if (extra.length) fail("Slugs WDW sem opção correspondente: " + extra.join(", "));
      if (options.length !== 65) fail("Esperadas 65 competições; encontradas " + options.length + ".");
      if (!missing.length && !extra.length) console.log("OK: " + options.length + " competições têm mapeamento WDW.");
    }
  }
}
if (!/windrawwinProxyUrl:\s*"https:\/\//.test(config)) fail("URL HTTPS do proxy não configurado em config.js.");
if (!/<script src="config\.js"(?: defer)?><\/script>/.test(html) || !/<script src="app\.js"(?: defer)?><\/script>/.test(html)) fail("Scripts de configuração/aplicação não estão ligados no HTML ou não respeitam o carregamento diferido.");
if (!app.includes("async function loadWdwMatchPair") || !app.includes('Promise.all([loadWdwTeam("home",home,league,requestId),loadWdwTeam("away",away,league,requestId)])')) fail("A validação conjunta das duas equipas WDW não está ativa.");
if (!app.includes('loadWdwMatchPair();')) fail("Os seletores de equipas não acionam a validação conjunta WDW.");
if (!proxy.includes('https://simuladorfutebol.onrender.com')) fail("Origem do site não autorizada no proxy.");
if (!proxy.includes('incoming.pathname === "/health"')) fail("Endpoint /health do proxy não existe.");
if (!proxy.includes("function safePath")) fail("Validação de caminhos do proxy não existe.");

const sampleStart = app.indexOf("function teamSample(");
const sampleEnd = app.indexOf("\nfunction mean(values)", sampleStart);
if (sampleStart < 0 || sampleEnd < 0) {
  fail("Função teamSample não encontrada.");
} else {
  const sample = app.slice(sampleStart, sampleEnd);
  if (!sample.includes("const allowWdw=season===currentSeasonId")) fail("WinDrawWin deve ser usado apenas na época atual.");
  if (!sample.includes("const wdwMatchDate=w=>")) fail("Data WinDrawWin não é convertida para o ano correto da época.");
  if (!app.includes("const WDW_CALENDAR_YEAR_LEAGUES=new Set(")) fail("Ligas com época de ano civil não têm tratamento de datas próprio.");
  if (!sample.includes("WDW_CALENDAR_YEAR_LEAGUES.has(league)")) fail("Conversão de datas não considera o calendário da competição.");
  const identityStart = app.indexOf("function sameFixtureIdentity(");
  const identityEnd = app.indexOf("\nfunction teamSample(", identityStart);
  const identity = identityStart >= 0 && identityEnd > identityStart ? app.slice(identityStart, identityEnd) : "";
  if (!identity.includes("primary.date!==date")) fail("Correspondência entre fontes não valida a data completa.");
  if (!sample.includes("sameFixtureIdentity(m,w,date)&&m.hg===w.hg&&m.ag===w.ag")) fail("A importação de estatísticas WDW não valida o resultado FT.");
  if (sample.includes("records.push({m:{date:wdwMatchDate(w)")) fail("Jogos exclusivos WinDrawWin não podem ser adicionados à amostra da competição.");
  if (!sample.includes("const records=primary.map(m=>({m,w:matching(m),h:m.home===team,wdwOnly:false}))")) fail("A amostra deve partir exclusivamente dos jogos da competição selecionada.");
  if (!app.includes("const scopedMatches=matches.filter(w=>")) fail("Os resultados WinDrawWin não estão limitados aos jogos da competição selecionada.");
  if (!app.includes("return dataState.matches.some(m=>")) fail("A validação WDW não confirma os jogos na lista da competição selecionada.");
  if (!sample.includes("records.sort((a,b)=>(b.m.date||\"\").localeCompare(a.m.date||\"\")")) fail("A amostra combinada não é ordenada cronologicamente.");
  if (!sample.includes("[m.hg,m.ag,hc,ac,hs,as,ht,at,hf,af].every")) fail("Filtro de completude não valida os cinco grupos obrigatórios.");
  if (!sample.includes("return limit===\"all\"?values:values.slice(0,requested)")) fail("Limite da amostra não é aplicado após combinar as fontes.");
}

if (!app.includes("if(hasHalfTime&&poisson(hht)+poisson(aht)>=1)ht05++")) fail("Mercado Over 0,5 HT não é calculado de forma independente dos golos FT.");
if (!app.includes("escapeHtml(value=>") && !app.includes("const escapeHtml=value=>")) fail("Nomes das equipas não são escapados na apresentação HTML.");
if (!app.includes("escapeHtml(l)")) fail("Os nomes dinâmicos das equipas não são escapados no HTML das probabilidades 1X2.");
if (html.includes('<section class="intro" aria-hidden="true">')) fail("A introdução do simulador está escondida dos leitores de ecrã.");

const loadStart = app.indexOf("async function loadHistoricalData()");
const loadEnd = app.indexOf("\nfunction teamSample(", loadStart);
if (loadStart < 0 || loadEnd < 0) {
  fail("Função loadHistoricalData não encontrada.");
} else {
  const loader = app.slice(loadStart, loadEnd);
  if (!loader.includes("const isComplete=m=>[m.hg,m.ag,m.hc,m.ac,m.homeShots,m.awayShots,m.homeTarget,m.awayTarget,m.homeFouls,m.awayFouls].every")) fail("A validação dos dez campos obrigatórios não está ativa.");
  if (!loader.includes("teamOptionsForSeason(matches)")) fail("A seleção de equipas não inclui as equipas da época carregada.");
  if (!loader.includes('for(const id of ["homePick","awayPick"])')) fail("Os dois seletores não partilham a lista validada de equipas.");
  if (/jogos com dados|jogos completos|completeMatches\\.length/i.test(loader) || app.includes("recolha pendente")) fail("A interface não deve expor contagens de jogos com dados nem avisos de recolha pendente.");
  if (/Flashscore/i.test(html)) fail("A interface principal não deve destacar a fonte estatística.");
}
const applyStart = app.indexOf("function applyTeamSelection(side)");
const applyEnd = app.indexOf("\\n", app.indexOf("}", applyStart) + 1);
if (applyStart < 0 || !app.slice(applyStart, applyStart + 1800).includes('if(!team){for(const [,id] of fields)fillInput(id,null)')) fail("A seleção vazia não limpa médias antigas.");

if (!app.includes("function teamOptionsForSeason(matches)")) fail("Função de seleção de equipas por época não existe.");
const statsSection = html.match(/<div class="all-stats-columns">([\s\S]*?)<p class="source-note">/);
if (!statsSection) fail("Secção de estatísticas das equipas não encontrada.");
else {
  if ((html.match(/id="axgFor"/g) || []).length !== 1 || (html.match(/id="axgAgainst"/g) || []).length !== 1) fail("Os campos xG da equipa visitante devem existir uma única vez.");
  const homeStart = statsSection[1].indexOf("<h4>CASA</h4>");
  const awayStart = statsSection[1].indexOf("<h4>FORA</h4>");
  const xgAt = statsSection[1].indexOf('id="axgFor"');
  if (homeStart < 0 || awayStart < 0 || xgAt < awayStart) fail("Os campos xG da equipa visitante estão na coluna errada.");
}
const pairedStart = app.indexOf("function enforcePairedTeamCoverage()");
const pairedEnd = app.indexOf("\nfunction applyTeamSelection", pairedStart);
if (pairedStart < 0 || pairedEnd < 0) fail("Validador de cobertura conjunta não encontrado.");
else if (/fillInput\s*\(/.test(app.slice(pairedStart, pairedEnd))) fail("A validação conjunta não pode apagar dados válidos de uma equipa quando a outra não tem cobertura.");
if (!app.includes('["Golos 1.ª parte"') || !app.includes('["Golos 2.ª parte"')) fail("A cobertura HT e 2.ª parte não está incluída no diagnóstico da competição.");
if (!app.includes("const DATA_CACHE_TTL=30*60*1000;")) fail("A cache estatística não foi reduzida para permitir atualização de fontes.");
if (!app.includes("deriveSecondHalfGoals") || !enrichment.includes("function deriveSecondHalfGoals")) fail("A derivação dos golos da 2.ª parte a partir de FT-HT não está ligada.");
if (!process.exitCode) console.log("OK: configuração, proxy, scripts, integração, completude dos jogos, modelo HT e validação das equipas.");
