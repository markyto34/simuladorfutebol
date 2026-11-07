"use strict";
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const enrichment=fs.readFileSync(path.join(root,"data-enrichment.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
function fail(message){console.error("VALIDAÇÃO FALHOU: "+message);process.exitCode=1;}
if(/windrawwin|WinDrawWin|WDW_|open-matchday|oladeeayo/i.test(app+"\n"+html))fail("Ainda existe dependência de uma fonte estatística antiga.");
if(/windrawwin|WinDrawWin|WDW_|open-matchday|oladeeayo/i.test(fs.readFileSync(path.join(root,"README.md"),"utf8")))fail("README ainda menciona fontes antigas.");
if(!/<script src="app\.js"(?: defer)?><\/script>/.test(html))fail("Script principal não está ligado no HTML.");
if(/config\.js|windrawwin-proxy|open-matchday/i.test(html))fail("HTML ainda carrega configuração ou fonte removida.");
const leagueSelect=html.match(/<select id="league">([\s\S]*?)<\/select>/);
if(!leagueSelect)fail("Seletor de competições não encontrado.");
else if(!/<option value="" disabled selected>A carregar competições…<\/option>/.test(leagueSelect[1]))fail("Seletor deve iniciar vazio e carregar competições Flashscore dinamicamente.");
if(!app.includes("async function populateFlashscoreCompetitions"))fail("Carregamento dinâmico de competições Flashscore não existe.");
if(!app.includes("const FLASHSCORE_STATS_CSV_URL"))fail("CSV histórico Flashscore não está configurado.");
const loaderStart=app.indexOf("async function loadHistoricalData()");
const loaderEnd=app.indexOf("\nfunction teamSample(",loaderStart);
if(loaderStart<0||loaderEnd<0)fail("Carregador histórico não encontrado.");
else{
 const loader=app.slice(loaderStart,loaderEnd);
 if(!loader.includes('if(!league.startsWith("FS|"))'))fail("Carregador não bloqueia competições fora do Flashscore.");
 if(!loader.includes("fetchSourceCSV(FLASHSCORE_STATS_CSV_URL)"))fail("Jogos não são carregados do CSV Flashscore.");
 if(!loader.includes("teamOptionsForSeason(matches)"))fail("Lista de equipas não é construída a partir dos jogos carregados.");
 if(!loader.includes('for(const id of ["homePick","awayPick"])'))fail("Os dois seletores não partilham a lista de equipas.");
 if(/open-matchday|windrawwin|oladeeayo/i.test(loader))fail("Carregador ainda consulta uma fonte antiga.");
}
const sampleStart=app.indexOf("function teamSample("),sampleEnd=app.indexOf("\nfunction mean(values)",sampleStart);
if(sampleStart<0||sampleEnd<0)fail("Função teamSample não encontrada.");
else{
 const sample=app.slice(sampleStart,sampleEnd);
 if(!sample.includes("dataState.matches.filter"))fail("Amostras não são calculadas a partir dos jogos Flashscore carregados.");
 if(!sample.includes("filter(validMetricSampleValue)"))fail("Valores ausentes não são filtrados corretamente.");
 if(!sample.includes('return limit==="all"?values:values.slice(0,requested)'))fail("Limite da amostra não é aplicado.");
 if(/secondary|wdw|open-matchday|windrawwin/i.test(sample))fail("Amostra ainda depende de uma fonte secundária.");
}
if(!app.includes("if(hasHalfTime&&poisson(hht)+poisson(aht)>=1)ht05++"))fail("Mercado Over 0,5 HT não está calculado independentemente dos golos FT.");
if(!app.includes("const escapeHtml=value=>"))fail("Escape de nomes das equipas não existe.");
if(!app.includes("escapeHtml(l)"))fail("Nomes dinâmicos não são escapados nas probabilidades 1X2.");
if(html.includes('<section class="intro" aria-hidden="true">'))fail("A introdução está escondida dos leitores de ecrã.");
const applyStart=app.indexOf("function applyTeamSelection(side)");
if(applyStart<0||!app.slice(applyStart,applyStart+1800).includes('if(!team){for(const [,id] of fields)fillInput(id,null)'))fail("Seleção vazia não limpa médias antigas.");
if(!app.includes("function teamOptionsForSeason(matches)"))fail("Seleção de equipas por época não existe.");
const statsSection=html.match(/<div class="stats-by-indicator">([\s\S]*?)<p class="source-note">/);
if(!statsSection)fail("Secção de estatísticas por indicador não encontrada.");
else{
 if(/<h5>xG<\/h5>|id="(?:hxg|axg)/.test(statsSection[1]))fail("O grupo xG deve estar removido do simulador.");
 const home=statsSection[1].indexOf('id="hgFor"'),away=statsSection[1].indexOf('id="agFor"');
 if(home<0||away<home)fail("Campos das equipas estão na ordem errada.");
 if(!statsSection[1].includes('class="stat-compare-row"')||!statsSection[1].includes('class="stat-compare-values"'))fail("Indicadores não estão organizados em linhas comparativas.");
 if(!statsSection[1].includes("<h5>Golos por parte</h5>")||!statsSection[1].includes("<h5>Cantos HT</h5>")||!statsSection[1].includes("<h5>Cantos ST</h5>"))fail("Grupos de indicadores por período estão incompletos.");
 if(!app.includes('{key:"Cantos HT"')||!app.includes('{key:"Cantos ST"'))fail("Previsões de cantos por período não estão configuradas.");
 if(!app.includes('if(!skipPairCheck&&$("homePick").value&&$("awayPick").value)simulate();'))fail("As previsões não são executadas automaticamente após selecionar as duas equipas.");
}
const pairedStart=app.indexOf("function enforcePairedTeamCoverage()"),pairedEnd=app.indexOf("\nfunction applyTeamSelection",pairedStart);
if(pairedStart<0||pairedEnd<0)fail("Validador de cobertura conjunta não encontrado.");
else if(/fillInput\s*\(/.test(app.slice(pairedStart,pairedEnd)))fail("Validação conjunta não pode apagar dados válidos.");
if(!app.includes('["Golos 1.ª parte"')||!app.includes('["Golos 2.ª parte"'))fail("Diagnóstico não inclui cobertura HT e 2.ª parte.");
if(!app.includes("const DATA_CACHE_TTL=30*60*1000;"))fail("Cache estatística não está configurada para atualização.");
if(!app.includes("deriveSecondHalfGoals")||!enrichment.includes("function deriveSecondHalfGoals"))fail("Derivação dos golos da 2.ª parte não está ligada.");
if(!process.exitCode)console.log("OK: integração exclusiva Flashscore, seletor dinâmico, amostras, cobertura e modelo HT.");
