"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8");
const start=source.indexOf("function wdwTeamNameMatchScore(");
const end=source.indexOf("\nasync function findWdwTeamPathFromLeagueIndex(",start);
assert.ok(start>=0&&end>start,"As funções de comparação WinDrawWin devem existir.");
const aliases={"shakhtar":"shakhtar donetsk","fc shakhtar donetsk":"shakhtar donetsk","sporting cp":"sporting lisbon","sporting":"sporting lisbon"};
const normalizeTeamName=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/\\b(fc|cf|sc|afc|club|clube|de|the)\\b/g," ").replace(/[^a-z0-9]+/g," ").trim().replace(/\\s+/g," ");
const wdwTeamKey=value=>{const n=normalizeTeamName(value);return normalizeTeamName(aliases[n]||n);};
const context={wdwTeamKey};
vm.createContext(context);
vm.runInContext(source.slice(start,end)+";this.resolve=wdwResolveTeamLink;",context);
test("mapeia por nome canónico exato depois de normalizar alias",()=>{
 const result=context.resolve("Sporting CP",[{name:"Sporting Lisbon",href:"/results/sporting-lisbon/"}]);
 assert.equal(result.matchType,"exact");
 assert.equal(result.path,"/results/sporting-lisbon/");
});
test("mapeia quando o nome da fonte contém tokens adicionais",()=>{
 const result=context.resolve("Real Sociedad",[{name:"Real Sociedad de Futbol",href:"/results/real-sociedad/"}]);
 assert.equal(result.matchType,"fuzzy");
 assert.equal(result.canonicalName,"Real Sociedad de Futbol");
 assert.equal(result.matchScore,1);
});
test("não escolhe automaticamente entre correspondências aproximadas empatadas",()=>{
 const result=context.resolve("Real Sociedad",[
  {name:"Real Sociedad de Futbol",href:"/results/real-sociedad/"},
  {name:"Real Sociedad B Team",href:"/results/real-sociedad-b/"}
 ]);
 assert.equal(result.path,null);
 assert.equal(result.reason,"ambiguous_team");
});
test("não associa equipas diferentes por partilharem apenas um token",()=>{
 const result=context.resolve("Porto",[{name:"Porto Alegre",href:"/results/porto-alegre/"}]);
 assert.equal(result.path,null);
 assert.equal(result.reason,"team_not_listed");
});
test("não escolhe entre páginas duplicadas com nome exato",()=>{
 const result=context.resolve("Sporting CP",[
  {name:"Sporting Lisbon",href:"/results/sporting-lisbon/"},
  {name:"Sporting Lisbon",href:"/results/sporting-lisbon-2/"}
 ]);
 assert.equal(result.path,null);
 assert.equal(result.reason,"ambiguous_team");
});
