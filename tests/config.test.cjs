"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("configuração do simulador e mapeamento WinDrawWin", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "../scripts/validate-config.cjs")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /65 competições têm mapeamento WDW/);
});


test("xG aparece uma vez por equipa e a cobertura é apresentada independentemente", () => {
  const fs = require("node:fs");
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.equal((html.match(/<div class="stat-group"><h5>xG<\\/h5>/g) || []).length, 2);
  const home = html.split('<div class="team-stats"><h4>CASA</h4>')[1].split('<div class="team-stats"><h4>FORA</h4>')[0];
  const away = html.split('<div class="team-stats"><h4>FORA</h4>')[1].split('</div></div><p class="source-note">')[0];
  assert.match(home, /<h5>xG<\\/h5>/);
  assert.match(away, /<h5>xG<\\/h5>/);

  const start = app.indexOf("function enforcePairedTeamCoverage()");
  const end = app.indexOf("\\nfunction applyTeamSelection", start);
  assert.ok(start >= 0 && end > start, "função de cobertura encontrada");
  const coverage = app.slice(start, end);
  assert.doesNotMatch(coverage, /clearAll|fillInput\\(/);
  assert.match(app, /const hasGoalHistory=goalValues\\.every\\(v=>v!==null\\)/);
  assert.match(app, /const hasCorners=cornerValues\\.every\\(v=>v!==null\\)/);
});
