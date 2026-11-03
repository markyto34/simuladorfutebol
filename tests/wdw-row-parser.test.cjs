"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync(require("node:path").join(__dirname,"../app.js"),"utf8");
const dateFn=source.match(/function wdwDateKey\\(raw\\)\\{[\\s\\S]*?\\}/);
const parser=source.match(/function parseWdwMatchRows\\(doc,team\\)\\{[\\s\\S]*?\\n\\}\\nfunction wdwCacheKey/);
assert.ok(dateFn,"A função de data WinDrawWin deve existir.");
assert.ok(parser,"O parser WinDrawWin deve existir.");
const aliases={"shakhtar":"shakhtar donetsk","sporting":"sporting lisbon","sporting cp":"sporting lisbon","sporting lisboa":"sporting lisbon"};
const normalizeTeamName=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/\\b(fc|cf|sc|afc|club|clube|de|the)\\b/g," ").replace(/[^a-z0-9]+/g," ").trim().replace(/\\s+/g," ");
const wdwTeamKey=value=>{const n=normalizeTeamName(value);return normalizeTeamName(aliases[n]||n);};
const context={wdwDateKey:null,wdwTeamKey};
vm.createContext(context);
vm.runInContext(dateFn[0]+";"+parser[0].replace(/\\nfunction wdwCacheKey[\\s\\S]*$/,"")+";this.parse=parseWdwMatchRows;",context);
function doc(heading,cells){
 const row={cells:cells.map(textContent=>({textContent}))};
 return {querySelector:()=>({textContent:heading}),querySelectorAll:()=>[row]};
}
test("lê jogos quando a equipa da casa, o v e a equipa visitante estão em células separadas",()=>{
 const cells=["8th Aug","Estrela Amadora","v","Sporting Lisbon","2-2","0-0","44%","5","14","2","3","56%","4","14","6","5"];
 const rows=context.parse(doc("Sporting Lisbon Results and Match Statistics",cells),"Sporting CP");
 assert.equal(rows.length,1);
 assert.equal(rows[0].home,"Estrela Amadora");
 assert.equal(rows[0].away,"Sporting Lisbon");
 assert.equal(rows[0].hg,2);
 assert.equal(rows[0].ag,2);
 assert.equal(rows[0].htHome,0);
 assert.equal(rows[0].htAway,0);
 assert.equal(rows[0].homeCorners,5);
 assert.equal(rows[0].awayCorners,4);
 assert.equal(rows[0].teamHome,false);
});
test("lê jogos do Shakhtar com a mesma estrutura de células separadas",()=>{
 const cells=["3rd Aug","Shakhtar Donetsk","v","FK Kudrivka","5-1","1-1","No additional match data available for this game"];
 const rows=context.parse(doc("Shakhtar Donetsk Results and Match Statistics",cells),"Shakhtar");
 assert.equal(rows.length,1);
 assert.equal(rows[0].hg,5);
 assert.equal(rows[0].ag,1);
 assert.equal(rows[0].teamHome,true);
 assert.equal(rows[0].homeCorners,null);
 assert.equal(rows[0].awayCorners,null);
});
test("continua a suportar o formato em que o encontro surge numa única célula",()=>{
 const cells=["8th Aug","Estrela Amadora v Sporting Lisbon","2-2","0-0","44%","5","14","2","3","56%","4","14","6","5"];
 const rows=context.parse(doc("Sporting Lisbon Results",cells),"Sporting CP");
 assert.equal(rows.length,1);
 assert.equal(rows[0].away,"Sporting Lisbon");
 assert.equal(rows[0].awayCorners,4);
});
