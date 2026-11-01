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
