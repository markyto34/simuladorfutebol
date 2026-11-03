"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
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
    const missing = options.filter(id => !mapped.has(id));
    const extra = [...mapped].filter(id => !options.includes(id));
    if (missing.length) fail("Competições sem slug WDW: " + missing.join(", "));
    if (extra.length) fail("Slugs WDW sem opção correspondente: " + extra.join(", "));
    if (options.length !== 65) fail("Esperadas 65 competições; encontradas " + options.length + ".");
    if (!missing.length && !extra.length) console.log("OK: " + options.length + " competições têm mapeamento WDW.");
  }
}
if (!/windrawwinProxyUrl:\s*"https:\/\//.test(config)) fail("URL HTTPS do proxy não configurado em config.js.");
if (!/<script src="config\\.js"(?: defer)?><\\/script>/.test(html) || !/<script src="app\\.js"(?: defer)?><\\/script>/.test(html)) fail("Scripts de configuração/aplicação não estão ligados no HTML ou não respeitam o carregamento diferido.");
if (!app.includes("async function loadWdwMatchPair") || !app.includes('Promise.all([loadWdwTeam("home"),loadWdwTeam("away")])')) fail("A validação conjunta das duas equipas WDW não está ativa.");
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
  if (!sample.includes("m.date!==date")) fail("Correspondência entre fontes não valida a data completa.");
  if (!sample.includes("records.push({m:{date:wdwMatchDate(w)")) fail("Jogos exclusivos WinDrawWin não são adicionados à amostra.");
  if (!sample.includes("records.sort((a,b)=>(b.m.date||\"\").localeCompare(a.m.date||\"\")")) fail("A amostra combinada não é ordenada cronologicamente.");
  if (!sample.includes("[m.hg,m.ag,hc,ac,hs,as,ht,at,hf,af].every")) fail("Filtro de completude não valida os cinco grupos obrigatórios.");
  if (!sample.includes("return limit===\"all\"?values:values.slice(0,requested)")) fail("Limite da amostra não é aplicado após combinar as fontes.");
}

if (!app.includes("if(hasHalfTime&&poisson(hht)+poisson(aht)>=1)ht05++")) fail("Mercado Over 0,5 HT não é calculado de forma independente dos golos FT.");
if (!app.includes("escapeHtml(value=>") && !app.includes("const escapeHtml=value=>")) fail("Nomes das equipas não são escapados na apresentação HTML.");

const loadStart = app.indexOf("async function loadHistoricalData()");
const loadEnd = app.indexOf("\nfunction teamSample(", loadStart);
if (loadStart < 0 || loadEnd < 0) {
  fail("Função loadHistoricalData não encontrada.");
} else {
  const loader = app.slice(loadStart, loadEnd);
  if (!loader.includes("const isComplete=m=>[m.hg,m.ag,m.hc,m.ac,m.homeShots,m.awayShots,m.homeTarget,m.awayTarget,m.homeFouls,m.awayFouls].every")) fail("A validação dos dez campos obrigatórios não está ativa.");
  if (!loader.includes("teamOptionsForSeason(matches,completeMatches,allowWdw)")) fail("A seleção de equipas não distingue época atual de épocas históricas.");
  if (!loader.includes('for(const id of ["homePick","awayPick"])')) fail("Os dois seletores não partilham a lista validada de equipas.");
  if (!loader.includes("completeMatches.length")) fail("O estado de carregamento não informa quantos jogos estão completos.");
}
const applyStart = app.indexOf("function applyTeamSelection(side)");
const applyEnd = app.indexOf("\\n", app.indexOf("}", applyStart) + 1);
if (applyStart < 0 || !app.slice(applyStart, applyStart + 1800).includes('if(!team){for(const [,id] of fields)fillInput(id,null)')) fail("A seleção vazia não limpa médias antigas.");

if (!app.includes("function teamOptionsForSeason(matches,completeMatches,allowWdw)")) fail("Função de seleção de equipas por época não existe.");
if (!process.exitCode) console.log("OK: configuração, proxy, scripts, integração, completude dos jogos, modelo HT e validação das equipas.");
