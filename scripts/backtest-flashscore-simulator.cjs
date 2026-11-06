#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
function parseCSV(text){
 const rows=[];let row=[],cell="",quoted=false;text=String(text||"").replace(/^\uFEFF/,"");
 for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(quoted){if(c==='"'&&n==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"'&&cell==="")quoted=true;else if(c===","){row.push(cell);cell="";}else if(c==="\n"||c==="\r"){if(c==="\r"&&n==="\n")i++;row.push(cell);cell="";if(row.some(v=>v!==""))rows.push(row);row=[];}else cell+=c;}
 if(cell!==""||row.length){row.push(cell);if(row.some(v=>v!==""))rows.push(row);}if(!rows.length)return [];
 const headers=rows.shift().map(v=>v.trim());return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??""])));
}
const num=v=>{if(v===null||v===undefined||String(v).trim()==="")return null;const n=Number(String(v).trim().replace(",","."));return Number.isFinite(n)&&n>=0?n:null;};
const dateKey=v=>{const m=String(v||"").match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:"";};
function normalize(rows){
 const seen=new Set(),out=[];
 for(const r of rows){
  const id=String(r.match_id||"").trim();if(id){if(seen.has(id))throw Error("Estatísticas duplicadas para match_id "+id+".");seen.add(id);}
  const m={id,date:dateKey(r.date_time),country:String(r.country||"").trim(),competition:String(r.competition||"").trim(),home:String(r.home_team||"").trim(),away:String(r.away_team||"").trim(),
   hg:num(r.score_home),ag:num(r.score_away),htH:num(r.ht_home),htA:num(r.ht_away),shH:num(r.sh_home),shA:num(r.sh_away),
   xgH:num(r.xg_home),xgA:num(r.xg_away),cornersH:num(r.corners_home),cornersA:num(r.corners_away),
   shotsH:num(r.shots_home),shotsA:num(r.shots_away),targetH:num(r.shots_on_target_home),targetA:num(r.shots_on_target_away),
   foulsH:num(r.fouls_home),foulsA:num(r.fouls_away),yellowH:num(r.yellow_cards_home),yellowA:num(r.yellow_cards_away),redH:num(r.red_cards_home),redA:num(r.red_cards_away)};
  if(m.date&&m.country&&m.competition&&m.home&&m.away&&m.hg!==null&&m.ag!==null)out.push(m);
 }
 return out.sort((a,b)=>a.date.localeCompare(b.date));
}
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
function summary(a){if(!a.length)return {n:0,mae:null,rmse:null,bias:null};return {n:a.length,mae:mean(a.map(Math.abs)),rmse:Math.sqrt(mean(a.map(v=>v*v))),bias:mean(a)};}
function poisson(mu,max=60){const p=Array(max+1).fill(0);p[0]=Math.exp(-mu);for(let k=1;k<max;k++)p[k]=p[k-1]*mu/k;p[max]=Math.max(0,1-p.slice(0,max).reduce((s,v)=>s+v,0));return p;}
function negBin(mu,disp,max=120){const p=Array(max+1).fill(0);if(mu===0){p[0]=1;return p;}const r=1/disp,q=r/(r+mu);p[0]=Math.pow(q,r);for(let k=1;k<max;k++)p[k]=p[k-1]*(k-1+r)/k*(1-q);p[max]=Math.max(0,1-p.slice(0,max).reduce((s,v)=>s+v,0));return p;}
function atLeast(a,b,min){let below=0;for(let i=0;i<min;i++)for(let j=0;j<min-i;j++)below+=(a[i]||0)*(b[j]||0);return Math.max(0,Math.min(1,1-below));}
function goalProb(h,a){const x=poisson(h),y=poisson(a);let home=0,draw=0,away=0;for(let i=0;i<x.length;i++)for(let j=0;j<y.length;j++){const p=x[i]*y[j];if(i>j)home+=p;else if(i===j)draw+=p;else away+=p;}return {home,draw,away,over15:atLeast(x,y,2),over25:atLeast(x,y,3),over35:atLeast(x,y,4),btts:(1-x[0])*(1-y[0])};}
function evaluate(rows,key,actualKey,threshold){
 const use=rows.filter(r=>Number.isFinite(r.p[key])&&Number.isFinite(r.a[actualKey]));if(!use.length)return {n:0,brier:null,logLoss:null,reliability:[]};
 let brier=0,ll=0;const bins=Array.from({length:10},()=>({n:0,p:0,o:0}));
 for(const r of use){const p=Math.max(1e-15,Math.min(1-1e-15,r.p[key])),o=r.a[actualKey]>=threshold?1:0;brier+=(p-o)**2;ll-=o?Math.log(p):Math.log(1-p);const b=bins[Math.min(9,Math.floor(p*10))];b.n++;b.p+=p;b.o+=o;}
 return {n:use.length,brier:brier/use.length,logLoss:ll/use.length,reliability:bins.map((b,i)=>({bin:i,n:b.n,meanPredicted:b.n?b.p/b.n:null,observedFrequency:b.n?b.o/b.n:null})).filter(b=>b.n)};
}
function combineEval(items){const v=items.filter(x=>x&&x.n);const n=v.reduce((s,x)=>s+x.n,0);if(!n)return {n:0,brier:null,logLoss:null,reliability:[]};const bins=Array.from({length:10},()=>({n:0,p:0,o:0}));for(const x of v)for(const b of x.reliability||[]){bins[b.bin].n+=b.n;bins[b.bin].p+=b.meanPredicted*b.n;bins[b.bin].o+=b.observedFrequency*b.n;}return {n,brier:v.reduce((s,x)=>s+x.brier*x.n,0)/n,logLoss:v.reduce((s,x)=>s+x.logLoss*x.n,0)/n,reliability:bins.map((b,i)=>({bin:i,n:b.n,meanPredicted:b.n?b.p/b.n:null,observedFrequency:b.n?b.o/b.n:null})).filter(b=>b.n)};}
function combineSummary(items){const v=items.filter(x=>x&&x.n),n=v.reduce((s,x)=>s+x.n,0);if(!n)return {n:0,mae:null,rmse:null,bias:null};return {n,mae:v.reduce((s,x)=>s+x.mae*x.n,0)/n,rmse:Math.sqrt(v.reduce((s,x)=>s+x.rmse*x.rmse*x.n,0)/n),bias:v.reduce((s,x)=>s+x.bias*x.n,0)/n};}
const SPECS={
 corners:{h:"cornersH",a:"cornersA",d:.45,lines:[8.5,9.5,10.5]},
 shots:{h:"shotsH",a:"shotsA",d:.22,lines:[19.5,21.5,23.5]},
 target:{h:"targetH",a:"targetA",d:.28,lines:[5.5,7.5,9.5]},
 fouls:{h:"foulsH",a:"foulsA",d:.22,lines:[19.5,21.5,23.5]},
 yellow:{h:"yellowH",a:"yellowA",d:.45,lines:[2.5,3.5,4.5]},
 red:{h:"redH",a:"redA",d:.7,lines:[.5,1.5]}
};
const MIN=3,MIN_XG=5;
function makeHistory(){return {gf:[],ga:[],xgf:[],xga:[],htf:[],hta:[],shf:[],sha:[],stats:Object.fromEntries(Object.keys(SPECS).map(k=>[k,{f:[],a:[]}]))};}
function push(a,v,n){if(Number.isFinite(v)){a.push(v);if(a.length>n)a.shift();}}
function historyKey(m,team,venue){return [m.country,m.competition,venue,team].join("\u0000");}
function getHistory(map,m,team,venue){const k=historyKey(m,team,venue);if(!map.has(k))map.set(k,makeHistory());return map.get(k);}
function goalsModel(h,a){if(![h.gf,h.ga,a.gf,a.ga].every(x=>x.length>=MIN))return null;let hm=(mean(h.gf)+mean(a.ga))/2,am=(mean(a.gf)+mean(h.ga))/2;const useXg=[h.xgf,h.xga,a.xgf,a.xga].every(x=>x.length>=MIN_XG);if(useXg){hm=.65*hm+.35*(mean(h.xgf)+mean(a.xga))/2;am=.65*am+.35*(mean(a.xgf)+mean(h.xga))/2;}return {hm,am,useXg};}
function statModel(h,a,key){const x=h.stats[key],y=a.stats[key];if(![x.f,x.a,y.f,y.a].every(v=>v.length>=MIN))return null;return {hm:(mean(x.f)+mean(y.a))/2,am:(mean(y.f)+mean(x.a))/2,d:SPECS[key].d};}
function periodModel(h,a,period){const hf=period==="ht"?h.htf:h.shf,ha=period==="ht"?h.hta:h.sha,af=period==="ht"?a.htf:a.shf,aa=period==="ht"?a.hta:a.sha;if(![hf,ha,af,aa].every(x=>x.length>=MIN))return null;return {hm:(mean(hf)+mean(aa))/2,am:(mean(af)+mean(ha))/2};}
function update(map,m,n){
 const h=getHistory(map,m,m.home,"home"),a=getHistory(map,m,m.away,"away");
 push(h.gf,m.hg,n);push(h.ga,m.ag,n);push(a.gf,m.ag,n);push(a.ga,m.hg,n);
 push(h.xgf,m.xgH,n);push(h.xga,m.xgA,n);push(a.xgf,m.xgA,n);push(a.xga,m.xgH,n);
 if(Number.isFinite(m.htH)&&Number.isFinite(m.htA)){push(h.htf,m.htH,n);push(h.hta,m.htA,n);push(a.htf,m.htA,n);push(a.hta,m.htH,n);}
 if(Number.isFinite(m.shH)&&Number.isFinite(m.shA)){push(h.shf,m.shH,n);push(h.sha,m.shA,n);push(a.shf,m.shA,n);push(a.sha,m.shH,n);}
 for(const [k,s] of Object.entries(SPECS)){push(h.stats[k].f,m[s.h],n);push(h.stats[k].a,m[s.a],n);push(a.stats[k].f,m[s.a],n);push(a.stats[k].a,m[s.h],n);}
}
function backtest(matches,{sampleSize=5}={}){
 if(!Number.isInteger(sampleSize)||sampleSize<1)throw Error("A amostra tem de ser um inteiro positivo.");
 const histories=new Map(),errors={},goalRows=[],periodRows={ht:[],st:[]},marketRows={},coverage={};let skippedGoals=0,xgBlendUsed=0,evaluatedGoals=0;
 const byDate=new Map();for(const m of matches){if(!byDate.has(m.date))byDate.set(m.date,[]);byDate.get(m.date).push(m);}
 for(const [date,todays] of byDate){
  for(const m of todays){
   const h=getHistory(histories,m,m.home,"home"),a=getHistory(histories,m,m.away,"away");
   const g=goalsModel(h,a);
   if(g){evaluatedGoals++;if(g.useXg)xgBlendUsed++;const p=goalProb(g.hm,g.am);goalRows.push({p,actual:{hg:m.hg,ag:m.ag,total:m.hg+m.ag,btts:m.hg>0&&m.ag>0?1:0}});addError(errors,"homeGoals",g.hm-m.hg);addError(errors,"awayGoals",g.am-m.ag);addError(errors,"totalGoals",g.hm+g.am-m.hg-m.ag);}else skippedGoals++;
   for(const period of ["ht","st"]){const model=periodModel(h,a,period),ah=period==="ht"?m.htH:m.shH,aa=period==="ht"?m.htA:m.shA;if(!model||!Number.isFinite(ah)||!Number.isFinite(aa))continue;const x=poisson(model.hm),y=poisson(model.am),actual={total:ah+aa,home:ah,away:aa},p={over05:atLeast(x,y,1),over15:atLeast(x,y,2),btts:(1-x[0])*(1-y[0])};periodRows[period].push({p,actual});}
   for(const [key,s] of Object.entries(SPECS)){const model=statModel(h,a,key);if(!model||!Number.isFinite(m[s.h])||!Number.isFinite(m[s.a]))continue;const actual=m[s.h]+m[s.a],x=negBin(model.hm,model.d),y=negBin(model.am,model.d),probs={};for(const line of s.lines)probs["p"+line]=atLeast(x,y,Math.floor(line)+1);addError(errors,"home"+key,model.hm-m[s.h]);addError(errors,"away"+key,model.am-m[s.a]);addError(errors,"total"+key,model.hm+model.am-actual);if(!marketRows[key])marketRows[key]=[];marketRows[key].push({probs,actual});coverage[key]=(coverage[key]||0)+1;}
  }
  // Same-day fixtures are only added after every prediction for that date.
  for(const m of todays)update(histories,m,sampleSize);
 }
 const goalBinary={};for(const k of ["over15","over25","over35"])goalBinary[k]=evaluate(goalRows.map(r=>({p:{p:r.p[k]},a:{total:r.actual.total}})),"p","total",k==="over15"?2:k==="over25"?3:4);
 goalBinary.btts=evaluate(goalRows.map(r=>({p:{p:r.p.btts},a:{btts:r.actual.btts}})),"p","btts",1);
 const goal1x2=goalRows.length?(()=>{let b=0,l=0;for(const r of goalRows){const actual=r.actual.hg>r.actual.ag?0:r.actual.hg===r.actual.ag?1:2,ps=[r.p.home,r.p.draw,r.p.away];b+=ps.reduce((s,p,i)=>s+(p-(i===actual?1:0))**2,0);l-=Math.log(Math.max(1e-15,ps[actual]));}return {n:goalRows.length,brier:b/goalRows.length,logLoss:l/goalRows.length};})():{n:0,brier:null,logLoss:null};
 const periods={};for(const p of ["ht","st"]){const rows=periodRows[p];periods[p]={over05:evaluate(rows.map(r=>({p:{p:r.p.over05},a:{total:r.actual.total}})),"p","total",1)};if(p==="st"){periods[p].over15=evaluate(rows.map(r=>({p:{p:r.p.over15},a:{total:r.actual.total}})),"p","total",2);periods[p].btts=evaluate(rows.map(r=>({p:{p:r.p.btts},a:{btts:r.actual.home>0&&r.actual.away>0?1:0}})),"p","btts",1);}}
 const markets={};for(const [k,rows] of Object.entries(marketRows)){markets[k]={};for(const line of SPECS[k].lines){const key="p"+line;markets[k]["over"+line]=evaluate(rows.map(r=>({p:{p:r.probs[key]},a:{total:r.actual}})),"p","total",Math.floor(line)+1);}}
 return {matches:matches.length,sampleSize,evaluatedGoals,skippedGoals,xgBlendUsed,goalMetrics:{oneXTwo:goal1x2,binary:goalBinary},periodMetrics:periods,metricErrors:Object.fromEntries(Object.entries(errors).map(([k,v])=>[k,summary(v)])),metricCoverage:coverage,extraMarkets:markets};
}
function normalizeCompetitionLabel(label){
 const parts=String(label||"").split(/\\s+\\/\\s+/);
 const norm=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\\s+/g," ");
 if(parts.length<2)return norm(label);
 const country=parts.shift(),competition=parts.join(" / ");
 return norm(country)+" / "+norm(competition);
}
function run(text,indexOrOptions={},maybeOptions={}){
 const index=typeof indexOrOptions==="string"?JSON.parse(indexOrOptions):null;
 const options=typeof indexOrOptions==="string"?maybeOptions:indexOrOptions;
 const allMatches=normalize(parseCSV(text)),labelMap=new Map(),groups=new Map();
 let eligibleCompetitions=0;
 if(index){
  const items=Array.isArray(index.complete_competitions)?index.complete_competitions:[];
  for(const item of items.filter(x=>x.complete_core===true&&Number(x.unique_stats_matches)>=5)){
   eligibleCompetitions++;
   const key=String(item.country_name||"")+" | "+String(item.competition_name||"");
   const labels=Array.isArray(item.stats_source_labels)&&item.stats_source_labels.length?item.stats_source_labels:[String(item.country_name||"")+" / "+String(item.competition_name||"")];
   for(const label of labels)labelMap.set(normalizeCompetitionLabel(label),key);
  }
 }
 const matches=index?allMatches.filter(m=>labelMap.has(normalizeCompetitionLabel(m.country+" / "+m.competition))):allMatches;
 for(const m of matches){const key=index?labelMap.get(normalizeCompetitionLabel(m.country+" / "+m.competition)):m.country+" | "+m.competition;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
 if(index&&!groups.size)throw Error("O CSV não contém jogos das competições completas selecionáveis no simulador.");
 const reports=[],byCompetition={};for(const [key,fixtures] of groups){const r=backtest(fixtures,options);reports.push(r);byCompetition[key]=r;}
 const errorKeys=new Set(reports.flatMap(r=>Object.keys(r.metricErrors))),metricErrors={};for(const k of errorKeys)metricErrors[k]=combineSummary(reports.map(r=>r.metricErrors[k]));
 const metricCoverage={};for(const r of reports)for(const [k,n] of Object.entries(r.metricCoverage))metricCoverage[k]=(metricCoverage[k]||0)+n;
 const binaryKeys=new Set(reports.flatMap(r=>Object.keys(r.goalMetrics.binary))),goalBinary={};for(const k of binaryKeys)goalBinary[k]=combineEval(reports.map(r=>r.goalMetrics.binary[k]));
 const periodMetrics={};for(const p of ["ht","st"]){const keys=new Set(reports.flatMap(r=>Object.keys(r.periodMetrics[p]||{})));periodMetrics[p]={};for(const k of keys)periodMetrics[p][k]=combineEval(reports.map(r=>r.periodMetrics[p]?.[k]));}
 const extraMarkets={};for(const metric of Object.keys(SPECS)){extraMarkets[metric]={};for(const line of SPECS[metric].lines)extraMarkets[metric]["over"+line]=combineEval(reports.map(r=>r.extraMarkets[metric]?.["over"+line]));}
 return {matches:matches.length,competitions:groups.size,eligibleCompetitions:eligibleCompetitions||groups.size,sampleSize:options.sampleSize||5,evaluatedGoals:reports.reduce((s,r)=>s+r.evaluatedGoals,0),skippedGoals:reports.reduce((s,r)=>s+r.skippedGoals,0),xgBlendUsed:reports.reduce((s,r)=>s+r.xgBlendUsed,0),
  goalMetrics:{oneXTwo:combineEval(reports.map(r=>r.goalMetrics.oneXTwo)),binary:goalBinary},periodMetrics,metricErrors,metricCoverage,extraMarkets,byCompetition,
  modelScope:"Walk-forward isolado nas competições completas que o simulador disponibiliza; últimos 5 jogos por defeito; mínimo de 3 jogos por indicador e 5 para xG; ponderação 65% golos + 35% xG; Poisson para golos e binomial negativa com as mesmas dispersões do simulador para cantos, remates, faltas e cartões."};
}
function addError(target,key,value){if(!target[key])target[key]=[];target[key].push(value);}
if(require.main===module){const input=process.argv[2]||"data/flashscore-statistics.csv",sampleSize=Number(process.argv[3])||5,indexPath=process.argv[4]||"data/simulator-complete-competitions.json",output=process.argv[5]||"backtest-flashscore-report.json";const report=run(fs.readFileSync(path.resolve(input),"utf8"),fs.readFileSync(path.resolve(indexPath),"utf8"),{sampleSize});fs.writeFileSync(output,JSON.stringify({generatedAt:new Date().toISOString(),source:input,competitionIndex:indexPath,...report},null,2));console.log(JSON.stringify({source:input,competitionIndex:indexPath,matches:report.matches,competitions:report.competitions,eligibleCompetitions:report.eligibleCompetitions,sampleSize:report.sampleSize,evaluatedGoals:report.evaluatedGoals,skippedGoals:report.skippedGoals,xgBlendUsed:report.xgBlendUsed,goalMetrics:report.goalMetrics,periodMetrics:report.periodMetrics,metricErrors:report.metricErrors,metricCoverage:report.metricCoverage,extraMarkets:report.extraMarkets,report:output},null,2));}
module.exports={parseCSV,normalize,backtest,run,summary,poisson,negBin,goalProb,goalsModel,statModel};
