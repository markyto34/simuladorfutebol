(()=>{"use strict";
const $=id=>document.getElementById(id),N=10000;
const num=id=>{const v=Number($(id).value);if(!Number.isFinite(v)||v<0)throw Error("Confirma os valores numéricos: não podem ser negativos ou vazios.");return v};
const poisson=lambda=>{const limit=Math.exp(-lambda);let k=0,p=1;do{k++;p*=Math.random()}while(p>limit);return k-1};
const gamma=(shape,scale)=>{if(shape<1){return gamma(shape+1,scale)*Math.pow(Math.random(),1/shape)}const d=shape-1/3,c=1/Math.sqrt(9*d);for(;;){let x,v;do{x=normal();v=1+c*x}while(v<=0);v=v*v*v;const u=Math.random();if(u<1-.0331*x*x*x*x||Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return d*v*scale}};
const normal=()=>{let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
const negBin=(mean,disp)=>{if(mean<=0)return 0;const shape=Math.max(.25,1/disp);return poisson(gamma(shape,mean/shape))};
const pct=x=>(100*x/N).toFixed(1)+"%";
function line(label,p){return '<div class="line-item"><span>'+label+'</span><b>'+pct(p)+'</b></div>'}
function simulate(){try{
const h=$( "homeName").value.trim()||"Casa",a=$("awayName").value.trim()||"Fora",adv=num("adv")/100,disp=num("disp")/100;
const hg=(num("hgFor")+num("agAgainst"))/2*(1+adv),ag=(num("agFor")+num("hgAgainst"))/2;
const hc=(num("hcFor")+num("acAgainst"))/2,ac=(num("acFor")+num("hcAgainst"))/2;
if([hg,ag,hc,ac].some(x=>x>30))throw Error("Uma média introduzida é demasiado elevada. Verifica os dados.");
let home=0,draw=0,away=0,g15=0,g25=0,g35=0,c85=0,c95=0,c105=0,sumG=0,sumC=0,sumHG=0,sumAG=0,scoreMap={};
for(let i=0;i<N;i++){const x=poisson(hg),y=poisson(ag),c=negBin(hc,disp),d=negBin(ac,disp),gt=x+y,ct=c+d;sumG+=gt;sumC+=ct;sumHG+=x;sumAG+=y;if(x>y)home++;else if(x===y)draw++;else away++;if(gt>=2)g15++;if(gt>=3)g25++;if(gt>=4)g35++;if(ct>=9)c85++;if(ct>=10)c95++;if(ct>=11)c105++;const key=x+"-"+y;scoreMap[key]=(scoreMap[key]||0)+1}
const modal=Object.entries(scoreMap).sort((x,y)=>y[1]-x[1])[0][0],mean=(sumHG/N).toFixed(2)+" – "+(sumAG/N).toFixed(2);
$("outcomes").innerHTML=[["Vitória "+h,home],["Empate",draw],["Vitória "+a,away]].map(([l,p])=>'<div class="bar-row"><div class="bar-label"><span>'+l+'</span><b>'+pct(p)+'</b></div><div class="bar-track"><div class="bar-fill" style="width:'+100*p/N+'%"></div></div></div>').join("");
$("meanScore").textContent=mean;$("modalScore").textContent=modal;$("meanGoals").textContent=(sumG/N).toFixed(2);$("meanCorners").textContent=(sumC/N).toFixed(2);
$("goalMarkets").innerHTML=[line("Mais de 1.5 golos",g15),line("Mais de 2.5 golos",g25),line("Mais de 3.5 golos",g35)].join("");
$("cornerMarkets").innerHTML=[line("Mais de 8.5 cantos",c85),line("Mais de 9.5 cantos",c95),line("Mais de 10.5 cantos",c105)].join("");
$("summary").textContent="Com as médias introduzidas, a expectativa do modelo é de "+(sumG/N).toFixed(2)+" golos e "+(sumC/N).toFixed(2)+" cantos. "+h+": "+(sumHG/N).toFixed(2)+" golos esperados; "+a+": "+(sumAG/N).toFixed(2)+".";
$("resultados").classList.remove("hidden");$("resultados").scrollIntoView({behavior:"smooth",block:"start"});
}catch(e){alert(e.message)}}
$("run").addEventListener("click",simulate);
$("adv").addEventListener("input",e=>$("advOut").textContent=e.target.value+"%");
$("disp").addEventListener("input",e=>$("dispOut").textContent=e.target.value+"%");
$("reset").addEventListener("click",()=>location.reload());

/* Importação automática baseada no formato CSV já usado no futebol-stats. */
const dataState={matches:[],teams:[]};
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
async function fetchSourceCSV(url){const key="simulador-futebol:"+url;try{const cached=sessionStorage.getItem(key);if(cached){const c=JSON.parse(cached);if(c&&Date.now()-c.at<900000&&typeof c.text==="string")return c.text;}}catch(e){}const response=await fetch(url);if(!response.ok)throw new Error("A fonte respondeu com HTTP "+response.status);const text=await response.text();try{sessionStorage.setItem(key,JSON.stringify({at:Date.now(),text}));}catch(e){}return text;}
async function loadHistoricalData(){
 const status=$("data-status"),button=$("load-data");button.disabled=true;status.textContent="A obter o ficheiro histórico da competição…";
 try{const league=$("league").value,season=$("season").value,url="https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/"+league+"/results_"+season+".csv";const csv=await fetchSourceCSV(url);const matches=parseSourceCSV(csv).map(normalizeSourceMatch).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));if(!matches.length)throw new Error("O ficheiro foi obtido, mas não contém resultados reconhecidos.");
 dataState.matches=matches;dataState.teams=[...new Set(matches.flatMap(m=>[m.home,m.away]))].sort((a,b)=>a.localeCompare(b));for(const id of ["homePick","awayPick"]){const select=$(id);select.innerHTML='<option value="">Escolhe uma equipa</option>'+dataState.teams.map(t=>'<option value="'+t.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'">'+t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</option>').join("");select.disabled=false;}
 status.textContent=matches.length+" jogos históricos válidos carregados; "+dataState.teams.length+" equipas disponíveis. Escolhe as duas equipas para preencher as médias.";applyTeamSelection("home");applyTeamSelection("away");
 }catch(e){status.textContent="Não foi possível carregar os dados: "+e.message+". Podes continuar a usar a entrada manual.";}finally{button.disabled=false;}
}
function teamSample(team,venue,metric){let games=dataState.matches.filter(m=>(m.home===team||m.away===team)&&(venue==="all"||(venue==="home"&&m.home===team)||(venue==="away"&&m.away===team)));const limit=$("sample").value;if(limit!=="all")games=games.slice(0,Number(limit));return games.map(m=>{const home=m.home===team;if(metric==="goalsFor")return home?m.hg:m.ag;if(metric==="goalsAgainst")return home?m.ag:m.hg;if(metric==="cornersFor")return home?m.hc:m.ac;if(metric==="cornersAgainst")return home?m.ac:m.hc;if(metric==="shotsFor")return home?m.homeShots:m.awayShots;if(metric==="shotsAgainst")return home?m.awayShots:m.homeShots;if(metric==="targetFor")return home?m.homeTarget:m.awayTarget;if(metric==="targetAgainst")return home?m.awayTarget:m.homeTarget;if(metric==="foulsFor")return home?m.homeFouls:m.awayFouls;if(metric==="foulsAgainst")return home?m.awayFouls:m.homeFouls;if(metric==="yellowFor")return home?m.homeYellow:m.awayYellow;if(metric==="yellowAgainst")return home?m.awayYellow:m.homeYellow;if(metric==="redFor")return home?m.homeRed:m.awayRed;if(metric==="redAgainst")return home?m.awayRed:m.homeRed;}).filter(v=>v!==null&&v!==undefined);}
function mean(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function fillInput(id,value){if(value!==null&&Number.isFinite(value))$(id).value=value.toFixed(2);}
function applyTeamSelection(side){
 const team=$(side==="home"?"homePick":"awayPick").value;if(!team)return;
 const venue=side==="home"?"home":"away",suffix=side==="home"?"h":"a";
 const fields=[["goalsFor",suffix+"gFor"],["goalsAgainst",suffix+"gAgainst"],["cornersFor",suffix+"cFor"],["cornersAgainst",suffix+"cAgainst"],["shotsFor",suffix+"shotsFor"],["shotsAgainst",suffix+"shotsAgainst"],["targetFor",suffix+"targetFor"],["targetAgainst",suffix+"targetAgainst"],["foulsFor",suffix+"foulsFor"],["foulsAgainst",suffix+"foulsAgainst"],["yellowFor",suffix+"yellowFor"],["yellowAgainst",suffix+"yellowAgainst"],["redFor",suffix+"redFor"],["redAgainst",suffix+"redAgainst"]];
 const coverage={};
 for(const [metric,id] of fields){const values=teamSample(team,venue,metric),avg=mean(values);if(avg!==null)fillInput(id,avg);else $(id).value="";coverage[metric]=values.length;}
 $(side==="home"?"homeName":"awayName").value=team;
 const status=$("data-status"),sample=$("sample").value==="all"?"todos os jogos":"últimos "+$("sample").value+" jogos";
 const count=(a,b)=>Math.min(coverage[a]||0,coverage[b]||0);
 status.textContent=team+": médias "+(venue==="home"?"em casa":"fora")+" preenchidas. Amostras — golos: "+count("goalsFor","goalsAgainst")+"; cantos: "+count("cornersFor","cornersAgainst")+"; remates: "+count("shotsFor","shotsAgainst")+"; remates à baliza: "+count("targetFor","targetAgainst")+"; faltas: "+count("foulsFor","foulsAgainst")+"; amarelos: "+count("yellowFor","yellowAgainst")+"; vermelhos: "+count("redFor","redAgainst")+". Janela: "+sample+". Campos sem dados continuam editáveis.
}
$("load-data").addEventListener("click",loadHistoricalData);
$("homePick").addEventListener("change",()=>applyTeamSelection("home"));
$("awayPick").addEventListener("change",()=>applyTeamSelection("away"));
$("sample").addEventListener("change",()=>{if($("homePick").value)applyTeamSelection("home");if($("awayPick").value)applyTeamSelection("away");});

/* Atualiza a base automaticamente ao abrir a aplicação. */
loadHistoricalData();

})();