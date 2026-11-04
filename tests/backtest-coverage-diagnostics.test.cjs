"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {walkForward}=require("../scripts/backtest.cjs");
const row=(date,home,away,hg=1,ag=0)=>({date,home,away,hg,ag,hc:5,ac:3,hs:10,as:8,ht:4,at:2,hf:12,af:10,hy:1,ay:1,hr:0,ar:0});
test("backtest explica por que cada jogo foi ignorado por falta de histórico",()=>{
 const matches=[
  row("2026-01-01","A","B"),row("2026-01-02","C","D"),row("2026-01-03","E","F"),
  row("2026-01-04","A","D"),row("2026-01-05","C","B"),row("2026-01-06","E","D")
 ];
 const report=walkForward(matches,{window:10,minHistory:2});
 assert.equal(report.skipped,6);
 assert.equal(report.skipDiagnostics.minimumHistory,2);
 assert.equal(report.skipDiagnostics.fixtures.length,6);
 assert.ok(report.skipDiagnostics.fixtures.every(x=>x.deficient.length>0));
 assert.ok(report.skipDiagnostics.byReason.homeAttack>0);
});
