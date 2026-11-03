"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../app.js"), "utf8");
const match = source.match(/function wdwRequiredComplete\(m\)\{[\s\S]*?\nfunction renderWdwSummary/);
assert.ok(match, "A validação WinDrawWin deve existir antes do resumo.");
const code = match[0].replace(/\nfunction renderWdwSummary$/, "");
const context = { mean: values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null };
vm.createContext(context);
vm.runInContext(code + ";this.validate=wdwRequiredComplete;this.hasComplete=wdwHasCompleteMatches;this.summarize=parseWdwSummary;", context);
const complete = {hg:1,ag:0,homeCorners:5,awayCorners:3,homeFouls:10,awayFouls:12,homeTarget:4,awayTarget:2,homeShotsOff:5,awayShotsOff:3,homePoss:55,awayPoss:45,htHome:1,htAway:0,teamHome:true};
test("WinDrawWin aceita um jogo apenas quando todos os campos obrigatórios existem", () => {
 assert.equal(context.validate({...complete}), true);
 for (const field of ["hg","ag","homeCorners","awayCorners","homeFouls","awayFouls","homeTarget","awayTarget","homeShotsOff","awayShotsOff"]) {
  assert.equal(context.validate({...complete,[field]:null}), false, field+" não pode faltar");
 }
});
test("WinDrawWin rejeita valores vazios, não numéricos e negativos", () => {
 assert.equal(context.validate({...complete,homeCorners:""}), false);
 assert.equal(context.validate({...complete,awayShotsOff:"N/D"}), false);
 assert.equal(context.validate({...complete,homeFouls:-1}), false);
});
test("Resumo WinDrawWin exclui jogos incompletos da amostra e das percentagens", () => {
 const incomplete={...complete,homeFouls:null,teamHome:false};
 const result=context.summarize({body:{innerText:""}}, "Equipa", [complete,incomplete]);
 assert.equal(result.sample,2, "resultados com marcador também contribuem para golos e forma");
 assert.equal(result.completeSample,1);
 assert.equal(result.excludedIncomplete,1);
 assert.equal(result.bttsPlayed,2);
 assert.equal(result.cornersTotal,8);
});

test("WinDrawWin só confirma o mapeamento quando existe pelo menos um jogo completo", () => {
 assert.equal(context.hasComplete([]), false);
 assert.equal(context.hasComplete([{...complete,homeFouls:null}]), false);
 assert.equal(context.hasComplete([{...complete,homeFouls:null},{...complete,awayCorners:null}]), false);
 assert.equal(context.hasComplete([{...complete,homeFouls:null},{...complete}]), true);
});


test("Resumo mantém resultados e golos quando a página não fornece estatísticas de jogo", () => {
 const rows = [
  {...complete,homeCorners:null,awayCorners:null,homeFouls:null,awayFouls:null,homeTarget:null,awayTarget:null,homeShotsOff:null,awayShotsOff:null},
  {...complete,teamHome:false,hg:1,ag:2,homeCorners:null,awayCorners:null,homeFouls:null,awayFouls:null,homeTarget:null,awayTarget:null,homeShotsOff:null,awayShotsOff:null}
 ];
 const result=context.summarize({body:{innerText:""}}, "Equipa", rows);
 assert.equal(result.sample,2);
 assert.equal(result.completeSample,0);
 assert.equal(result.goalsFor,1.5);
 assert.equal(result.goalsAgainst,0.5);
 assert.equal(result.wins,2);
 assert.equal(result.cornersTotal,null);
});

test("WinDrawWin distingue equipa identificada de estatísticas completas", () => {
 const rows=[{...complete,homeCorners:null},{...complete,awayFouls:null}];
 assert.equal(rows.length>0,true);
 assert.equal(context.hasComplete(rows),false);
});
