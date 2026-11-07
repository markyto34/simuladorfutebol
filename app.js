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
  const hg=hasGoalHistory?(goalValues[0]+goalValues[1])/2:null;
  const ag=hasGoalHistory?(goalValues[2]+goalValues[3])/2:null;
  const hc=hasCorners?(cornerValues[0]+cornerValues[1])/2:null;
  const ac=hasCorners?(cornerValues[2]+cornerValues[3])/2:null;
  if([hg,ag,hc,ac].some(x=>x!==null&&x>30))throw Error("Os dados históricos apresentam uma média fora do intervalo esperado.");
  const extraSpecs=[
   {key:"Cantos HT",ids:["hchtFor","hchtAgainst","achtFor","achtAgainst"],thresholds:[3.5,4.5,5.5],dispersion:.45},
   {key:"Cantos ST",ids:["hcstFor","hcstAgainst","acstFor","acstAgainst"],thresholds:[3.5,4.5,5.5],dispersion:.45},
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
  $("summary").textContent=[hasGoals?"Expectativa de "+(sumG/N).toFixed(2)+" golos ("+h+": "+(sumHG/N).toFixed(2)+"; "+a+": "+(sumAG/N).toFixed(2)+")": "Golos: sem dados suficientes",hasGoals?"BTTS estimado: "+pct(btts):"",hasHalfTime?"Over 0,5 HT estimado: "+pct(ht05):"Over 0,5 HT: sem dados suficientes",hasSecondHalf?"Over 0,5 ST estimado: "+pct(sh05):"Over 0,5 ST: sem dados suficientes",hasCorners?"Expectativa de "+(sumC/N).toFixed(2)+" cantos":"Cantos: sem dados suficientes","Simulação reproduzível: os mesmos dados geram os mesmos resultados.",extraHtml.length?"Indicadores adicionais calculados: "+extraValues.map(x=>x.spec.key.toLowerCase()).join(", "):""].filter(Boolean).join(". ")+".";
  $("resultados").classList.remove("hidden");
 }catch(e){random=Math.random;const status=$("data-status");if(status)status.textContent=e.message;}
}
$("reset").addEventListener("click",()=>location.reload());

