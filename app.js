(()=>{"use strict";
const $=id=>document.getElementById(id),N=10000;
let random=Math.random;
const MetricCoverage=window.MetricCoverage;
const MIN_METRIC_SAMPLE=MetricCoverage.MIN_METRIC_SAMPLE,MIN_XG_SAMPLE=MetricCoverage.MIN_XG_SAMPLE;
const hashSeed=value=>{let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return hash>>>0;};
const seededRandom=initial=>{let seed=initial>>>0;return ()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};};
const num=id=>{const raw=$(id).value.trim();if(raw==="")throw Error("Faltam médias obrigatórias. Carrega os dados históricos e confirma se golos e cantos têm valores para as duas equipas.");const v=Number(raw);if(!Number.isFinite(v)||v<0)throw Error("Confirma os valores numéricos: não podem ser negativos ou vazios.");return v};
const poisson=lambda=>{const limit=Math.exp(-lambda);let k=0,p=1;do{k++;p*=random()}while(p>limit);return k-1};
const gamma=(shape,scale)=>{if(shape<1){return gamma(shape+1,scale)*Math.pow(random(),1/shape)}const d=shape-1/3,c=1/Math.sqrt(9*d);for(;;){let x,v;do{x=normal();v=1+c*x}while(v<=0);v=v*v*v;const u=random();if(u<1-.0331*x*x*x*x||Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return d*v*scale}};
const normal=()=>{let u=0,v=0;while(!u)u=random();while(!v)v=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
const negBin=(mean,disp)=>{if(mean<=0)return 0;const shape=Math.max(.25,1/disp);return poisson(gamma(shape,mean/shape))};
const pct=x=>(100*x/N).toFixed(1)+"%";
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
function line(label,p){return '<div class="line-item"><span>'+label+'</span><b>'+pct(p)+'</b></div>'}
function simulate(){
 try{
  const h=$("homeName").value.trim()||"Casa",a=$("awayName").value.trim()||"Fora",disp=.45;
  const read=id=>{const raw=$(id).value.trim();if(raw==="")return null;const v=Number(raw);if(!Number.isFinite(v)||v<0)throw Error("Confirma os valores numéricos: não podem ser negativos.");return v;};
  const goalValues=["hgFor","agAgainst","agFor","hgAgainst"].map(read);
  const hasGoalHistory=goalValues.every(v=>v!==null);
  const xgValues=["hxgFor","axgAgainst","axgFor","hxgAgainst"].map(read);
  const hasXg=xgValues.every(v=>v!==null);
  const xgHome=hasXg?(xgValues[0]+xgValues[1])/2:null;
  const xgAway=hasXg?(xgValues[2]+xgValues[3])/2:null;
  const hasGoals=hasGoalHistory;
  const htValues=["hhtFor","ahtAgainst","ahtFor","hhtAgainst"].map(read);
  const hasHalfTime=htValues.every(v=>v!==null);
  const hht=hasHalfTime?(htValues[0]+htValues[1])/2:null;
  const aht=hasHalfTime?(htValues[2]+htValues[3])/2:null;
  const secondHalfValues=["hshFor","ashAgainst","ashFor","hshAgainst"].map(read);
  const hasSecondHalf=secondHalfValues.every(v=>v!==null);
  const hsh=hasSecondHalf?(secondHalfValues[0]+secondHalfValues[1])/2:null;
  const ash=hasSecondHalf?(secondHalfValues[2]+secondHalfValues[3])/2:null;
  const cornerValues=["hcFor","acAgainst","acFor","hcAgainst"].map(read);
  const hasCorners=cornerValues.every(v=>v!==null);
  let hg=hasGoalHistory?(goalValues[0]+goalValues[1])/2:xgHome;
  let ag=hasGoalHistory?(goalValues[2]+goalValues[3])/2:xgAway;
  if(hasGoalHistory&&hasXg){hg=hg*.65+xgHome*.35;ag=ag*.65+xgAway*.35;}
  const hc=hasCorners?(cornerValues[0]+cornerValues[1])/2:null;
  const ac=hasCorners?(cornerValues[2]+cornerValues[3])/2:null;
  if([hg,ag,hc,ac].some(x=>x!==null&&x>30))throw Error("Os dados históricos apresentam uma média fora do intervalo esperado.");
  const extraSpecs=[
   {key:"Remates",ids:["hshotsFor","hshotsAgainst","ashotsFor","ashotsAgainst"],thresholds:[19.5,21.5,23.5],dispersion:.22},
   {key:"Remates à baliza",ids:["htargetFor","htargetAgainst","atargetFor","atargetAgainst"],thresholds:[5.5,7.5,9.5],dispersion:.28},
   {key:"Faltas",ids:["hfoulsFor","hfoulsAgainst","afoulsFor","afoulsAgainst"],thresholds:[19.5,21.5,23.5],dispersion:.22},
   {key:"Cartões amarelos",ids:["hyellowFor","hyellowAgainst","ayellowFor","ayellowAgainst"],thresholds:[2.5,3.5,4.5],dispersion:.45},
   {key:"Cartões vermelhos",ids:["hredFor","hredAgainst","aredFor","aredAgainst"],thresholds:[.5,1.5],dispersion:.7}
  ];
  const extraValues=extraSpecs.map(spec=>({spec,values:spec.ids.map(read)})).filter(x=>x.values.every(v=>v!==null));
  if(!hasGoals&&!hasHalfTime&&!hasSecondHalf&&!hasCorners&&!extraValues.length)throw Error("Não existem dados suficientes para simular. São necessárias amostras completas para as duas equipas em pelo menos um indicador.");
  let home=0,draw=0,away=0,g15=0,g25=0,g35=0,c85=0,c95=0,c105=0,ht05=0,sh05=0,sh15=0,shBtts=0,btts=0,sumG=0,sumC=0,sumHG=0,sumAG=0,scoreMap={};
  const seedInput=[h,a,...Array.from(document.querySelectorAll("input")).map(input=>input.id+"="+input.value)].join("|");
  random=seededRandom(hashSeed(seedInput));
  for(let i=0;i<N;i++){
   if(hasGoals){const x=poisson(hg),y=poisson(ag),gt=x+y;sumG+=gt;sumHG+=x;sumAG+=y;if(x>y)home++;else if(x===y)draw++;else away++;if(x>0&&y>0)btts++;if(gt>=2)g15++;if(gt>=3)g25++;if(gt>=4)g35++;const key=x+"-"+y;scoreMap[key]=(scoreMap[key]||0)+1;}
   if(hasHalfTime&&poisson(hht)+poisson(aht)>=1)ht05++;
   if(hasSecondHalf){const shHome=poisson(hsh),shAway=poisson(ash),total=shHome+shAway;if(total>=1)sh05++;if(total>=2)sh15++;if(shHome>0&&shAway>0)shBtts++;}
   if(hasCorners){const c=negBin(hc,disp),d=negBin(ac,disp),ct=c+d;sumC+=ct;if(ct>=9)c85++;if(ct>=10)c95++;if(ct>=11)c105++;}
  }
  const noData='<p class="model-note">Sem dados suficientes nesta competição/amostra. O indicador não será estimado.</p>';
  const pct=x=>(100*x/N).toFixed(1)+"%";
  const modal=hasGoals?Object.entries(scoreMap).sort((x,y)=>y[1]-x[1])[0][0]:"Sem dados";
  $("outcomes").innerHTML=hasGoals?[[ "Vitória "+h,home],["Empate",draw],["Vitória "+a,away]].map(([l,p])=>'<div class="bar-row"><div class="bar-label"><span>'+escapeHtml(l)+'</span><b>'+pct(p)+'</b></div><div class="bar-track"><div class="bar-fill" style="width:'+100*p/N+'%"></div></div></div>').join(""):noData;
  $("meanScore").textContent=hasGoals?(sumHG/N).toFixed(2)+" – "+(sumAG/N).toFixed(2):"Sem dados";
  $("modalScore").textContent=modal;
  $("meanGoals").textContent=hasGoals?(sumG/N).toFixed(2):"—";
  $("meanCorners").textContent=hasCorners?(sumC/N).toFixed(2):"—";
  $("goalMarkets").innerHTML=[hasGoals?[line("Mais de 1.5 golos",g15),line("Mais de 2.5 golos",g25),line("Mais de 3.5 golos",g35),line("Ambas marcam — Sim",btts)].join(""):noData,hasHalfTime?line("Over 0,5 golos HT",ht05):'<div class="line-item"><span>Over 0,5 golos HT</span><b>Sem dados</b></div>',hasSecondHalf?[line("Over 0,5 golos 2.ª parte",sh05),line("Over 1,5 golos 2.ª parte",sh15),line("Ambas marcam 2.ª parte",shBtts)].join(""):'<div class="line-item"><span>Golos 2.ª parte</span><b>Sem dados</b></div>'].join("");
  $("cornerMarkets").innerHTML=hasCorners?[line("Mais de 8.5 cantos",c85),line("Mais de 9.5 cantos",c95),line("Mais de 10.5 cantos",c105)].join(""):noData;
  const extraHtml=[];
  for(const item of extraValues){
   const spec=item.spec,values=item.values,homeMean=(values[0]+values[3])/2,awayMean=(values[2]+values[1])/2;
   let hits=spec.thresholds.map(()=>0),sum=0;
   for(let j=0;j<N;j++){const total=negBin(homeMean,spec.dispersion)+negBin(awayMean,spec.dispersion);sum+=total;spec.thresholds.forEach((t,k)=>{if(total>t)hits[k]++;});}
   extraHtml.push('<article class="card extra-result"><small>'+spec.key.toUpperCase()+'</small><div class="big">'+(sum/N).toFixed(2)+'</div><p>média total esperada · casa '+homeMean.toFixed(2)+' / fora '+awayMean.toFixed(2)+'</p>'+spec.thresholds.map((t,k)=>line("Mais de "+t.toFixed(1),hits[k])).join("")+'</article>');
  }
  random=Math.random;
  $("extraMarkets").innerHTML=extraHtml.length?extraHtml.join(""):'<p class="model-note">Sem cobertura suficiente para prever remates, faltas ou cartões. Os indicadores adicionais só são simulados quando a fonte contém as quatro médias necessárias.</p>';
  $("summary").textContent=[hasGoals?"Expectativa de "+(sumG/N).toFixed(2)+" golos ("+h+": "+(sumHG/N).toFixed(2)+"; "+a+": "+(sumAG/N).toFixed(2)+")": "Golos: sem dados suficientes",hasGoals?"BTTS estimado: "+pct(btts):"",hasHalfTime?"Over 0,5 HT estimado: "+pct(ht05):"Over 0,5 HT: sem dados suficientes",hasSecondHalf?"Over 0,5 ST estimado: "+pct(sh05):"Over 0,5 ST: sem dados suficientes",hasXg&&hasGoalHistory?"Expectativa de golos ponderada: 65% golos históricos + 35% xG (amostra mínima de 5 jogos por indicador)":hasXg?"xG disponível, mas o histórico de golos é insuficiente; não foi usada uma previsão baseada apenas em xG":"xG: amostra inferior a 5 jogos ou sem dados",hasCorners?"Expectativa de "+(sumC/N).toFixed(2)+" cantos":"Cantos: sem dados suficientes","Simulação reproduzível: os mesmos dados geram os mesmos resultados.",extraHtml.length?"Indicadores adicionais calculados: "+extraValues.map(x=>x.spec.key.toLowerCase()).join(", "):""].filter(Boolean).join(". ")+".";
  $("resultados").classList.remove("hidden");$("resultados").scrollIntoView({behavior:"smooth",block:"start"});
 }catch(e){random=Math.random;alert(e.message)}
}
$("run").addEventListener("click",simulate);

$("reset").addEventListener("click",()=>location.reload());

/* Importação automática baseada no formato CSV já usado no futebol-stats. */
const dataState={matches:[],teams:[],wdwTeams:{},wdwSummaries:{},wdwLeagueLinks:{},wdwTeamMappings:{}};
let historicalLoadSequence=0,wdwPairSequence=0;
const WDW_PROXY_URL=String(window.SIMULADOR_CONFIG?.windrawwinProxyUrl||"").replace(/\/$/,"");
const WDW_LEAGUES={
 "POR_1_primeira-liga":"portugal-primeira-liga",
 "ENG_1_premier-league":"england-premier-league",
 "ENG_2_championship":"england-championship",
 "ENG_3_league-one":"england-league-one",
 "ENG_4_league-two":"england-league-two",
 "ENG_5_national-league":"england-national-league",
 "ENG_6_national-league-north":"england-national-league-north",
 "ENG_6_national-league-south":"england-national-league-south",
 "ENG_CUP_efl-cup":"england-efl-cup",
 "ENG_CUP_fa-cup":"england-fa-cup",
 "ESP_1_la-liga":"spain-la-liga",
 "ESP_2_segunda-division":"spain-segunda-division",
 "ESP_CUP_copa-del-rey":"spain-copa-del-rey",
 "ITA_1_serie-a":"italy-serie-a",
 "ITA_2_serie-b":"italy-serie-b",
 "ITA_CUP_coppa-italia":"italy-coppa-italia",
 "GER_1_bundesliga":"germany-bundesliga",
 "GER_2_2-bundesliga":"germany-2-bundesliga",
 "GER_3_3-liga":"germany-3-liga",
 "GER_CUP_dfb-pokal":"germany-dfb-pokal",
 "FRA_1_ligue-1":"france-ligue-1",
 "FRA_2_ligue-2":"france-ligue-2",
 "NED_1_eredivisie":"netherlands-eredivisie",
 "NED_2_eerste-divisie":"netherlands-eerste-divisie",
 "BRA_1_serie-a":"brazil-serie-a",
 "BRA_2_serie-b":"brazil-serie-b",
 "ARG_1_liga-profesional":"argentina-liga-profesional",
 "ARG_2_primera-nacional":"argentina-primera-b-nacional",
 "MEX_1_liga-mx":"mexico-liga-mx",
 "MEX_2_liga-expansion":"mexico-liga-de-expansion-mx",
 "USA_1_mls":"usa-major-league-soccer",
 "JPN_1_j1-league":"japan-j-league",
 "AUS_1_a-league":"australia-a-league",
 "CHN_1_super-league":"china-super-league",
 "UEFA_1_champions-league":"champions-league",
 "UEFA_1_europa-league":"europa-league",
 "UEFA_1_conference-league":"europa-conference-league",
 "SCO_1_premiership":"scotland-premiership",
 "SCO_2_championship":"scotland-championship",
 "SCO_3_league-one":"scotland-league-one",
 "SCO_4_league-two":"scotland-league-two",
 "SCO_CUP_scottish-cup":"scotland-cup",
 "SCO_CUP_league-cup":"scotland-league-cup",
 "BEL_1_pro-league":"belgium-first-division-a",
 "TUR_1_super-lig":"turkey-super-lig",
 "GRE_1_super-league":"greece-super-league",
 "SUI_1_super-league":"switzerland-super-league",
 "AUT_1_bundesliga":"austria-bundesliga",
 "DEN_1_superliga":"denmark-superliga",
 "SWE_1_allsvenskan":"sweden-allsvenskan",
 "NOR_1_eliteserien":"norway-eliteserien",
 "ROU_1_liga-1":"romania-liga-i",
 "RUS_1_premier-liga":"russia-premier-league",
 "IRE_2_first-division":"ireland-first-division",
 "POL_1_ekstraklasa":"poland-ekstraklasa",
 "POL_2_division-1":"poland-i-liga",
 "WAL_1_cymru-premier":"wales-cymru-premier",
 "CRO_1_hnl":"croatia-1-hnl",
 "CZE_1_chance-liga":"czech-first-league",
 "CYP_1_first-division":"cyprus-first-division",
 "SVK_1_nike-liga":"slovakia-super-liga",
 "SVN_1_prva-liga":"slovenia-prvaliga",
 "FIN_1_veikkausliiga":"finland-veikkausliiga",
 "KAZ_1_premier-league":"kazakhstan-premier-league",
 "UKR_1_premier-league":"ukraine-upl"
};
const WDW_CALENDAR_YEAR_LEAGUES=new Set(["BRA_1_serie-a","BRA_2_serie-b","ARG_1_liga-profesional","ARG_2_primera-nacional","USA_1_mls","JPN_1_j1-league","AUS_1_a-league","CHN_1_super-league","SWE_1_allsvenskan","NOR_1_eliteserien","FIN_1_veikkausliiga","KAZ_1_premier-league","IRE_2_first-division","WAL_1_cymru-premier"]);
const WDW_ALIASES={"shakhtar":"shakhtar donetsk","fc shakhtar donetsk":"shakhtar donetsk","shakhtar donetsk fc":"shakhtar donetsk","fc shakhtar":"shakhtar donetsk","sporting":"sporting lisbon","sporting cp":"sporting lisbon","sporting lisboa":"sporting lisbon","sporting portugal":"sporting lisbon","sporting clube portugal":"sporting lisbon","sporting clube de portugal":"sporting lisbon","academico":"academico viseu","academico viseu":"academico viseu","vitoria":"guimaraes","casa pia":"casa pia atletico","nacional":"nacional madeira","maritimo m":"maritimo","estoril praia":"estoril","gd estoril praia":"estoril"};
const WDW_TEAM_PATHS={"POR_1_primeira-liga":{"porto":"/results/fc-porto/","estoril":"/results/estoril/","famalicao":"/results/famalicao/"}};
function normalizeTeamName(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(fc|cf|sc|afc|club|clube|de|the)\b/g," ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");}
function wdwTeamKey(value){const n=normalizeTeamName(value);return normalizeTeamName(WDW_ALIASES[n]||n);}
async function fetchWdwPage(path){
 if(!WDW_PROXY_URL)throw new Error("Proxy WinDrawWin ainda não configurado.");
 const url=WDW_PROXY_URL+"/page?path="+encodeURIComponent(path);
 let r;
 try{r=await fetch(url,{headers:{Accept:"text/html,application/json"}});}
 catch(e){throw new Error("Não foi possível contactar o Worker Cloudflare: "+String(e?.message||e).slice(0,180));}
 const body=await r.text();
 let diagnostic=null;
 try{diagnostic=JSON.parse(body);}catch(e){}
 if(!r.ok){
  if(diagnostic&&diagnostic.error==="upstream_error")throw new Error("O Worker está acessível, mas o WinDrawWin respondeu "+(diagnostic.upstream_status||"sem código")+" "+(diagnostic.upstream_status_text||"")+". Página: "+(diagnostic.requested_path||path)+".");
  if(diagnostic&&diagnostic.error==="unexpected_content_type")throw new Error("O WinDrawWin devolveu conteúdo inesperado ("+(diagnostic.content_type||"tipo desconhecido")+", HTTP "+(diagnostic.upstream_status||"?")+"). Página: "+(diagnostic.requested_path||path)+".");
  if(diagnostic&&diagnostic.error==="upstream_unavailable")throw new Error("O Worker não conseguiu ligar ao WinDrawWin: "+(diagnostic.detail||"erro de ligação")+".");
  throw new Error("O proxy respondeu HTTP "+r.status+". Resposta: "+body.slice(0,220));
 }
 if(diagnostic&&diagnostic.error)throw new Error("Erro do proxy: "+diagnostic.error+(diagnostic.detail?": "+diagnostic.detail:""));
 if(!body||!body.trim().startsWith("<"))throw new Error("O proxy respondeu, mas não devolveu HTML válido. Tipo: "+(r.headers.get("content-type")||"desconhecido")+".");
 return new DOMParser().parseFromString(body,"text/html");
}
function wdwRequiredComplete(m){const required=[m.hg,m.ag,m.homeCorners,m.awayCorners,m.homeFouls,m.awayFouls,m.homeTarget,m.awayTarget,m.homeShotsOff,m.awayShotsOff];return required.every(v=>v!==null&&v!==undefined&&!(typeof v==="string"&&v.trim()==="")&&Number.isFinite(Number(v))&&Number(v)>=0);}
function wdwHasCompleteMatches(matches){return Array.isArray(matches)&&matches.some(wdwRequiredComplete);}
function parseWdwSummary(doc,team,matches){
 const scored=matches.filter(m=>Number.isFinite(m.hg)&&Number.isFinite(m.ag));
 const complete=matches.filter(wdwRequiredComplete);
 const teamValue=(m,homeValue,awayValue)=>m.teamHome?homeValue:awayValue;
 const poss=matches.map(m=>teamValue(m,m.homePoss,m.awayPoss)).filter(v=>v!==null&&Number.isFinite(v));
 const shots=matches.map(m=>{const t=teamValue(m,m.homeTarget,m.awayTarget),o=teamValue(m,m.homeShotsOff,m.awayShotsOff);return t===null||o===null?null:t+o;}).filter(v=>v!==null);
 const sot=matches.map(m=>teamValue(m,m.homeTarget,m.awayTarget)).filter(v=>v!==null);
 const gf=scored.map(m=>teamValue(m,m.hg,m.ag)),ga=scored.map(m=>teamValue(m,m.ag,m.hg));
 const htRows=matches.filter(m=>m.htHome!==null&&m.htAway!==null);
 const ht=htRows.map(m=>m.htHome+m.htAway);
 const ht05=ht.length?100*ht.filter(v=>v>=1).length/ht.length:null,ht15=ht.length?100*ht.filter(v=>v>=2).length/ht.length:null;
 const wins=scored.filter(m=>teamValue(m,m.hg>m.ag,m.ag>m.hg)).length;
 const draws=scored.filter(m=>m.hg===m.ag).length,losses=scored.length-wins-draws;
 const clean=scored.filter(m=>teamValue(m,m.ag,m.hg)===0).length;
 const both=scored.filter(m=>m.hg>0&&m.ag>0).length;
 const over25Rows=scored.filter(m=>m.hg+m.ag>2).length;
 const form=scored.slice(0,5).map(m=>{const f=teamValue(m,m.hg,m.ag),a=teamValue(m,m.ag,m.hg);return f>a?"V":f===a?"E":"D";}).join(" ");
 const homeGames=matches.filter(m=>m.teamHome&&m.homeCorners!==null);
 const awayGames=matches.filter(m=>!m.teamHome&&m.awayCorners!==null);
 const cornerRows=matches.filter(m=>m.homeCorners!==null&&m.awayCorners!==null);
 return {btts:scored.length?100*both/scored.length:null,bttsCount:both,bttsPlayed:scored.length,over25:scored.length?100*over25Rows/scored.length:null,over25Count:over25Rows,over25Played:scored.length,cornersTotal:mean(cornerRows.map(m=>m.homeCorners+m.awayCorners)),cornersHome:mean(homeGames.map(m=>m.homeCorners)),cornersAway:mean(awayGames.map(m=>m.awayCorners)),possession:mean(poss),shots:mean(shots),shotsOnTarget:mean(sot),goalsFor:mean(gf),goalsAgainst:mean(ga),htGoals:mean(ht),ht05,ht15,cleanSheets:scored.length?100*clean/scored.length:null,form,wins,draws,losses,sample:scored.length,completeSample:complete.length,excludedIncomplete:matches.length-complete.length};
}
function renderWdwSummary(side,team){
 const heading=$(side==="home"?"wdw-home-data":"wdw-away-data")?.parentElement?.querySelector("h4");
 if(heading)heading.textContent=(side==="home"?"CASA — ":"FORA — ")+($(side==="home"?"homePick":"awayPick")?.value||"");
 const box=$(side==="home"?"wdw-home-data":"wdw-away-data");
 if(!box)return;
 const s=dataState.wdwSummaries[team];
 if(!s){box.textContent="A aguardar dados WinDrawWin.";return;}
 const val=(v,d=1)=>v===null||v===undefined||!Number.isFinite(v)?"Sem dados":v.toFixed(d);
 const pct=(v)=>v===null||v===undefined||!Number.isFinite(v)?"Sem dados":v.toFixed(1)+"%";
 const item=(label,value)=>'<div class="wdw-stat"><span>'+label+'</span><strong>'+value+'</strong></div>';
 const group=(title,items)=>'<section class="wdw-stat-group"><h5>'+title+'</h5><div class="wdw-stat-list">'+items.join("")+'</div></section>';
 const blocks=[
  group("Amostra e forma",[item("Jogos analisados",s.sample+" jogos"),item("Últimos 5 resultados",s.form||"Sem dados"),item("Vitórias / Empates / Derrotas",s.wins+" / "+s.draws+" / "+s.losses)]),
  group("Golos",[item("Golos marcados por jogo",val(s.goalsFor,2)),item("Golos sofridos por jogo",val(s.goalsAgainst,2)),item("Clean sheets",pct(s.cleanSheets)),item("Ambas marcam (BTTS)",s.btts===null?"Sem dados":pct(s.btts)+" ("+s.bttsCount+"/"+s.bttsPlayed+")"),item("Mais de 2,5 golos",s.over25===null?"Sem dados":pct(s.over25)+" ("+s.over25Count+"/"+s.over25Played+")")]),
  group("Primeira parte",[item("Média de golos na 1.ª parte",val(s.htGoals,2)),item("Over 0,5 golos HT",pct(s.ht05)),item("Over 1,5 golos HT",pct(s.ht15))]),
  group("Estatísticas de jogo",[item("Posse média",pct(s.possession)),item("Remates por jogo",val(s.shots)),item("Remates à baliza por jogo",val(s.shotsOnTarget))]),
  group("Cantos",[item("Cantos totais por jogo",val(s.cornersTotal,2)),item("Cantos a favor em casa",val(s.cornersHome,2)),item("Cantos a favor fora",val(s.cornersAway,2))])
 ];
 box.innerHTML='<div class="wdw-stat-groups">'+blocks.join("")+'</div>';
}
function wdwDateKey(raw){const m=String(raw||"").match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b/i);if(!m)return "";const months={jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};const month=months[m[2].slice(0,3).toLowerCase()];return month?month+"-"+m[1].padStart(2,"0"):"";}function parseWdwMatchRows(doc,team){
 const out=[];
 const heading=doc.querySelector("h1")?.textContent?.replace(/ Results.*$/i,"").replace(/ Game Stats.*$/i,"").replace(/ Match Statistics.*$/i,"").trim()||team;
 const rows=[...doc.querySelectorAll("tr")];
 const scorePattern=/^(\d+)\s*[-:]\s*(\d+)$/;
 for(const tr of rows){
  const cells=[...tr.cells].map(c=>c.textContent.replace(/\s+/g," ").trim());
  if(cells.length<3)continue;
  let home="",away="",fixtureIndex=-1,scoreIndex=-1;
  const combinedIndex=cells.findIndex(v=>/\s+v\s+/i.test(v));
  if(combinedIndex>=0){
   const parts=cells[combinedIndex].split(/\s+v\s+/i);
   if(parts.length===2){home=parts[0].trim();away=parts[1].trim();fixtureIndex=combinedIndex;}
  }else{
   const versusIndex=cells.findIndex(v=>/^v(?:s)?\.?$/i.test(v));
   if(versusIndex>0&&versusIndex<cells.length-1){
    home=cells[versusIndex-1];away=cells[versusIndex+1];fixtureIndex=versusIndex-1;
   }else{
    const awayVsIndex=cells.findIndex(v=>/^v\s+.+$/i.test(v));
    if(awayVsIndex>0){home=cells[awayVsIndex-1];away=cells[awayVsIndex].replace(/^v\s+/i,"").trim();fixtureIndex=awayVsIndex-1;}
   }
  }
  if(!home||!away)continue;
  scoreIndex=cells.findIndex((v,i)=>i>fixtureIndex&&scorePattern.test(v));
  if(scoreIndex<0)continue;
  const score=cells[scoreIndex].match(scorePattern);
  const htScore=(cells[scoreIndex+1]||"").match(scorePattern);
  const teamIsHome=wdwTeamKey(home)===wdwTeamKey(heading)||wdwTeamKey(home)===wdwTeamKey(team);
  const teamIsAway=wdwTeamKey(away)===wdwTeamKey(heading)||wdwTeamKey(away)===wdwTeamKey(team);
  if(!teamIsHome&&!teamIsAway)continue;
  const h=v=>{const s=String(v||"").trim().replace("%","").replace(",",".");if(!s||/no additional|^[-—]$/i.test(s))return null;const n=Number(s);return Number.isFinite(n)&&n>=0?n:null;};
  const vals=cells.slice(scoreIndex+2,scoreIndex+12).map(h);
  while(vals.length<10)vals.push(null);
  out.push({dateKey:wdwDateKey(cells[0]),home,away,hg:Number(score[1]),ag:Number(score[2]),htHome:htScore?Number(htScore[1]):null,htAway:htScore?Number(htScore[2]):null,homePoss:vals[0],homeCorners:vals[1],homeFouls:vals[2],homeTarget:vals[3],homeShotsOff:vals[4],awayPoss:vals[5],awayCorners:vals[6],awayFouls:vals[7],awayTarget:vals[8],awayShotsOff:vals[9],teamHome:teamIsHome,source:"WinDrawWin"});
 }
 return out;
}
function wdwCacheKey(leagueId,team){return leagueId+"::"+wdwTeamKey(team);}
function wdwTeamPathCandidates(team,leagueId){
 const known=WDW_TEAM_PATHS[leagueId]?.[wdwTeamKey(team)];
 const key=wdwTeamKey(team).split(" ").join("-");
 const raw=String(team||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
 return [...new Set([known,"/results/"+key+"/","/results/"+raw+"/","/results/fc-"+key+"/"].filter(Boolean))];
}
async function loadWdwLeagueTeams(leagueId){
 const slug=WDW_LEAGUES[leagueId];
 if(!slug)return [];
 if(!Object.prototype.hasOwnProperty.call(dataState.wdwLeagueLinks,leagueId)){
  const doc=await fetchWdwPage("/tips/"+slug+"/");
  dataState.wdwLeagueLinks[leagueId]=[...doc.querySelectorAll('a[href^="/results/"]')]
   .map(a=>({name:a.textContent.trim().replace(/\s+Results\s*$/i,"").trim(),href:a.getAttribute("href")}))
   .filter(x=>x.name&&x.href);
 }
 return dataState.wdwLeagueLinks[leagueId];
}
function wdwTeamNameMatchScore(left,right){
 const a=wdwTeamKey(left).split(" ").filter(Boolean),b=wdwTeamKey(right).split(" ").filter(Boolean);
 if(!a.length||!b.length)return {score:0,shared:0};
 const shared=new Set(a.filter(token=>b.includes(token))).size;
 return {score:shared/Math.min(a.length,b.length),shared};
}
function wdwResolveTeamLink(team,links){
 const exact=links.filter(x=>wdwTeamKey(x.name)===wdwTeamKey(team));
 if(exact.length===1)return {path:exact[0].href,canonicalName:exact[0].name,reason:null,matchType:"exact"};
 if(exact.length>1)return {path:null,reason:"ambiguous_team",availableTeams:links.length,matches:exact.map(x=>x.name)};
 // Correspondência aproximada global: compara os tokens normalizados em ambas
 // as direções. Exige pelo menos dois tokens comuns e uma correspondência
 // praticamente completa do nome mais curto para evitar falsos positivos.
 const ranked=links.map(x=>({...x,...wdwTeamNameMatchScore(team,x.name)}))
  .filter(x=>x.shared>=2&&x.score>=0.8)
  .sort((a,b)=>b.score-a.score||b.shared-a.shared);
 const best=ranked[0],next=ranked[1];
 if(best&&(!next||best.score-next.score>=0.15))
  return {path:best.href,canonicalName:best.name,reason:null,matchType:"fuzzy",matchScore:best.score};
 return {path:null,reason:ranked.length?"ambiguous_team":"team_not_listed",availableTeams:links.length,matches:ranked.slice(0,5).map(x=>x.name)};
}
async function findWdwTeamPathFromLeagueIndex(team,leagueId){
 if(!WDW_LEAGUES[leagueId])return {path:null,reason:"unsupported_league"};
 const cacheKey=wdwCacheKey(leagueId,team);
 if(Object.prototype.hasOwnProperty.call(dataState.wdwTeamMappings,cacheKey))return dataState.wdwTeamMappings[cacheKey];
 const links=(await loadWdwLeagueTeams(leagueId)).filter(x=>x.name&&typeof x.href==="string"&&/^\/results\/[a-z0-9-]+\/?$/i.test(x.href));
 const result=wdwResolveTeamLink(team,links);
 dataState.wdwTeamMappings[cacheKey]=result;
 return result;
}
async function findWdwTeamPath(team,leagueId){
 if(!WDW_LEAGUES[leagueId])return {paths:[],reason:"unsupported_league"};
 let indexed={path:null};
 try{indexed=await findWdwTeamPathFromLeagueIndex(team,leagueId);}catch(e){}
 return {paths:[indexed.path,...wdwTeamPathCandidates(team,leagueId)].filter((v,i,a)=>v&&a.indexOf(v)===i),canonicalName:indexed.canonicalName,reason:null};
}
async function loadWdwTeam(side,team,league,pairRequestId){
 if(!team)return;
 const isCurrent=()=>pairRequestId===wdwPairSequence&&league===$("league").value&&team===$(side==="home"?"homePick":"awayPick").value;
 const status=$("wdw-status"),key=wdwCacheKey(league,team);
 if(dataState.wdwTeams[key]){
  if(isCurrent()){applyTeamSelection(side);renderWdwSummary(side,key);status.textContent="WinDrawWin: dados em cache para "+team+" nesta competição ("+dataState.wdwTeams[key].length+" jogos).";}
  return;
 }
 if(!WDW_PROXY_URL){status.textContent="WinDrawWin: proxy ainda não configurado. A fonte principal continua ativa.";return;}
 try{
  const result=await findWdwTeamPath(team,league);
  if(result.reason==="unsupported_league"){
   if(isCurrent())status.textContent="WinDrawWin: competição sem mapeamento de origem. A fonte principal continua ativa.";
   return;
  }
  let doc=null,matches=[],usedPath=null,lastError="";
  for(const path of result.paths){
   try{
    const candidate=await fetchWdwPage(path),candidateMatches=parseWdwMatchRows(candidate,team);
    if(candidateMatches.length){doc=candidate;matches=candidateMatches;usedPath=path;break;}
   }catch(e){
    lastError=String(e?.message||e);
    if(/respondeu 403|HTTP 403/i.test(lastError))break;
   }
  }
  // Fallback: índice da competição, útil quando o URL da equipa tem um slug irregular.
  if(!matches.length&&!/respondeu 403|HTTP 403/i.test(lastError)){
   try{
    const indexed=await findWdwTeamPathFromLeagueIndex(team,league);
    if(indexed.path){
     const candidate=await fetchWdwPage(indexed.path),candidateMatches=parseWdwMatchRows(candidate,team);
     if(candidateMatches.length){doc=candidate;matches=candidateMatches;usedPath=indexed.path;}
    }else if(indexed.availableTeams===0){
     lastError="O índice da competição devolveu zero equipas.";
    }
   }catch(e){lastError=String(e?.message||e);}
  }
  // As páginas de resultados WinDrawWin podem misturar ligas e taças.
  // Só aceitamos jogos que também existam na lista da competição selecionada.
  const selectedSeason=$("season").value;
  const seasonStart=2000+Number(selectedSeason.slice(0,2));
  const scopedMatches=matches.filter(w=>{
   if(!w.dateKey)return false;
   const [month,day]=w.dateKey.split("-").map(Number);
   const year=WDW_CALENDAR_YEAR_LEAGUES.has(league)?seasonStart:(month>=7?seasonStart:seasonStart+1);
   const date=year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
   return dataState.matches.some(m=>
    m.date===date&&wdwTeamKey(m.home)===wdwTeamKey(w.home)&&
    wdwTeamKey(m.away)===wdwTeamKey(w.away)&&m.hg===w.hg&&m.ag===w.ag
   );
  });
  matches=scopedMatches;
  if(!matches.length){
   if(isCurrent())status.textContent=/respondeu 403|HTTP 403/i.test(lastError)
    ?"WinDrawWin: o servidor recusou o acesso (HTTP 403). Não é um erro no nome da equipa; a fonte principal continua ativa."
    :"WinDrawWin: não foram encontrados jogos desta equipa confirmados na competição e época selecionadas. A fonte principal mantém-se ativa.";
   return;
  }
  dataState.wdwTeams[key]=matches;
  dataState.wdwSummaries[key]=parseWdwSummary(doc,team,matches);
  if(isCurrent()){applyTeamSelection(side);renderWdwSummary(side,key);
   const completeCount=matches.filter(wdwRequiredComplete).length;status.textContent="WinDrawWin: página identificada para "+team+"; "+matches.length+" resultados encontrados, dos quais "+completeCount+" têm estatísticas completas. ("+usedPath+"). A fonte principal mantém prioridade quando tem dados.";}
 }catch(e){if(isCurrent())status.textContent="WinDrawWin: "+e.message;}
}

async function loadWdwMatchPair(){
 const requestId=++wdwPairSequence;
 const home=$( "homePick").value,away=$( "awayPick").value,league=$( "league").value;
 const status=$("wdw-status");
 if(!home||!away){
  $("wdw-home-data").textContent=home?"A aguardar seleção da equipa visitante.":"A aguardar seleção da equipa da casa.";
  $("wdw-away-data").textContent=away?"A aguardar seleção da equipa da casa.":"A aguardar seleção da equipa visitante.";
  status.textContent="WinDrawWin: seleciona as duas equipas para validar o mapeamento do encontro.";
  return;
 }
 if(wdwTeamKey(home)===wdwTeamKey(away)){
  $("wdw-home-data").textContent="Seleções inválidas: escolhe duas equipas diferentes.";
  $("wdw-away-data").textContent="Seleções inválidas: escolhe duas equipas diferentes.";
  status.textContent="WinDrawWin: as duas seleções apontam para a mesma equipa. Confirma os nomes.";
  return;
 }
 status.textContent="WinDrawWin: a procurar e validar "+home+" e "+away+" na mesma competição…";
 $("wdw-home-data").textContent="A validar equipa da casa: "+home+"…";
 $("wdw-away-data").textContent="A validar equipa visitante: "+away+"…";
 await Promise.all([loadWdwTeam("home",home,league,requestId),loadWdwTeam("away",away,league,requestId)]);
 if(requestId!==wdwPairSequence||league!==$("league").value||home!==$("homePick").value||away!==$("awayPick").value)return;
 const hk=wdwCacheKey(league,home),ak=wdwCacheKey(league,away);
 const homeRows=dataState.wdwTeams[hk]||[],awayRows=dataState.wdwTeams[ak]||[];
 const homeMapped=homeRows.length>0,awayMapped=awayRows.length>0;
 const homeComplete=homeRows.filter(wdwRequiredComplete).length,awayComplete=awayRows.filter(wdwRequiredComplete).length;
 if(homeMapped&&awayMapped&&homeComplete>0&&awayComplete>0){
  status.textContent="WinDrawWin: páginas identificadas para ambas as equipas; jogos com estatísticas completas — "+home+" ("+homeComplete+") e "+away+" ("+awayComplete+").";
 }else if(homeMapped&&awayMapped){
  status.textContent="WinDrawWin: nomes e páginas das duas equipas identificados. Contudo, a fonte não disponibiliza estatísticas completas suficientes: "+home+" ("+homeComplete+"/"+homeRows.length+") e "+away+" ("+awayComplete+"/"+awayRows.length+"). Os resultados e a forma podem continuar disponíveis; os indicadores ausentes não serão inventados.";
 }else{
  const missing=[!homeMapped?home:null,!awayMapped?away:null].filter(Boolean);
  status.textContent="WinDrawWin: não foi possível identificar a página de resultados de "+missing.join(" e ")+". A correspondência de nomes será verificada na lista da competição; a fonte principal mantém-se ativa.";
 }
}

function parseSourceCSV(text){
 const rows=[];let row=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===","){row.push(field);field="";}else if(c==="\n"){row.push(field);rows.push(row);row=[];field="";}else if(c!=="\r")field+=c;}
 if(field||row.length){row.push(field);rows.push(row);}if(!rows.length)return [];
 const headers=rows.shift().map(x=>x.trim().replace(/^\uFEFF/,""));
 return rows.filter(r=>r.some(v=>String(v).trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||"").trim()])));
}
function sourceVal(row,names){for(const n of names){const key=Object.keys(row).find(k=>k.toLowerCase()===n.toLowerCase());if(key&&row[key]!=="")return row[key];}return "";}
function normalizeFlashscoreSourceLabel(label){
 const parts=String(label||"").split(/\s+\/\s+/);
 const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
 if(parts.length<2)return normalize(label);
 const country=parts.shift(),competition=parts.join(" / ");
 return normalize(country)+" / "+normalize(competition);
}
function sourceNum(row,names){const raw=String(sourceVal(row,names)).trim().replace(/\s/g,"").replace(",",".");if(!raw)return null;const n=Number(raw);return Number.isFinite(n)&&n>=0?n:null;}
function sourceDate(raw){const s=String(raw||"").trim();let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);if(m)return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");const d=new Date(s);return Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10);}
function normalizeFlashscoreMatch(r){
 const hg=sourceNum(r,["score_home"]),ag=sourceNum(r,["score_away"]);
 const home=sourceVal(r,["home_team"]),away=sourceVal(r,["away_team"]);
 if(!home||!away||hg===null||ag===null)return null;
 return {date:sourceDate(sourceVal(r,["date_time"])),home,away,hg,ag,
  htHome:sourceNum(r,["ht_home"]),htAway:sourceNum(r,["ht_away"]),
  shHome:sourceNum(r,["sh_home"]),shAway:sourceNum(r,["sh_away"]),
  hc:sourceNum(r,["corners_home"]),ac:sourceNum(r,["corners_away"]),
  homeShots:sourceNum(r,["shots_home"]),awayShots:sourceNum(r,["shots_away"]),
  homeTarget:sourceNum(r,["shots_on_target_home"]),awayTarget:sourceNum(r,["shots_on_target_away"]),
  homeFouls:sourceNum(r,["fouls_home"]),awayFouls:sourceNum(r,["fouls_away"]),
  homeYellow:sourceNum(r,["yellow_cards_home"]),awayYellow:sourceNum(r,["yellow_cards_away"]),
  homeRed:sourceNum(r,["red_cards_home"]),awayRed:sourceNum(r,["red_cards_away"]),
  homeXg:sourceNum(r,["xg_home"]),awayXg:sourceNum(r,["xg_away"])};
}
function flashscoreCompetitionValue(country,competition){return "FS|"+encodeURIComponent(country)+"|"+encodeURIComponent(competition);}
function flashscoreCompetitionSortRank(item){
 const name=String(item.competition||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const type=String(item.competitionType||"").toLowerCase();
 if(type==="taca"||/\b(cup|copa|coupe|pokal|coppa|taça|taca)\b/.test(name))return 1000;
 const explicit=name.match(/\b(\d+)\s*(?:ª|a|o)?\s*(?:divisao|division|liga|league)\b|\b(?:liga|league|division)\s*(\d+)\b/);
 if(explicit)return Number(explicit[1]||explicit[2]);
 if(/\b(championship|segunda|second division|segunda division|ligue 2|serie b|2\. bundesliga|2. bundesliga|segunda liga)\b/.test(name))return 2;
 if(/\b(league one|primera federacion|terceira|third division|serie c|3. liga)\b/.test(name))return 3;
 if(/\b(league two|quarta|fourth division|serie d|4. liga)\b/.test(name))return 4;
 if(/\b(national league|quinta|fifth division)\b/.test(name))return 5;
 if(type==="liga_ou_torneio"||/\b(premier|primeira|first division|primera division|ligue 1|serie a|bundesliga|eredivisie|super liga|super league|super-league|liga mx|major league soccer|mls)\b/.test(name))return 1;
 return 500;
}
function normalizeCompetitionCountry(value){
 return String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\\s+/g," ");
}
function flashscoreCountryCode(country){
 const normalized=normalizeCompetitionCountry(country);
 const aliases={"eua":"USA","estados unidos":"USA","europa":"UEFA","europe":"UEFA"};
 if(aliases[normalized])return aliases[normalized];
 for(const [code,name] of Object.entries(COUNTRY_NAMES)){
  if(normalizeCompetitionCountry(name)===normalized)return code;
 }
 return null;
}
const flashscoreCompetitionState={items:[],loaded:false};
async function populateFlashscoreCompetitions(){
 if(flashscoreCompetitionState.loaded)return;
 try{
  const indexText=await fetchSourceCSV(FLASHSCORE_COMPLETE_INDEX_URL);
  const index=JSON.parse(indexText);
  if(!Array.isArray(index.complete_competitions))throw new Error("O índice de competições completas não contém a lista esperada.");
  const eligible=index.complete_competitions.filter(item=>item.complete_core===true&&Number(item.unique_stats_matches)>=5);
  flashscoreCompetitionState.items=eligible.map(item=>{
   const labels=Array.isArray(item.stats_source_labels)&&item.stats_source_labels.length
    ?item.stats_source_labels:[item.country_name+" / "+item.competition_name];
   const countryCode=flashscoreCountryCode(item.country_name);
   const country=countryCode?(COUNTRY_NAMES[countryCode]||item.country_name):item.country_name;
   return {
    value:flashscoreCompetitionValue(item.country_name,item.competition_name),
    country,competition:item.competition_name,competitionType:"complete_core",countryCode,
    count:Number(item.unique_stats_matches)||0,statsSourceLabels:labels,
    metricCoverage:item.metric_coverage||{}
   };
  }).sort((a,b)=>a.country.localeCompare(b.country,"pt")||
   flashscoreCompetitionSortRank(a)-flashscoreCompetitionSortRank(b)||
   a.competition.localeCompare(b.competition,"pt",{numeric:true,sensitivity:"base"}));
  flashscoreCompetitionState.loaded=true;
  const currentCountry=countrySelect.value;
  const flashCountries=[...new Set(flashscoreCompetitionState.items
   .filter(item=>!item.countryCode||!countryCodes.includes(item.countryCode))
   .map(item=>item.country))].sort((a,b)=>a.localeCompare(b,"pt"));
  countrySelect.innerHTML=countryCodes.map(code=>'<option value="'+code+'">'+(COUNTRY_NAMES[code]||code)+'</option>').join("")+
   flashCountries.map(country=>'<option value="FSCOUNTRY|'+encodeURIComponent(country)+'">'+country+'</option>').join("");
  const availableCountries=[...countrySelect.options].map(option=>option.value);
  countrySelect.value=availableCountries.includes(currentCountry)?currentCountry:
   (availableCountries.includes(initialLeague.split("_")[0])?initialLeague.split("_")[0]:availableCountries[0]||"");
  setCountryCompetitions(initialLeague);
 }catch(error){console.warn("Não foi possível carregar o índice de competições completas:",error);}
}
function normalizeSourceMatch(r){const home=sourceVal(r,["home","home_team","HomeTeam"]),away=sourceVal(r,["away","away_team","AwayTeam"]);const hg=sourceNum(r,["ft_home","home_score","home_goals","FTHG"]),ag=sourceNum(r,["ft_away","away_score","away_goals","FTAG"]);if(!home||!away||hg===null||ag===null)return null;return {date:sourceDate(sourceVal(r,["date","match_date","Date"])),home,away,hg,ag,htHome:sourceNum(r,["ht_home"]),htAway:sourceNum(r,["ht_away"]),hc:sourceNum(r,["home_corners","HomeCorners","HC","home_corner"]),ac:sourceNum(r,["away_corners","AwayCorners","AC","away_corner"]),homeShots:sourceNum(r,["home_shots"]),awayShots:sourceNum(r,["away_shots"]),homeTarget:sourceNum(r,["home_target"]),awayTarget:sourceNum(r,["away_target"]),homeFouls:sourceNum(r,["home_fouls"]),awayFouls:sourceNum(r,["away_fouls"]),homeYellow:sourceNum(r,["home_yellow"]),awayYellow:sourceNum(r,["away_yellow"]),homeRed:sourceNum(r,["home_red"]),awayRed:sourceNum(r,["away_red"])};}
const DATA_CACHE_DB="simulador-futebol-cache";
const DATA_CACHE_STORE="resources";
const DATA_CACHE_TTL=30*60*1000;
const FLASHSCORE_STATS_CSV_URL="https://raw.githubusercontent.com/markyto34/simuladorfutebol/main/data/flashscore-statistics.csv";
const FLASHSCORE_COMPLETE_INDEX_URL="https://raw.githubusercontent.com/markyto34/simuladorfutebol/main/data/simulator-complete-competitions.json";
const ODDS_PERIODS_CSV_URL="https://raw.githubusercontent.com/markyto34/simuladorfutebol/main/ganhonasodds_com_20261101.csv";
let dataCacheDbPromise=null;
function openDataCache(){
 if(!("indexedDB" in window))return Promise.reject(new Error("IndexedDB indisponível"));
 if(dataCacheDbPromise)return dataCacheDbPromise;
 dataCacheDbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DATA_CACHE_DB,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DATA_CACHE_STORE))db.createObjectStore(DATA_CACHE_STORE,{keyPath:"key"});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error("Falha ao abrir cache local"));
 });
 return dataCacheDbPromise;
}
async function readDataCache(key){
 try{const db=await openDataCache();return await new Promise(resolve=>{const request=db.transaction(DATA_CACHE_STORE,"readonly").objectStore(DATA_CACHE_STORE).get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>resolve(null);});}catch(e){return null;}
}
async function writeDataCache(key,text){
 try{const db=await openDataCache();await new Promise(resolve=>{const tx=db.transaction(DATA_CACHE_STORE,"readwrite");tx.objectStore(DATA_CACHE_STORE).put({key,text,at:Date.now()});tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve();});}catch(e){}
}
async function fetchSourceCSV(url){
 const key="simulador-futebol:"+url;
 const ttl=url===ODDS_PERIODS_CSV_URL?7*24*60*60*1000:DATA_CACHE_TTL;
 const persistent=await readDataCache(key);
 if(persistent&&Date.now()-persistent.at<ttl&&typeof persistent.text==="string")return persistent.text;
 try{const cached=sessionStorage.getItem(key);if(cached){const c=JSON.parse(cached);if(c&&Date.now()-c.at<300000&&typeof c.text==="string")return c.text;}}catch(e){}
 const response=await fetch(url);
 if(!response.ok)throw new Error("A fonte respondeu com HTTP "+response.status);
 const text=await response.text();
 await writeDataCache(key,text);
 try{sessionStorage.setItem(key,JSON.stringify({at:Date.now(),text}));}catch(e){}
 return text;
}
function updateLeagueCoverage(matches){
 const box=$("data-coverage");
 if(!matches.length){if(box)box.textContent="";return;}
 const has=(...values)=>values.every(v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))&&Number(v)>=0);
 const stats=[
  ["Golos FT",m=>has(m.hg,m.ag)],
  ["Golos 1.ª parte",m=>has(m.htHome,m.htAway)],
  ["Golos 2.ª parte",m=>has(m.shHome,m.shAway)],
  ["Cantos",m=>has(m.hc,m.ac)],
  ["Remates",m=>has(m.homeShots,m.awayShots)],
  ["Remates à baliza",m=>has(m.homeTarget,m.awayTarget)],
  ["Faltas",m=>has(m.homeFouls,m.awayFouls)],
  ["Amarelos",m=>has(m.homeYellow,m.awayYellow)],
  ["Vermelhos",m=>has(m.homeRed,m.awayRed)],
  ["xG",m=>has(m.homeXg,m.awayXg)],
  ["Posse",m=>has(m.homePossession,m.awayPossession)],
  ["Grandes oportunidades",m=>has(m.homeBigChances,m.awayBigChances)],
  ["Remates bloqueados",m=>has(m.homeBlocked,m.awayBlocked)],
  ["Remates fora da área",m=>has(m.homeOutsideBox,m.awayOutsideBox)],
  ["Impedimentos",m=>has(m.homeOffsides,m.awayOffsides)]
 ];
 const parts=stats.map(([label,test])=>{const n=matches.filter(test).length;return label+": "+n+"/"+matches.length+" ("+(100*n/matches.length).toFixed(0)+"%)";});
 if(box)box.textContent="";
}
function teamOptionsForSeason(matches){
 // A lista de equipas não deve depender de um jogo ter todas as estatísticas.
 // Cada indicador calcula depois a sua própria amostra válida em teamSample().
 return [...new Set(matches.flatMap(m=>[m.home,m.away]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
async function loadHistoricalData(){
 const requestId=++historicalLoadSequence;wdwPairSequence++;
 const status=$("data-status"),button=$("load-data");button.disabled=true;
 dataState.matches=[];dataState.teams=[];dataState.wdwTeams={};dataState.wdwSummaries={};
 document.body.classList.remove("data-loaded","match-selected");$("recent-matches")?.classList.add("hidden");
 for(const id of ["homePick","awayPick"]){const select=$(id);select.value="";select.innerHTML='<option value="">A carregar nova pesquisa…</option>';select.disabled=true;}
 for(const id of TEAM_METRIC_PAIRS.flatMap(([,homeId,awayId])=>[homeId,awayId]))fillInput(id,null);
 $("homeName").value="";$("awayName").value="";$("homeNameDisplay").textContent="—";$("awayNameDisplay").textContent="—";
 $("wdw-home-data").textContent="A aguardar nova pesquisa."; $("wdw-away-data").textContent="A aguardar nova pesquisa.";$("wdw-status").textContent="A limpar os dados anteriores…";
 $("resultados").classList.add("hidden");
 status.textContent="A obter os dados da nova pesquisa nas fontes disponíveis…";if($("data-coverage"))$("data-coverage").textContent="A verificar a cobertura real das estatísticas…";
 try{
  const league=$("league").value,season=$("season").value;
  const flashscoreMode=league.startsWith("FS|");
  if(flashscoreMode){
   const [,countryEncoded,competitionEncoded]=league.split("|");
   const country=decodeURIComponent(countryEncoded||""),competition=decodeURIComponent(competitionEncoded||"");
   const selectedFlashCompetition=flashscoreCompetitionState.items.find(item=>item.value===league);
   const acceptedLabels=new Set([country+" / "+competition,...(selectedFlashCompetition?.statsSourceLabels||[])].map(normalizeFlashscoreSourceLabel));
   status.textContent="A carregar os dados de "+country+" — "+competition+"…";
   const csv=await fetchSourceCSV(FLASHSCORE_STATS_CSV_URL);
   matches=parseSourceCSV(csv).filter(row=>acceptedLabels.has(normalizeFlashscoreSourceLabel(sourceVal(row,["country"])+" / "+sourceVal(row,["competition"]))))
    .map(normalizeFlashscoreMatch).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
   if(!matches.length)throw new Error("A competição não tem jogos concluídos com resultados FT e equipas identificadas.");
   
   if(requestId!==historicalLoadSequence)return;
   dataState.matches=matches;dataState.wdwTeams={};dataState.wdwSummaries={};
   updateLeagueCoverage(matches);dataState.teams=teamOptionsForSeason(matches);
   document.body.classList.add("data-loaded");document.body.classList.remove("match-selected");
   for(const id of ["homePick","awayPick"]){
    const teamSelect=$(id);teamSelect.innerHTML='<option value="">Escolhe uma equipa</option>'+dataState.teams.map(t=>'<option value="'+t.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'">'+t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</option>').join("");teamSelect.disabled=dataState.teams.length===0;
   }
   status.textContent="Dados carregados. "+dataState.teams.length+" equipas disponíveis.";
   applyTeamSelection("home");applyTeamSelection("away");
   $("wdw-home-data").textContent="Dados complementares não aplicados a esta competição.";
   $("wdw-away-data").textContent="Dados complementares não aplicados a esta competição.";
   $("wdw-status").textContent="Dados estatísticos da competição carregados.";
   return;
  }
  const now=new Date(),currentSeasonStart=now.getMonth()>=6?now.getFullYear():now.getFullYear()-1;
  const currentSeasonId=String(currentSeasonStart%100).padStart(2,"0")+String((currentSeasonStart+1)%100).padStart(2,"0");
  const allowWdw=season===currentSeasonId;
  let matches=[],primaryError="";
  const url="https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/"+league+"/results_"+season+".csv";
  try{
   const csv=await fetchSourceCSV(url);
   matches=parseSourceCSV(csv).map(normalizeSourceMatch).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
  }catch(e){primaryError=String(e?.message||e);}
  let flashscoreInfo={matched:0,enriched:0},oddsPeriodsInfo={matched:0,ht:0,secondHalf:0};
  let flashscoreError="",oddsPeriodsError="";
  if(matches.length&&window.FootballDataEnrichment){
   status.textContent="A atualizar os indicadores estatísticos…";
   try{
    const flashscoreCSV=await fetchSourceCSV(FLASHSCORE_STATS_CSV_URL);
    flashscoreInfo=window.FootballDataEnrichment.enrichFlashscoreStats(matches,flashscoreCSV);
   }catch(e){flashscoreError=String(e?.message||e);}
   try{
    const oddsPeriodsCSV=await fetchSourceCSV(ODDS_PERIODS_CSV_URL);
    oddsPeriodsInfo=window.FootballDataEnrichment.enrichOddsPeriods(matches,oddsPeriodsCSV);
   }catch(e){oddsPeriodsError=String(e?.message||e);}
  }
  const isComplete=m=>[m.hg,m.ag,m.hc,m.ac,m.homeShots,m.awayShots,m.homeTarget,m.awayTarget,m.homeFouls,m.awayFouls].every(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v)));
  
  let wdwTeams=[],wdwIndexError="";
  if(allowWdw&&WDW_PROXY_URL&&WDW_LEAGUES[league]){
   try{wdwTeams=await loadWdwLeagueTeams(league);}
   catch(e){wdwIndexError=String(e?.message||e);}
  }
  const primaryTeams=teamOptionsForSeason(matches);
  const teams=[...new Set([...primaryTeams,...wdwTeams.map(x=>x.name).filter(Boolean)])].sort((a,b)=>a.localeCompare(b));
  if(!matches.length&&!teams.length){
   const reason=primaryError?"Fonte principal: "+primaryError+". ":"";
   throw new Error(reason+(wdwIndexError?"WinDrawWin: "+wdwIndexError:allowWdw?"Não foram encontradas equipas nas fontes disponíveis.":"A fonte secundária só está ativa na época atual."));
  }
  if(requestId!==historicalLoadSequence)return;
  dataState.matches=matches;dataState.wdwTeams={};dataState.wdwSummaries={};updateLeagueCoverage(matches);dataState.teams=teams;document.body.classList.add("data-loaded");document.body.classList.remove("match-selected");
  for(const id of ["homePick","awayPick"]){
   const select=$(id);select.innerHTML='<option value="">Escolhe uma equipa</option>'+teams.map(t=>'<option value="'+t.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'">'+t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</option>').join("");select.disabled=teams.length===0;
  }
  
  status.textContent="Dados carregados. "+teams.length+" equipas disponíveis. Cada indicador utiliza a sua própria amostra válida; dados em falta não são convertidos em zero.";
  
  applyTeamSelection("home");applyTeamSelection("away");
  $("wdw-home-data").textContent="A aguardar seleção da equipa da casa."; $("wdw-away-data").textContent="A aguardar seleção da equipa visitante.";
  $("wdw-status").textContent=WDW_PROXY_URL?(allowWdw?"Dados complementares disponíveis.":"Dados complementares disponíveis apenas na época atual."):"Dados complementares indisponíveis neste momento.";
 }catch(e){if(requestId===historicalLoadSequence){document.body.classList.remove("data-loaded","match-selected");status.textContent="Não foi possível carregar os dados. Tenta outra competição ou época.";if($("data-coverage"))$("data-coverage").textContent=""; }}finally{if(requestId===historicalLoadSequence)button.disabled=false;}
}
function sameFixtureIdentity(primary,secondary,date){
 if(!date||!primary.date||primary.date!==date)return false;
 return wdwTeamKey(primary.home)===wdwTeamKey(secondary.home)&&wdwTeamKey(primary.away)===wdwTeamKey(secondary.away);
}
function teamSample(team,venue,metric){
 const limit=$("sample").value,requested=limit==="all"?Infinity:Number(limit);
 const league=$("league").value,season=$("season").value;
 const now=new Date(),currentSeasonStart=now.getMonth()>=6?now.getFullYear():now.getFullYear()-1;
 const currentSeasonId=String(currentSeasonStart%100).padStart(2,"0")+String((currentSeasonStart+1)%100).padStart(2,"0");
 const allowWdw=season===currentSeasonId;
 const primary=dataState.matches.filter(m=>(m.home===team||m.away===team)&&(venue==="all"||(venue==="home"&&m.home===team)||(venue==="away"&&m.away===team)));
 const wdw=allowWdw?(dataState.wdwTeams[wdwCacheKey(league,team)]||[]):[];
 const sourceValue=(m,h)=>{
  if(metric==="goalsFor")return h?m.hg:m.ag;
  if(metric==="goalsAgainst")return h?m.ag:m.hg;
  if(metric==="htGoalsFor")return m.htHome===null||m.htAway===null?null:(h?m.htHome:m.htAway);
  if(metric==="htGoalsAgainst")return m.htHome===null||m.htAway===null?null:(h?m.htAway:m.htHome);
  if(metric==="secondHalfGoalsFor")return m.shHome===null||m.shAway===null||m.shHome===undefined||m.shAway===undefined?null:(h?m.shHome:m.shAway);
  if(metric==="secondHalfGoalsAgainst")return m.shHome===null||m.shAway===null||m.shHome===undefined||m.shAway===undefined?null:(h?m.shAway:m.shHome);
  if(metric==="xgFor")return h?m.homeXg:m.awayXg;
  if(metric==="xgAgainst")return h?m.awayXg:m.homeXg;
  if(metric==="cornersFor")return h?m.hc:m.ac;
  if(metric==="cornersAgainst")return h?m.ac:m.hc;
  if(metric==="cornersHtFor")return h?m.homeCornersHt:m.awayCornersHt;
  if(metric==="cornersHtAgainst")return h?m.awayCornersHt:m.homeCornersHt;
  if(metric==="cornersStFor")return h?m.homeCornersSt:m.awayCornersSt;
  if(metric==="cornersStAgainst")return h?m.awayCornersSt:m.homeCornersSt;
  if(metric==="shotsFor")return h?m.homeShots:m.awayShots;
  if(metric==="shotsAgainst")return h?m.awayShots:m.homeShots;
  if(metric==="targetFor")return h?m.homeTarget:m.awayTarget;
  if(metric==="targetAgainst")return h?m.awayTarget:m.homeTarget;
  if(metric==="foulsFor")return h?m.homeFouls:m.awayFouls;
  if(metric==="foulsAgainst")return h?m.awayFouls:m.homeFouls;
  if(metric==="yellowFor")return h?m.homeYellow:m.awayYellow;
  if(metric==="yellowAgainst")return h?m.awayYellow:m.homeYellow;
  if(metric==="redFor")return h?m.homeRed:m.awayRed;
  return h?m.awayRed:m.homeRed;
 };
 const wdwValue=(w,h)=>{
  if(metric==="goalsFor")return h?w.hg:w.ag;
  if(metric==="goalsAgainst")return h?w.ag:w.hg;
  if(metric==="htGoalsFor")return w.htHome===null||w.htAway===null?null:(h?w.htHome:w.htAway);
  if(metric==="htGoalsAgainst")return w.htHome===null||w.htAway===null?null:(h?w.htAway:w.htHome);
  if(metric==="secondHalfGoalsFor")return window.FootballDataEnrichment.deriveSecondHalfGoals(h?w.hg:w.ag,h?w.htHome:w.htAway);
  if(metric==="secondHalfGoalsAgainst")return window.FootballDataEnrichment.deriveSecondHalfGoals(h?w.ag:w.hg,h?w.htAway:w.htHome);
  if(metric==="xgFor"||metric==="xgAgainst")return null;
  if(metric==="cornersHtFor"||metric==="cornersHtAgainst"||metric==="cornersStFor"||metric==="cornersStAgainst")return null;
  if(metric==="cornersFor")return h?w.homeCorners:w.awayCorners;
  if(metric==="cornersAgainst")return h?w.awayCorners:w.homeCorners;
  if(metric==="shotsFor")return h?(w.homeTarget===null||w.homeShotsOff===null?null:w.homeTarget+w.homeShotsOff):(w.awayTarget===null||w.awayShotsOff===null?null:w.awayTarget+w.awayShotsOff);
  if(metric==="shotsAgainst")return h?(w.awayTarget===null||w.awayShotsOff===null?null:w.awayTarget+w.awayShotsOff):(w.homeTarget===null||w.homeShotsOff===null?null:w.homeTarget+w.homeShotsOff);
  if(metric==="targetFor")return h?w.homeTarget:w.awayTarget;
  if(metric==="targetAgainst")return h?w.awayTarget:w.homeTarget;
  if(metric==="foulsFor")return h?w.homeFouls:w.awayFouls;
  if(metric==="foulsAgainst")return h?w.awayFouls:w.homeFouls;
  return null;
 };
 const wdwMatchDate=w=>{
  if(!allowWdw||!w.dateKey)return "";
  const [month,day]=w.dateKey.split("-").map(Number);
  const startYear=2000+Number(season.slice(0,2));
  const year=WDW_CALENDAR_YEAR_LEAGUES.has(league)?startYear:(month>=7?startYear:startYear+1);
  return year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
 };
 const sameFixture=(m,w)=>{
  const date=wdwMatchDate(w);
  return sameFixtureIdentity(m,w,date)&&m.hg===w.hg&&m.ag===w.ag;
 };
 const matching=m=>wdw.find(w=>w.teamHome===(m.home===team)&&sameFixture(m,w))||null;
 const complete=(m,w)=>{
  const get=(primaryValue,secondaryValue)=>primaryValue!==null&&primaryValue!==undefined?primaryValue:secondaryValue;
  const hc=get(m.hc,w?.homeCorners),ac=get(m.ac,w?.awayCorners);
  const hs=get(m.homeShots,w?(w.homeTarget===null||w.homeShotsOff===null?null:w.homeTarget+w.homeShotsOff):null);
  const as=get(m.awayShots,w?(w.awayTarget===null||w.awayShotsOff===null?null:w.awayTarget+w.awayShotsOff):null);
  const ht=get(m.homeTarget,w?.homeTarget),at=get(m.awayTarget,w?.awayTarget);
  const hf=get(m.homeFouls,w?.homeFouls),af=get(m.awayFouls,w?.awayFouls);
  return [m.hg,m.ag,hc,ac,hs,as,ht,at,hf,af].every(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v)));
 };
 const valueFrom=(m,w,h)=>{
  const primaryValue=sourceValue(m,h);
  if(primaryValue!==null&&primaryValue!==undefined)return primaryValue;
  return w?wdwValue(w,h):null;
 };
 const records=primary.map(m=>({m,w:matching(m),h:m.home===team,wdwOnly:false}));
 // WinDrawWin só pode enriquecer jogos já presentes na competição selecionada.
 // Nunca acrescentar jogos de outras provas à amostra principal.
 records.sort((a,b)=>(b.m.date||"").localeCompare(a.m.date||""));
 // Cada indicador usa a sua própria amostra. Não exigir que um jogo tenha
 // cantos, remates e faltas completos para poder contribuir para golos/HT.
 const values=records
  .map(x=>valueFrom(x.m,x.w,x.h))
  .filter(validMetricSampleValue);
 return limit==="all"?values:values.slice(0,requested);
}
function mean(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function validMetricSampleValue(value){return value!==null&&value!==undefined&&!(typeof value==="string"&&value.trim()==="")&&Number.isFinite(Number(value))&&Number(value)>=0;}
function fillInput(id,value){const display=$(id+"Display");if(value!==null&&Number.isFinite(value)){$(id).value=value.toFixed(2);if(display)display.textContent=value.toFixed(2);}else{$(id).value="";if(display)display.textContent="Sem dados";}}
const TEAM_METRIC_PAIRS=[
 ["goalsFor","hgFor","agFor"],["goalsAgainst","hgAgainst","agAgainst"],
 ["htGoalsFor","hhtFor","ahtFor"],["htGoalsAgainst","hhtAgainst","ahtAgainst"],
 ["secondHalfGoalsFor","hshFor","ashFor"],["secondHalfGoalsAgainst","hshAgainst","ashAgainst"],
 ["xgFor","hxgFor","axgFor"],["xgAgainst","hxgAgainst","axgAgainst"],
 ["cornersFor","hcFor","acFor"],["cornersAgainst","hcAgainst","acAgainst"],
 ["cornersHtFor","hchtFor","achtFor"],["cornersHtAgainst","hchtAgainst","achtAgainst"],
 ["cornersStFor","hcstFor","acstFor"],["cornersStAgainst","hcstAgainst","acstAgainst"],
 ["shotsFor","hshotsFor","ashotsFor"],["shotsAgainst","hshotsAgainst","ashotsAgainst"],
 ["targetFor","htargetFor","atargetFor"],["targetAgainst","htargetAgainst","atargetAgainst"],
 ["foulsFor","hfoulsFor","afoulsFor"],["foulsAgainst","hfoulsAgainst","afoulsAgainst"],
 ["yellowFor","hyellowFor","ayellowFor"],["yellowAgainst","hyellowAgainst","ayellowAgainst"],
 ["redFor","hredFor","aredFor"],["redAgainst","hredAgainst","aredAgainst"]
];
function enforcePairedTeamCoverage(){
 const home=$("homePick").value,away=$("awayPick").value;
 if(!home||!away)return "Seleciona as duas equipas para comparar a cobertura.";
 const labels={goalsFor:"Golos marcados",goalsAgainst:"Golos sofridos",htGoalsFor:"Golos marcados HT",htGoalsAgainst:"Golos sofridos HT",secondHalfGoalsFor:"Golos marcados ST",secondHalfGoalsAgainst:"Golos sofridos ST",xgFor:"xG a favor",xgAgainst:"xG contra",cornersFor:"Cantos a favor",cornersAgainst:"Cantos concedidos",cornersHtFor:"Cantos HT a favor",cornersHtAgainst:"Cantos HT concedidos",cornersStFor:"Cantos ST a favor",cornersStAgainst:"Cantos ST concedidos",shotsFor:"Remates",shotsAgainst:"Remates concedidos",targetFor:"Remates à baliza",targetAgainst:"Remates à baliza concedidos",foulsFor:"Faltas cometidas",foulsAgainst:"Faltas sofridas",yellowFor:"Amarelos",yellowAgainst:"Amarelos do adversário",redFor:"Vermelhos",redAgainst:"Vermelhos do adversário"};
 const missing=[];
 for(const [metric] of TEAM_METRIC_PAIRS){
  const h=teamSample(home,"home",metric),a=teamSample(away,"away",metric),min=MetricCoverage.minimumFor(metric);
  if(!MetricCoverage.hasPairedCoverage(h,a,metric))missing.push((labels[metric]||metric)+": casa "+h.length+"/"+min+" · fora "+a.length+"/"+min);
 }
 if(!missing.length)return "Cobertura suficiente nos indicadores disponíveis. Os mercados são calculados apenas quando ambos os lados cumprem a amostra mínima.";
 return "Indicadores sem cobertura suficiente:\n"+missing.map(item=>"• "+item).join("\n")+"\n\nOs mercados que não cumpram a amostra mínima dos dois lados ficam indisponíveis. Os dados válidos continuam visíveis.";
}
function renderRecentTeamMatches(side){
 const team=$(side==="home"?"homePick":"awayPick").value;
 const target=$(side==="home"?"home-recent-matches":"away-recent-matches");
 const heading=$(side==="home"?"home-recent-title":"away-recent-title");
 const section=$("recent-matches");
 if(!target||!heading||!section)return;
 const otherSelected=Boolean($(side==="home"?"awayPick":"homePick").value);
 if(!team){
  heading.textContent=side==="home"?"Equipa da casa":"Equipa visitante";
  target.innerHTML='<p class="recent-empty">Seleciona uma equipa para consultar os últimos 5 jogos.</p>';
  section.classList.toggle("hidden",!otherSelected);
  return;
 }
 const key=wdwTeamKey(team);
 const recent=dataState.matches
  .filter(match=>wdwTeamKey(match.home)===key||wdwTeamKey(match.away)===key)
  .sort((a,b)=>(b.date||"").localeCompare(a.date||""))
  .slice(0,5);
 heading.textContent=team+" · "+(side==="home"?"casa":"fora");
 const fmt=(value,decimals=0)=>value===null||value===undefined||value===""||!Number.isFinite(Number(value))?"—":Number(value).toFixed(decimals);
 const pair=(home,away,decimals=0)=>fmt(home,decimals)+"–"+fmt(away,decimals);
 const date=value=>{
  if(!value)return "Data indisponível";
  const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?match[3]+"/"+match[2]+"/"+match[1]:String(value);
 };
 if(!recent.length){
  target.innerHTML='<p class="recent-empty">Não foram encontrados jogos desta equipa nesta competição/época.</p>';
 }else{
  target.innerHTML=recent.map(match=>{
   const isHome=wdwTeamKey(match.home)===key;
   const venue=isHome?"Casa":"Fora";
   const stats=[
    ["Cantos",pair(match.hc,match.ac)],
    ["Remates",pair(match.homeShots,match.awayShots)],
    ["À baliza",pair(match.homeTarget,match.awayTarget)],
    ["Faltas",pair(match.homeFouls,match.awayFouls)],
    ["Amarelos",pair(match.homeYellow,match.awayYellow)],
    ["xG",pair(match.homeXg,match.awayXg,2)]
   ];
   const available=stats.filter(([,value])=>!value.startsWith("—")&&!value.endsWith("–—")&&!value.startsWith("—–"));
   const hasPair=(home,away)=>home!==null&&home!==undefined&&home!==""&&away!==null&&away!==undefined&&away!=="";
   const periods=[
    hasPair(match.htHome,match.htAway)?"HT "+pair(match.htHome,match.htAway):"",
    hasPair(match.shHome,match.shAway)?"ST "+pair(match.shHome,match.shAway):""
   ].filter(Boolean).join(" · ");
   return '<article class="recent-match">'+
    '<div class="recent-match-top"><span>'+date(match.date)+' · '+venue+'</span><strong>'+fmt(match.hg)+'–'+fmt(match.ag)+'</strong></div>'+
    '<div class="recent-match-teams">'+escapeHtml(match.home)+' <span>vs</span> '+escapeHtml(match.away)+'</div>'+
    (periods?'<div class="recent-periods">'+periods+'</div>':'')+
    (available.length?'<div class="recent-match-stats">'+available.map(([label,value])=>'<span>'+label+' <b>'+value+'</b></span>').join('')+'</div>':'<p class="recent-empty">Estatísticas detalhadas indisponíveis para este jogo.</p>')+
   '</article>';
  }).join("");
 }
 const competition=$("league").selectedOptions?.[0]?.textContent||"Competição selecionada";
 $("recent-competition-label").textContent=competition;
 section.classList.remove("hidden");
}
function applyTeamSelection(side){
 const skipPairCheck=arguments[1]===true;
 const team=$(side==="home"?"homePick":"awayPick").value;
 const suffix=side==="home"?"h":"a";
 const fields=[["goalsFor",suffix+"gFor"],["goalsAgainst",suffix+"gAgainst"],["htGoalsFor",suffix+"htFor"],["htGoalsAgainst",suffix+"htAgainst"],["secondHalfGoalsFor",suffix+"shFor"],["secondHalfGoalsAgainst",suffix+"shAgainst"],["xgFor",suffix+"xgFor"],["xgAgainst",suffix+"xgAgainst"],["cornersFor",suffix+"cFor"],["cornersAgainst",suffix+"cAgainst"],["cornersHtFor",suffix+"chtFor"],["cornersHtAgainst",suffix+"chtAgainst"],["cornersStFor",suffix+"cstFor"],["cornersStAgainst",suffix+"cstAgainst"],["shotsFor",suffix+"shotsFor"],["shotsAgainst",suffix+"shotsAgainst"],["targetFor",suffix+"targetFor"],["targetAgainst",suffix+"targetAgainst"],["foulsFor",suffix+"foulsFor"],["foulsAgainst",suffix+"foulsAgainst"],["yellowFor",suffix+"yellowFor"],["yellowAgainst",suffix+"yellowAgainst"],["redFor",suffix+"redFor"],["redAgainst",suffix+"redAgainst"]];
 if(!team){for(const [,id] of fields)fillInput(id,null);$(side==="home"?"homeName":"awayName").value="";$(side==="home"?"homeNameDisplay":"awayNameDisplay").textContent="—";renderRecentTeamMatches(side);if(!skipPairCheck)$("data-status").textContent="Seleciona as duas equipas para consultar as estatísticas.";return;}
 const venue=side==="home"?"home":"away";
 const coverage={};
 for(const [metric,id] of fields){const values=teamSample(team,venue,metric),avg=mean(values);const minimum=MetricCoverage.minimumFor(metric);const usable=MetricCoverage.hasSufficientSample(values,metric)?avg:null;fillInput(id,usable);coverage[metric]=values.length;}
 $(side==="home"?"homeName":"awayName").value=team;$(side==="home"?"homeNameDisplay":"awayNameDisplay").textContent=team;renderRecentTeamMatches(side);
 const status=$("data-status"),sample=$("sample").value==="all"?"todos os jogos":"últimos "+$("sample").value+" jogos";
 status.textContent=team+" ("+(venue==="home"?"casa":"fora")+") · médias atualizadas · "+sample+".";
 if(!skipPairCheck){
  const other=side==="home"?"away":"home";
  if($(other==="home"?"homePick":"awayPick").value)applyTeamSelection(other,true);
  const details=$("team-coverage-details");
  if(details)details.textContent=enforcePairedTeamCoverage();
 }
 document.body.classList.toggle("match-selected",Boolean($("homePick").value&&$("awayPick").value));
}
/* Filtro de competições por país; os IDs originais das ligas mantêm-se inalterados. */
const COUNTRY_NAMES={
 ENG:"Inglaterra",ESP:"Espanha",GER:"Alemanha",ITA:"Itália",FRA:"França",UEFA:"Internacionais",
 SCO:"Escócia",POR:"Portugal",NED:"Países Baixos",BEL:"Bélgica",TUR:"Turquia",GRE:"Grécia",
 SUI:"Suíça",AUT:"Áustria",DEN:"Dinamarca",SWE:"Suécia",NOR:"Noruega",ROU:"Roménia",
 RUS:"Rússia",IRE:"Irlanda",POL:"Polónia",WAL:"País de Gales",CRO:"Croácia",CZE:"Chéquia",
 UKR:"Ucrânia",CYP:"Chipre",SVK:"Eslováquia",SVN:"Eslovénia",FIN:"Finlândia",KAZ:"Cazaquistão",
 BRA:"Brasil",ARG:"Argentina",MEX:"México",USA:"Estados Unidos",JPN:"Japão",AUS:"Austrália",CHN:"China"
};
const countrySelect=$("country"),leagueSelect=$("league");
const competitionOptions=[...leagueSelect.options].map(option=>option.cloneNode(true));
const countryCodes=[...new Set(competitionOptions.map(option=>option.value.split("_")[0]))];
const initialLeague=leagueSelect.value;
function setCountryCompetitions(preferred){
 const selectedCountry=countrySelect.value;
 const staticAvailable=competitionOptions.filter(option=>option.value.startsWith(selectedCountry+"_")).sort((a,b)=>{
  const rank=value=>{if(value.includes("_CUP_"))return 1000;const match=value.match(/^[A-Z]+_(\\d+)_/);return match?Number(match[1]):500;};
  return rank(a.value)-rank(b.value)||a.textContent.localeCompare(b.textContent,"pt",{numeric:true,sensitivity:"base"});
 });
 const flashAvailable=flashscoreCompetitionState.items.filter(item=>
  selectedCountry.startsWith("FSCOUNTRY|")
   ? item.country===decodeURIComponent(selectedCountry.slice("FSCOUNTRY|".length))
   : item.countryCode===selectedCountry
 );
 leagueSelect.innerHTML="";
 if(staticAvailable.length){
  const group=document.createElement("optgroup");
  group.label="Competições disponíveis";
  staticAvailable.forEach(option=>{
   const copy=option.cloneNode(true);
   copy.textContent=copy.textContent.replace(/^[^—]+—\\s*/,"");
   group.appendChild(copy);
  });
  leagueSelect.appendChild(group);
 }
 if(flashAvailable.length){
  const group=document.createElement("optgroup");
  group.label="Outras competições";
  flashAvailable.forEach(item=>{
   const option=document.createElement("option");
   option.value=item.value;
   option.textContent=item.competition;
   group.appendChild(option);
  });
  leagueSelect.appendChild(group);
 }
 const allOptions=[...leagueSelect.querySelectorAll("option")];
 if(preferred&&allOptions.some(option=>option.value===preferred))leagueSelect.value=preferred;
 else if(allOptions.length)leagueSelect.value=allOptions[0].value;
}
countrySelect.innerHTML=countryCodes.map(code=>'<option value="'+code+'">'+(COUNTRY_NAMES[code]||code)+'</option>').join("");
countrySelect.value=initialLeague.split("_")[0];
setCountryCompetitions(initialLeague);
countrySelect.addEventListener("change",()=>setCountryCompetitions());
$("load-data").addEventListener("click",loadHistoricalData);
$("homePick").addEventListener("change",()=>{applyTeamSelection("home");loadWdwMatchPair();});
$("awayPick").addEventListener("change",()=>{applyTeamSelection("away");loadWdwMatchPair();});
$("sample").addEventListener("change",()=>{if($("homePick").value)applyTeamSelection("home");if($("awayPick").value)applyTeamSelection("away");});

populateFlashscoreCompetitions();

/* A pesquisa só começa quando o utilizador escolhe a competição e carrega em Pesquisar jogos. */

})();