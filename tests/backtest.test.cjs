"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseCSV,normalize,walkForward,run}=require("../scripts/backtest.cjs");
test("CSV parser preserves quoted commas",()=>{const rows=parseCSV('date,home,away,ft_home,ft_away\n2025-01-01,"Team, A",Team B,2,1');assert.equal(rows[0].home,"Team, A");});
test("normalizes Portuguese date formats",()=>{const m=normalize(parseCSV("date,home,away,ft_home,ft_away,home_corners,away_corners\n01/02/2025,A,B,2,0,6,3"));assert.equal(m[0].date,"2025-02-01");assert.equal(m[0].hc,6);});
test("walk-forward requires prior venue history",()=>{const rows=[];for(let i=1;i<=8;i++)rows.push({date:"2025-01-"+String(i).padStart(2,"0"),home:"A",away:"B",hg:2,ag:1,hc:6,ac:4});const r=walkForward(rows,{window:5,minHistory:2});assert.ok(r.evaluated>0);assert.ok(r.metrics.homeGoals);});
test("run returns goal metrics from CSV",()=>{let csv="date,home,away,ft_home,ft_away\n";for(let i=1;i<=8;i++)csv+="2025-01-"+String(i).padStart(2,"0")+",A,B,2,1\n";const r=run(csv,{window:5,minHistory:2});assert.equal(r.matches,8);});