/* Importação automática baseada no formato CSV já usado no futebol-stats. */
const dataState={matches:[],teams:[]};
let historicalLoadSequence=0;
function normalizeTeamName(value){
 return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
  .replace(/\b(fc|cf|sc|afc|club|clube|de|the)\b/g," ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
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
 const htHome=sourceNum(r,["ht_home"]),htAway=sourceNum(r,["ht_away"]);
 const rawShHome=sourceNum(r,["sh_home"]),rawShAway=sourceNum(r,["sh_away"]);
 const derive=window.FootballDataEnrichment?.deriveSecondHalfGoals;
 return {date:sourceDate(sourceVal(r,["date_time"])),home,away,hg,ag,
  htHome,htAway,
  shHome:rawShHome!==null?rawShHome:(derive?derive(hg,htHome):null),
  shAway:rawShAway!==null?rawShAway:(derive?derive(ag,htAway):null),
  hc:sourceNum(r,["corners_home"]),ac:sourceNum(r,["corners_away"]),
  homeShots:sourceNum(r,["shots_home"]),awayShots:sourceNum(r,["shots_away"]),
  homeTarget:sourceNum(r,["shots_on_target_home"]),awayTarget:sourceNum(r,["shots_on_target_away"]),
  homeFouls:sourceNum(r,["fouls_home"]),awayFouls:sourceNum(r,["fouls_away"]),
  homeYellow:sourceNum(r,["yellow_cards_home"]),awayYellow:sourceNum(r,["yellow_cards_away"]),
  homeRed:sourceNum(r,["red_cards_home"]),awayRed:sourceNum(r,["red_cards_away"]),
  homeCornersHt:sourceNum(r,["corners_ht_home"]),awayCornersHt:sourceNum(r,["corners_ht_away"]),
  homeCornersSt:sourceNum(r,["corners_st_home"]),awayCornersSt:sourceNum(r,["corners_st_away"]),
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
  const flashCountries=[...new Set(flashscoreCompetitionState.items.map(item=>item.country))]
   .sort((a,b)=>a.localeCompare(b,"pt"));
  countrySelect.innerHTML=flashCountries.map(country=>'<option value="FSCOUNTRY|'+encodeURIComponent(country)+'">'+country+'</option>').join("");
  const preferredCountry=flashCountries.includes("Portugal")?"Portugal":flashCountries[0];
  if(preferredCountry)countrySelect.value="FSCOUNTRY|"+encodeURIComponent(preferredCountry);
  setCountryCompetitions();
 }catch(error){console.warn("Não foi possível carregar o índice de competições completas:",error);}
}

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
 const requestId=++historicalLoadSequence;
 const status=$("data-status"),button=$("load-data");button.disabled=true;
 dataState.matches=[];dataState.teams=[];
 document.body.classList.remove("data-loaded","match-selected");$("recent-matches")?.classList.add("hidden");
 for(const id of ["homePick","awayPick"]){const select=$(id);select.value="";select.innerHTML='<option value="">A carregar nova pesquisa…</option>';select.disabled=true;}
 for(const id of TEAM_METRIC_PAIRS.flatMap(([,homeId,awayId])=>[homeId,awayId]))fillInput(id,null);
 $("homeName").value="";$("awayName").value="";$("homeNameDisplay").textContent="—";$("awayNameDisplay").textContent="—";
 $("resultados").classList.add("hidden");
 status.textContent="A obter os dados históricos do Flashscore…";
 if($("data-coverage"))$("data-coverage").textContent="A verificar a cobertura real das estatísticas…";
 try{
  const league=$("league").value;
  if(!league.startsWith("FS|"))throw new Error("Seleciona uma competição disponível no índice Flashscore.");
  const [,countryEncoded,competitionEncoded]=league.split("|");
  const country=decodeURIComponent(countryEncoded||""),competition=decodeURIComponent(competitionEncoded||"");
  const selectedFlashCompetition=flashscoreCompetitionState.items.find(item=>item.value===league);
  const acceptedLabels=new Set([country+" / "+competition,...(selectedFlashCompetition?.statsSourceLabels||[])].map(normalizeFlashscoreSourceLabel));
  status.textContent="A carregar os dados de "+country+" — "+competition+"…";
  const csv=await fetchSourceCSV(FLASHSCORE_STATS_CSV_URL);
  const matches=parseSourceCSV(csv)
   .filter(row=>acceptedLabels.has(normalizeFlashscoreSourceLabel(sourceVal(row,["country"])+" / "+sourceVal(row,["competition"]))))
   .map(normalizeFlashscoreMatch).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
  if(!matches.length)throw new Error("A competição não tem jogos concluídos com resultados FT e equipas identificadas.");
  if(requestId!==historicalLoadSequence)return;
  dataState.matches=matches;updateLeagueCoverage(matches);dataState.teams=teamOptionsForSeason(matches);
  document.body.classList.add("data-loaded");document.body.classList.remove("match-selected");
  for(const id of ["homePick","awayPick"]){
   const teamSelect=$(id);
   teamSelect.innerHTML='<option value="">Escolhe uma equipa</option>'+dataState.teams.map(t=>'<option value="'+t.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'">'+t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</option>').join("");
   teamSelect.disabled=dataState.teams.length===0;
  }
  status.textContent="Dados carregados. "+dataState.teams.length+" equipas disponíveis.";
  applyTeamSelection("home");applyTeamSelection("away");
 }catch(e){
  if(requestId===historicalLoadSequence){
   document.body.classList.remove("data-loaded","match-selected");
   status.textContent="Não foi possível carregar os dados do Flashscore. Tenta outra competição ou época.";
   if($("data-coverage"))$("data-coverage").textContent="";
  }
 }finally{if(requestId===historicalLoadSequence)button.disabled=false;}
}
function teamSample(team,venue,metric){
 const limit=$("sample").value,requested=limit==="all"?Infinity:Number(limit);
 const matches=dataState.matches.filter(m=>(m.home===team||m.away===team)&&
  (venue==="all"||(venue==="home"&&m.home===team)||(venue==="away"&&m.away===team)));
 const sourceValue=(m,isHome)=>{
  if(metric==="goalsFor")return isHome?m.hg:m.ag;
  if(metric==="goalsAgainst")return isHome?m.ag:m.hg;
  if(metric==="htGoalsFor")return m.htHome===null||m.htAway===null?null:(isHome?m.htHome:m.htAway);
  if(metric==="htGoalsAgainst")return m.htHome===null||m.htAway===null?null:(isHome?m.htAway:m.htHome);
  if(metric==="secondHalfGoalsFor")return m.shHome===null||m.shAway===null||m.shHome===undefined||m.shAway===undefined?null:(isHome?m.shHome:m.shAway);
  if(metric==="secondHalfGoalsAgainst")return m.shHome===null||m.shAway===null||m.shHome===undefined||m.shAway===undefined?null:(isHome?m.shAway:m.shHome);
  if(metric==="xgFor")return isHome?m.homeXg:m.awayXg;
  if(metric==="xgAgainst")return isHome?m.awayXg:m.homeXg;
  if(metric==="cornersFor")return isHome?m.hc:m.ac;
  if(metric==="cornersAgainst")return isHome?m.ac:m.hc;
  if(metric==="cornersHtFor")return isHome?m.homeCornersHt:m.awayCornersHt;
  if(metric==="cornersHtAgainst")return isHome?m.awayCornersHt:m.homeCornersHt;
  if(metric==="cornersStFor")return isHome?m.homeCornersSt:m.awayCornersSt;
  if(metric==="cornersStAgainst")return isHome?m.awayCornersSt:m.homeCornersSt;
  if(metric==="shotsFor")return isHome?m.homeShots:m.awayShots;
  if(metric==="shotsAgainst")return isHome?m.awayShots:m.homeShots;
  if(metric==="targetFor")return isHome?m.homeTarget:m.awayTarget;
  if(metric==="targetAgainst")return isHome?m.awayTarget:m.homeTarget;
  if(metric==="foulsFor")return isHome?m.homeFouls:m.awayFouls;
  if(metric==="foulsAgainst")return isHome?m.awayFouls:m.homeFouls;
  if(metric==="yellowFor")return isHome?m.homeYellow:m.awayYellow;
  if(metric==="yellowAgainst")return isHome?m.awayYellow:m.homeYellow;
  if(metric==="redFor")return isHome?m.homeRed:m.awayRed;
  return isHome?m.awayRed:m.homeRed;
 };
 const values=matches.map(m=>sourceValue(m,m.home===team)).filter(validMetricSampleValue);
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
 const key=normalizeTeamName(team);
 const recent=dataState.matches
  .filter(match=>normalizeTeamName(match.home)===key||normalizeTeamName(match.away)===key)
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
   const isHome=normalizeTeamName(match.home)===key;
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
 if(!skipPairCheck&&$("homePick").value&&$("awayPick").value)simulate();
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
function setCountryCompetitions(preferred){
 const selectedCountry=countrySelect.value;
 const country=selectedCountry.startsWith("FSCOUNTRY|")
  ?decodeURIComponent(selectedCountry.slice("FSCOUNTRY|".length)):"";
 const flashAvailable=flashscoreCompetitionState.items.filter(item=>item.country===country);
 leagueSelect.innerHTML="";
 flashAvailable.forEach(item=>{
  const option=document.createElement("option");
  option.value=item.value;
  option.textContent=item.competition;
  leagueSelect.appendChild(option);
 });
 const allOptions=[...leagueSelect.querySelectorAll("option")];
 leagueSelect.disabled=allOptions.length===0;
 if(preferred&&allOptions.some(option=>option.value===preferred))leagueSelect.value=preferred;
 else if(allOptions.length)leagueSelect.value=allOptions[0].value;
}
countrySelect.addEventListener("change",()=>setCountryCompetitions());
$("load-data").addEventListener("click",loadHistoricalData);
$("homePick").addEventListener("change",()=>applyTeamSelection("home"));
$("awayPick").addEventListener("change",()=>applyTeamSelection("away"));
$("sample").addEventListener("change",()=>{if($("homePick").value)applyTeamSelection("home");else if($("awayPick").value)applyTeamSelection("away");});

populateFlashscoreCompetitions();

/* A pesquisa só começa quando o utilizador escolhe a competição e carrega em Pesquisar jogos. */

})();