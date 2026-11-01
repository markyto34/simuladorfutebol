(()=>{"use strict";
const $=id=>document.getElementById(id),N=10000;
const num=id=>{const raw=$(id).value.trim();if(raw==="")throw Error("Faltam médias obrigatórias. Carrega os dados históricos e confirma se golos e cantos têm valores para as duas equipas.");const v=Number(raw);if(!Number.isFinite(v)||v<0)throw Error("Confirma os valores numéricos: não podem ser negativos ou vazios.");return v};
const poisson=lambda=>{const limit=Math.exp(-lambda);let k=0,p=1;do{k++;p*=Math.random()}while(p>limit);return k-1};
const gamma=(shape,scale)=>{if(shape<1){return gamma(shape+1,scale)*Math.pow(Math.random(),1/shape)}const d=shape-1/3,c=1/Math.sqrt(9*d);for(;;){let x,v;do{x=normal();v=1+c*x}while(v<=0);v=v*v*v;const u=Math.random();if(u<1-.0331*x*x*x*x||Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return d*v*scale}};
const normal=()=>{let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
const negBin=(mean,disp)=>{if(mean<=0)return 0;const shape=Math.max(.25,1/disp);return poisson(gamma(shape,mean/shape))};
const pct=x=>(100*x/N).toFixed(1)+"%";
function line(label,p){return '<div class="line-item"><span>'+label+'</span><b>'+pct(p)+'</b></div>'}
function simulate(){
 try{
  const h=$("homeName").value.trim()||"Casa",a=$("awayName").value.trim()||"Fora",adv=Number($("adv").value)/100,disp=Number($("disp").value)/100;
  const read=id=>{const raw=$(id).value.trim();if(raw==="")return null;const v=Number(raw);if(!Number.isFinite(v)||v<0)throw Error("Confirma os valores numéricos: não podem ser negativos.");return v;};
  const goalValues=["hgFor","agAgainst","agFor","hgAgainst"].map(read);
  const cornerValues=["hcFor","acAgainst","acFor","hcAgainst"].map(read);
  const hasGoals=goalValues.every(v=>v!==null),hasCorners=cornerValues.every(v=>v!==null);
  const hg=hasGoals?(goalValues[0]+goalValues[1])/2*(1+adv):null;
  const ag=hasGoals?(goalValues[2]+goalValues[3])/2:null;
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
  if(!hasGoals&&!hasCorners&&!extraValues.length)throw Error("Não existem dados suficientes para simular. São necessárias médias completas de golos, cantos ou de outro indicador.");
  let home=0,draw=0,away=0,g15=0,g25=0,g35=0,c85=0,c95=0,c105=0,sumG=0,sumC=0,sumHG=0,sumAG=0,scoreMap={};
  for(let i=0;i<N;i++){
   if(hasGoals){const x=poisson(hg),y=poisson(ag),gt=x+y;sumG+=gt;sumHG+=x;sumAG+=y;if(x>y)home++;else if(x===y)draw++;else away++;if(gt>=2)g15++;if(gt>=3)g25++;if(gt>=4)g35++;const key=x+"-"+y;scoreMap[key]=(scoreMap[key]||0)+1;}
   if(hasCorners){const c=negBin(hc,disp),d=negBin(ac,disp),ct=c+d;sumC+=ct;if(ct>=9)c85++;if(ct>=10)c95++;if(ct>=11)c105++;}
  }
  const noData='<p class="model-note">Sem dados suficientes nesta competição/amostra. O indicador não será estimado.</p>';
  const pct=x=>(100*x/N).toFixed(1)+"%";
  const modal=hasGoals?Object.entries(scoreMap).sort((x,y)=>y[1]-x[1])[0][0]:"Sem dados";
  $("outcomes").innerHTML=hasGoals?[[ "Vitória "+h,home],["Empate",draw],["Vitória "+a,away]].map(([l,p])=>'<div class="bar-row"><div class="bar-label"><span>'+l+'</span><b>'+pct(p)+'</b></div><div class="bar-track"><div class="bar-fill" style="width:'+100*p/N+'%"></div></div></div>').join(""):noData;
  $("meanScore").textContent=hasGoals?(sumHG/N).toFixed(2)+" – "+(sumAG/N).toFixed(2):"Sem dados";
  $("modalScore").textContent=modal;
  $("meanGoals").textContent=hasGoals?(sumG/N).toFixed(2):"—";
  $("meanCorners").textContent=hasCorners?(sumC/N).toFixed(2):"—";
  $("goalMarkets").innerHTML=hasGoals?[line("Mais de 1.5 golos",g15),line("Mais de 2.5 golos",g25),line("Mais de 3.5 golos",g35)].join(""):noData;
  $("cornerMarkets").innerHTML=hasCorners?[line("Mais de 8.5 cantos",c85),line("Mais de 9.5 cantos",c95),line("Mais de 10.5 cantos",c105)].join(""):noData;
  const extraHtml=[];
  for(const item of extraValues){
   const spec=item.spec,values=item.values,homeMean=(values[0]+values[3])/2,awayMean=(values[2]+values[1])/2;
   let hits=spec.thresholds.map(()=>0),sum=0;
   for(let j=0;j<N;j++){const total=negBin(homeMean,spec.dispersion)+negBin(awayMean,spec.dispersion);sum+=total;spec.thresholds.forEach((t,k)=>{if(total>t)hits[k]++;});}
   extraHtml.push('<article class="card extra-result"><small>'+spec.key.toUpperCase()+'</small><div class="big">'+(sum/N).toFixed(2)+'</div><p>média total esperada · casa '+homeMean.toFixed(2)+' / fora '+awayMean.toFixed(2)+'</p>'+spec.thresholds.map((t,k)=>line("Mais de "+t.toFixed(1),hits[k])).join("")+'</article>');
  }
  $("extraMarkets").innerHTML=extraHtml.length?extraHtml.join(""):'<p class="model-note">Sem cobertura suficiente para prever remates, faltas ou cartões. Os indicadores adicionais só são simulados quando a fonte contém as quatro médias necessárias.</p>';
  $("summary").textContent=[hasGoals?"Expectativa de "+(sumG/N).toFixed(2)+" golos ("+h+": "+(sumHG/N).toFixed(2)+"; "+a+": "+(sumAG/N).toFixed(2)+")": "Golos: sem dados suficientes",hasCorners?"Expectativa de "+(sumC/N).toFixed(2)+" cantos":"Cantos: sem dados suficientes",extraHtml.length?"Indicadores adicionais calculados: "+extraValues.map(x=>x.spec.key.toLowerCase()).join(", "):""].filter(Boolean).join(". ")+".";
  $("resultados").classList.remove("hidden");$("resultados").scrollIntoView({behavior:"smooth",block:"start"});
 }catch(e){alert(e.message)}
}
$("run").addEventListener("click",simulate);
$("adv").addEventListener("input",e=>$("advOut").textContent=e.target.value+"%");
$("disp").addEventListener("input",e=>$("dispOut").textContent=e.target.value+"%");
$("reset").addEventListener("click",()=>location.reload());

/* Importação automática baseada no formato CSV já usado no futebol-stats. */
const dataState={matches:[],teams:[],wdwTeams:{},wdwSummaries:{},wdwLeagueLinks:null};
const WDW_PROXY_URL=String(window.SIMULADOR_CONFIG?.windrawwinProxyUrl||"").replace(/\/$/,"");
const WDW_LEAGUES={"POR_1_primeira-liga":"portugal-primeira-liga","ENG_1_premier-league":"england-premier-league","ESP_1_la-liga":"spain-la-liga","ITA_1_serie-a":"italy-serie-a","GER_1_bundesliga":"germany-bundesliga","FRA_1_ligue-1":"france-ligue-1","NED_1_eredivisie":"netherlands-eredivisie","BRA_1_serie-a":"brazil-serie-a","DEN_1_superliga":"denmark-superliga","ENG_5_national-league":"england-national-league","UEFA_1_champions-league":"champions-league","ENG_2_championship":"england-championship","SCO_1_premiership":"scotland-premiership","TUR_1_super-lig":"turkey-super-lig","AUT_1_bundesliga":"austria-bundesliga","SUI_1_super-league":"switzerland-super-league","SWE_1_allsvenskan":"sweden-allsvenskan","ARG_1_liga-profesional":"argentina-liga-profissional","ROU_1_liga-1":"romania-liga-i","WAL_1_cymru-premier":"wales-cymru-premier"};
const WDW_ALIASES={"sporting cp":"sporting lisbon","sporting clube de portugal":"sporting lisbon","academico":"academico viseu","academico viseu":"academico viseu","vitoria":"guimaraes","casa pia":"casa pia atletico","nacional":"nacional madeira","maritimo m":"maritimo","estoril praia":"estoril","gd estoril praia":"estoril"};
const WDW_TEAM_PATHS={"porto":"/results/fc-porto/","estoril":"/results/estoril/"};
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
function parseWdwSummary(doc,team,matches){const body=doc.body?.innerText||"";const btts=body.match(/Both teams score in ([\d.]+)%[\s\S]*?\((\d+) out of (\d+)/i);const over=body.match(/There was over 2\.5 goals in ([\d.]+)%[\s\S]*?\((\d+) out of (\d+)/i);const corners=body.match(/Games involving .+? average ([\d.]+) corners in total\.[\s\S]*?home games average ([\d.]+) corners, and .+?away games average ([\d.]+) corners/i);const poss=matches.map(m=>m.teamHome?m.homePoss:m.awayPoss).filter(v=>v!==null);const sot=matches.map(m=>m.teamHome?m.homeTarget:m.awayTarget).filter(v=>v!==null);const shots=matches.map(m=>{const t=m.teamHome?m.homeTarget:m.awayTarget,o=m.teamHome?m.homeShotsOff:m.awayShotsOff;return t===null||o===null?null:t+o;}).filter(v=>v!==null);const gf=matches.map(m=>m.teamHome?m.hg:m.ag),ga=matches.map(m=>m.teamHome?m.ag:m.hg);const ht=matches.filter(m=>m.htHome!==null&&m.htAway!==null).map(m=>m.htHome+m.htAway);const ht05=ht.length?100*ht.filter(v=>v>=1).length/ht.length:null,ht15=ht.length?100*ht.filter(v=>v>=2).length/ht.length:null;const wins=matches.filter(m=>(m.teamHome?m.hg>m.ag:m.ag>m.hg)).length,draws=matches.filter(m=>m.hg===m.ag).length,losses=matches.length-wins-draws;const clean=matches.filter(m=>(m.teamHome?m.ag:m.hg)===0).length;const both=matches.filter(m=>m.hg>0&&m.ag>0).length;const over25Rows=matches.filter(m=>m.hg+m.ag>2).length;const form=matches.slice(0,5).map(m=>{const f=m.teamHome?m.hg:m.ag,a=m.teamHome?m.ag:m.hg;return f>a?"V":f===a?"E":"D";}).join(" ");return {btts:btts?Number(btts[1]):(matches.length?100*both/matches.length:null),bttsCount:btts?Number(btts[2]):both,bttsPlayed:btts?Number(btts[3]):matches.length,over25:over?Number(over[1]):(matches.length?100*over25Rows/matches.length:null),over25Count:over?Number(over[2]):over25Rows,over25Played:over?Number(over[3]):matches.length,cornersTotal:corners?Number(corners[1]):null,cornersHome:corners?Number(corners[2]):null,cornersAway:corners?Number(corners[3]):null,possession:mean(poss),shots:mean(shots),shotsOnTarget:mean(sot),goalsFor:mean(gf),goalsAgainst:mean(ga),htGoals:mean(ht),ht05,ht15,cleanSheets:matches.length?100*clean/matches.length:null,form,wins,draws,losses,sample:matches.length};}
function renderWdwSummary(side,team){const box=$(side==="home"?"wdw-home-data":"wdw-away-data");if(!box)return;const s=dataState.wdwSummaries[team];if(!s){box.textContent="A aguardar dados WinDrawWin.";return;}const fmt=v=>v===null||!Number.isFinite(v)?"Sem dados":v.toFixed(1)+(v===s.possession?"%":"");const parts=["Amostra recente: "+s.sample+" jogos","Forma (5): "+(s.form||"Sem dados")+" · V/E/D "+s.wins+"/"+s.draws+"/"+s.losses,"Golos marcados/sofridos: "+(s.goalsFor===null?"Sem dados":s.goalsFor.toFixed(2))+" / "+(s.goalsAgainst===null?"Sem dados":s.goalsAgainst.toFixed(2)),"Clean sheets: "+(s.cleanSheets===null?"Sem dados":s.cleanSheets.toFixed(1)+"%"),"Golos na 1.ª parte: "+(s.htGoals===null?"Sem dados":s.htGoals.toFixed(2))+" · O0,5/O1,5 HT: "+(s.ht05===null?"Sem dados":s.ht05.toFixed(1)+"%")+"/"+(s.ht15===null?"Sem dados":s.ht15.toFixed(1)+"%"),"Posse média: "+(s.possession===null?"Sem dados":s.possession.toFixed(1)+"%"),"Remates por jogo: "+(s.shots===null?"Sem dados":s.shots.toFixed(1)),"Remates à baliza: "+(s.shotsOnTarget===null?"Sem dados":s.shotsOnTarget.toFixed(1)),"BTTS: "+(s.btts===null?"Sem dados":s.btts.toFixed(1)+"% ("+s.bttsCount+"/"+s.bttsPlayed+")"),"Mais de 2,5 golos: "+(s.over25===null?"Sem dados":s.over25.toFixed(1)+"% ("+s.over25Count+"/"+s.over25Played+")"),"Cantos totais/jogo: "+(s.cornersTotal===null?"Sem dados":s.cornersTotal.toFixed(2)),"Cantos em casa/fora: "+(s.cornersHome===null||s.cornersAway===null?"Sem dados":s.cornersHome.toFixed(2)+" / "+s.cornersAway.toFixed(2))];box.textContent=parts.join(" · ");}
function wdwDateKey(raw){const m=String(raw||"").match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b/i);if(!m)return "";const months={jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};const month=months[m[2].slice(0,3).toLowerCase()];return month?month+"-"+m[1].padStart(2,"0"):"";}function parseWdwMatchRows(doc,team){const out=[];const heading=doc.querySelector("h1")?.textContent?.replace(/ Results.*$/i,"").trim()||team;const rows=[...doc.querySelectorAll("tr")];for(const tr of rows){const cells=[...tr.cells].map(c=>c.textContent.replace(/\s+/g," ").trim());if(cells.length<14)continue;const dateKey=wdwDateKey(cells[0]);const fixture=cells[1]||"";if(!/\s+v\s+/i.test(fixture))continue;const parts=fixture.split(/\s+v\s+/i);if(parts.length!==2)continue;const home=parts[0].trim(),away=parts[1].trim(),score=(cells[2]||"").match(/^(\d+)\s*[-:]\s*(\d+)$/),htScore=(cells[3]||"").match(/^(\d+)\s*[-:]\s*(\d+)$/);if(!score)continue;const h=(v)=>{const s=String(v||"").trim().replace("%","").replace(",",".");if(!s||/no additional|^[-—]$/i.test(s))return null;const n=Number(s);return Number.isFinite(n)&&n>=0?n:null;};const vals=cells.slice(4,14).map(h);if(vals.length<10)continue;const teamIsHome=wdwTeamKey(home)===wdwTeamKey(heading)||wdwTeamKey(home)===wdwTeamKey(team);const teamIsAway=wdwTeamKey(away)===wdwTeamKey(heading)||wdwTeamKey(away)===wdwTeamKey(team);if(!teamIsHome&&!teamIsAway)continue;out.push({dateKey,home,away,hg:Number(score[1]),ag:Number(score[2]),htHome:htScore?Number(htScore[1]):null,htAway:htScore?Number(htScore[2]):null,homePoss:vals[0],homeCorners:vals[1],homeFouls:vals[2],homeTarget:vals[3],homeShotsOff:vals[4],awayPoss:vals[5],awayCorners:vals[6],awayFouls:vals[7],awayTarget:vals[8],awayShotsOff:vals[9],teamHome:teamIsHome,source:"WinDrawWin"});}return out;}
async function findWdwTeamPath(team,leagueId){const slug=WDW_LEAGUES[leagueId];if(!slug)return null;if(!dataState.wdwLeagueLinks){const doc=await fetchWdwPage("/tips/"+slug+"/");dataState.wdwLeagueLinks=[...doc.querySelectorAll('a[href^="/results/"]')].map(a=>({name:a.textContent.trim().replace(/\s+Results\s*$/i,"").trim(),href:a.getAttribute("href")})).filter(x=>x.name&&x.href);}const wanted=wdwTeamKey(team);let hit=dataState.wdwLeagueLinks.find(x=>wdwTeamKey(x.name)===wanted);if(!hit){const aliases=Object.entries(WDW_ALIASES).filter(([k,v])=>wdwTeamKey(k)===wanted||wdwTeamKey(v)===wanted).map(([,v])=>wdwTeamKey(v));hit=dataState.wdwLeagueLinks.find(x=>aliases.includes(wdwTeamKey(x.name)));}return hit?.href||WDW_TEAM_PATHS[wanted]||null;}
async function loadWdwTeam(side){const team=$(side==="home"?"homePick":"awayPick").value;if(!team)return;const status=$("wdw-status");if(dataState.wdwTeams[team]){applyTeamSelection(side);renderWdwSummary(side,team);status.textContent="WinDrawWin: dados em cache para "+team+" ("+dataState.wdwTeams[team].length+" jogos).";return;}if(!WDW_PROXY_URL){status.textContent="WinDrawWin: proxy criado, mas ainda falta publicar/configurar o endereço do Worker.";return;}const league=$( "league").value;try{const path=await findWdwTeamPath(team,league);if(!path){status.textContent="WinDrawWin: ainda não existe mapeamento verificado para esta competição/equipa.";return;}const doc=await fetchWdwPage(path);const matches=parseWdwMatchRows(doc,team);if(!matches.length){status.textContent="WinDrawWin: página encontrada, mas sem estatísticas numéricas reconhecidas para "+team+".";return;}dataState.wdwTeams[team]=matches;dataState.wdwSummaries[team]=parseWdwSummary(doc,team,matches);applyTeamSelection(side);renderWdwSummary(side,team);status.textContent="WinDrawWin: "+matches.length+" jogos recentes lidos para "+team+". Estatísticas adicionais serão usadas quando a fonte principal não tiver cobertura.";}catch(e){status.textContent="WinDrawWin: "+e.message;}}

function parseSourceCSV(text){
 const rows=[];let row=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===","){row.push(field);field="";}else if(c==="\n"){row.push(field);rows.push(row);row=[];field="";}else if(c!=="\r")field+=c;}
 if(field||row.length){row.push(field);rows.push(row);}if(!rows.length)return [];
 const headers=rows.shift().map(x=>x.trim().replace(/^\uFEFF/,""));
 return rows.filter(r=>r.some(v=>String(v).trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||"").trim()])));
}
function sourceVal(row,names){for(const n of names){const key=Object.keys(row).find(k=>k.toLowerCase()===n.toLowerCase());if(key&&row[key]!=="")return row[key];}return "";}
function sourceNum(row,names){const raw=String(sourceVal(row,names)).trim().replace(/\s/g,"").replace(",",".");if(!raw)return null;const n=Number(raw);return Number.isFinite(n)&&n>=0?n:null;}
function sourceDate(raw){const s=String(raw||"").trim();let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);if(m)return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");const d=new Date(s);return Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10);}
function normalizeSourceMatch(r){const home=sourceVal(r,["home","home_team","HomeTeam"]),away=sourceVal(r,["away","away_team","AwayTeam"]);const hg=sourceNum(r,["ft_home","home_score","home_goals","FTHG"]),ag=sourceNum(r,["ft_away","away_score","away_goals","FTAG"]);if(!home||!away||hg===null||ag===null)return null;return {date:sourceDate(sourceVal(r,["date","match_date","Date"])),home,away,hg,ag,htHome:sourceNum(r,["ht_home"]),htAway:sourceNum(r,["ht_away"]),hc:sourceNum(r,["home_corners","HomeCorners","HC","home_corner"]),ac:sourceNum(r,["away_corners","AwayCorners","AC","away_corner"]),homeShots:sourceNum(r,["home_shots"]),awayShots:sourceNum(r,["away_shots"]),homeTarget:sourceNum(r,["home_target"]),awayTarget:sourceNum(r,["away_target"]),homeFouls:sourceNum(r,["home_fouls"]),awayFouls:sourceNum(r,["away_fouls"]),homeYellow:sourceNum(r,["home_yellow"]),awayYellow:sourceNum(r,["away_yellow"]),homeRed:sourceNum(r,["home_red"]),awayRed:sourceNum(r,["away_red"])};}
const DATA_CACHE_DB="simulador-futebol-cache";
const DATA_CACHE_STORE="resources";
const DATA_CACHE_TTL=24*60*60*1000;
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
 const persistent=await readDataCache(key);
 if(persistent&&Date.now()-persistent.at<DATA_CACHE_TTL&&typeof persistent.text==="string")return persistent.text;
 try{const cached=sessionStorage.getItem(key);if(cached){const c=JSON.parse(cached);if(c&&Date.now()-c.at<900000&&typeof c.text==="string")return c.text;}}catch(e){}
 const response=await fetch(url);
 if(!response.ok)throw new Error("A fonte respondeu com HTTP "+response.status);
 const text=await response.text();
 await writeDataCache(key,text);
 try{sessionStorage.setItem(key,JSON.stringify({at:Date.now(),text}));}catch(e){}
 return text;
}
async function loadHistoricalData(){
 const status=$("data-status"),button=$("load-data");button.disabled=true;status.textContent="A obter o ficheiro histórico da competição…";
 try{const league=$("league").value,season=$("season").value,url="https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/"+league+"/results_"+season+".csv";const csv=await fetchSourceCSV(url);const matches=parseSourceCSV(csv).map(normalizeSourceMatch).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));if(!matches.length)throw new Error("O ficheiro foi obtido, mas não contém resultados reconhecidos.");
 dataState.matches=matches;dataState.teams=[...new Set(matches.flatMap(m=>[m.home,m.away]))].sort((a,b)=>a.localeCompare(b));for(const id of ["homePick","awayPick"]){const select=$(id);select.innerHTML='<option value="">Escolhe uma equipa</option>'+dataState.teams.map(t=>'<option value="'+t.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'">'+t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</option>').join("");select.disabled=false;}
 status.textContent=matches.length+" jogos históricos válidos carregados; "+dataState.teams.length+" equipas disponíveis. Escolhe as duas equipas para preencher as médias.";applyTeamSelection("home");applyTeamSelection("away");dataState.wdwLeagueLinks=null;dataState.wdwTeams={};dataState.wdwSummaries={};$("wdw-home-data").textContent="A aguardar seleção da equipa da casa."; $("wdw-away-data").textContent="A aguardar seleção da equipa visitante."; $("wdw-status").textContent=WDW_PROXY_URL?"WinDrawWin: à espera da seleção das equipas.":"WinDrawWin: proxy criado; falta publicar e configurar o endereço do Worker.";
 }catch(e){status.textContent="Não foi possível carregar os dados: "+e.message+". A simulação automática fica indisponível até os dados históricos serem carregados.";}finally{button.disabled=false;}
}
function teamSample(team,venue,metric){
 const limit=$("sample").value,requested=limit==="all"?Infinity:Number(limit);
 const games=dataState.matches.filter(m=>(m.home===team||m.away===team)&&(venue==="all"||(venue==="home"&&m.home===team)||(venue==="away"&&m.away===team)));
 const selected=limit==="all"?games:games.slice(0,requested),wdw=dataState.wdwTeams[team]||[];
 const sourceValue=m=>{const h=m.home===team;if(metric==="goalsFor")return h?m.hg:m.ag;if(metric==="goalsAgainst")return h?m.ag:m.hg;if(metric==="cornersFor")return h?m.hc:m.ac;if(metric==="cornersAgainst")return h?m.ac:m.hc;if(metric==="shotsFor")return h?m.homeShots:m.awayShots;if(metric==="shotsAgainst")return h?m.awayShots:m.homeShots;if(metric==="targetFor")return h?m.homeTarget:m.awayTarget;if(metric==="targetAgainst")return h?m.awayTarget:m.homeTarget;if(metric==="foulsFor")return h?m.homeFouls:m.awayFouls;if(metric==="foulsAgainst")return h?m.awayFouls:m.homeFouls;if(metric==="yellowFor")return h?m.homeYellow:m.awayYellow;if(metric==="yellowAgainst")return h?m.awayYellow:m.homeYellow;if(metric==="redFor")return h?m.homeRed:m.awayRed;return h?m.awayRed:m.homeRed;};
 const wdwValue=m=>{const h=m.teamHome;if(metric==="goalsFor")return h?m.hg:m.ag;if(metric==="goalsAgainst")return h?m.ag:m.hg;if(metric==="cornersFor")return h?m.homeCorners:m.awayCorners;if(metric==="cornersAgainst")return h?m.awayCorners:m.homeCorners;if(metric==="shotsFor")return h?(m.homeTarget===null||m.homeShotsOff===null?null:m.homeTarget+m.homeShotsOff):(m.awayTarget===null||m.awayShotsOff===null?null:m.awayTarget+m.awayShotsOff);if(metric==="shotsAgainst")return h?(m.awayTarget===null||m.awayShotsOff===null?null:m.awayTarget+m.awayShotsOff):(m.homeTarget===null||m.homeShotsOff===null?null:m.homeTarget+m.homeShotsOff);if(metric==="targetFor")return h?m.homeTarget:m.awayTarget;if(metric==="targetAgainst")return h?m.awayTarget:m.homeTarget;if(metric==="foulsFor")return h?m.homeFouls:m.awayFouls;if(metric==="foulsAgainst")return h?m.awayFouls:m.homeFouls;return null;};
 const matching=m=>{const h=m.home===team,op=h?m.away:m.home,gf=h?m.hg:m.ag,ga=h?m.ag:m.hg;return wdw.find(w=>w.teamHome===h&&wdwTeamKey(w.teamHome?w.away:w.home)===wdwTeamKey(op)&&(w.teamHome?w.hg:w.ag)===gf&&(w.teamHome?w.ag:w.hg)===ga&&(!w.dateKey||!m.date||w.dateKey===m.date.slice(5)));};
 if(selected.length)return selected.map(m=>{const primary=sourceValue(m);if(primary!==null&&primary!==undefined)return primary;const match=matching(m);return match?wdwValue(match):null;}).filter(v=>v!==null&&v!==undefined);
 let fallback=wdw.filter(m=>venue==="all"||(venue==="home"&&m.teamHome)||(venue==="away"&&!m.teamHome));if(limit!=="all")fallback=fallback.slice(0,requested);return fallback.map(wdwValue).filter(v=>v!==null&&v!==undefined);
}
function mean(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function fillInput(id,value){const display=$(id+"Display");if(value!==null&&Number.isFinite(value)){$(id).value=value.toFixed(2);if(display)display.textContent=value.toFixed(2);}else{$(id).value="";if(display)display.textContent="Sem dados";}}
function applyTeamSelection(side){
 const team=$(side==="home"?"homePick":"awayPick").value;if(!team)return;
 const venue=side==="home"?"home":"away",suffix=side==="home"?"h":"a";
 const fields=[["goalsFor",suffix+"gFor"],["goalsAgainst",suffix+"gAgainst"],["cornersFor",suffix+"cFor"],["cornersAgainst",suffix+"cAgainst"],["shotsFor",suffix+"shotsFor"],["shotsAgainst",suffix+"shotsAgainst"],["targetFor",suffix+"targetFor"],["targetAgainst",suffix+"targetAgainst"],["foulsFor",suffix+"foulsFor"],["foulsAgainst",suffix+"foulsAgainst"],["yellowFor",suffix+"yellowFor"],["yellowAgainst",suffix+"yellowAgainst"],["redFor",suffix+"redFor"],["redAgainst",suffix+"redAgainst"]];
 const coverage={};
 for(const [metric,id] of fields){const values=teamSample(team,venue,metric),avg=mean(values);fillInput(id,avg);coverage[metric]=values.length;}
 $(side==="home"?"homeName":"awayName").value=team;$(side==="home"?"homeNameDisplay":"awayNameDisplay").textContent=team;
 const status=$("data-status"),sample=$("sample").value==="all"?"todos os jogos":"últimos "+$("sample").value+" jogos";
 const count=(a,b)=>Math.min(coverage[a]||0,coverage[b]||0);
 status.textContent=team+": médias "+(venue==="home"?"em casa":"fora")+" preenchidas. Amostras — golos: "+count("goalsFor","goalsAgainst")+"; cantos: "+count("cornersFor","cornersAgainst")+"; remates: "+count("shotsFor","shotsAgainst")+"; remates à baliza: "+count("targetFor","targetAgainst")+"; faltas: "+count("foulsFor","foulsAgainst")+"; amarelos: "+count("yellowFor","yellowAgainst")+"; vermelhos: "+count("redFor","redAgainst")+". Janela: "+sample+". Campos sem cobertura ficam indisponíveis; não são substituídos por zeros.";
}
$("load-data").addEventListener("click",loadHistoricalData);
$("homePick").addEventListener("change",()=>{$("wdw-home-data").textContent="A consultar dados WinDrawWin…";applyTeamSelection("home");loadWdwTeam("home");});
$("awayPick").addEventListener("change",()=>{$("wdw-away-data").textContent="A consultar dados WinDrawWin…";applyTeamSelection("away");loadWdwTeam("away");});
$("sample").addEventListener("change",()=>{if($("homePick").value)applyTeamSelection("home");if($("awayPick").value)applyTeamSelection("away");});

/* Atualiza a base automaticamente ao abrir a aplicação. */
loadHistoricalData();

})();