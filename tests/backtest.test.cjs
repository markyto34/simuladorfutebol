"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseCSV,normalize,walkForward,run}=require("../scripts/backtest.cjs");
test("CSV parser preserves quoted commas",()=>{const rows=parseCSV('date,home,away,ft_home,ft_away\n2025-01-01,"Team, A",Team B,2,1');assert.equal(rows[0].home,"Team, A");});
test("normalizes Portuguese date formats",()=>{const m=normalize(parseCSV("date,home,away,ft_home,ft_away,home_corners,away_corners\n01/02/2025,A,B,2,0,6,3"));assert.equal(m[0].date,"2025-02-01");assert.equal(m[0].hc,6);});
test("walk-forward requires prior venue history",()=>{const rows=[];for(let i=1;i<=8;i++)rows.push({date:"2025-01-"+String(i).padStart(2,"0"),home:"A",away:"B",hg:2,ag:1,hc:6,ac:4});const r=walkForward(rows,{window:5,minHistory:2});assert.ok(r.evaluated>0);assert.ok(r.metrics.homeGoals);});
test("run returns goal metrics from CSV",()=>{let csv="date,home,away,ft_home,ft_away\n";for(let i=1;i<=8;i++)csv+="2025-01-"+String(i).padStart(2,"0")+",A,B,2,1\n";const r=run(csv,{window:5,minHistory:2});assert.equal(r.matches,8);});

test("backtest normalizes and evaluates additional match statistics",()=>{let csv="date,home,away,ft_home,ft_away,home_shots,away_shots,home_target,away_target,home_fouls,away_fouls,home_yellow,away_yellow,home_red,away_red\n";for(let i=1;i<=9;i++)csv+="2025-02-"+String(i).padStart(2,"0")+",A,B,2,1,12,8,5,3,10,12,2,1,0,0\n";const r=run(csv,{window:5,minHistory:2});assert.ok(r.metrics.totalShots);assert.ok(r.metrics.totalFouls);assert.ok(r.metrics.totalYellow);assert.ok(r.metrics.totalRed);});

test("backtest reports sample size, MAE, RMSE and bias",()=>{const s=require("../scripts/backtest.cjs").summarize([1,-1,2,-2]);assert.equal(s.n,4);assert.equal(s.mae,1.5);assert.equal(s.rmse,Math.sqrt(2.5));assert.equal(s.bias,0);});

test("dispersion calibration selects a finite candidate with enough observations",()=>{const {fitDispersion}=require("../scripts/backtest.cjs");const samples=[];for(let i=0;i<80;i++)samples.push({mean:4,actual:[0,1,2,3,4,5,6,7,8,9][i%10]});const fit=fitDispersion(samples);assert.equal(fit.n,80);assert.ok(Number.isFinite(fit.alpha));assert.ok(fit.alpha>=0);assert.ok(Number.isFinite(fit.negativeBinomialNll));});
test("dispersion calibration refuses a small sample",()=>{const {fitDispersion}=require("../scripts/backtest.cjs");const fit=fitDispersion([{mean:2,actual:1}]);assert.equal(fit.alpha,null);assert.equal(fit.method,"insufficient_sample");});
