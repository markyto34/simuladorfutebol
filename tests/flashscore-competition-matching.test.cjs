"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../app.js"), "utf8");
const start = source.indexOf("function normalizeFlashscoreSourceLabel(label){");
const end = source.indexOf("\n}", start) + 2;
assert.ok(start >= 0 && end > start, "A normalização dos nomes das competições Flashscore deve existir.");
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + ";this.normalizeLabel=normalizeFlashscoreSourceLabel;", context);

test("Associa Portugal e PORTUGAL à mesma competição", () => {
  assert.equal(context.normalizeLabel("PORTUGAL / Liga Portugal 2"), context.normalizeLabel("Portugal / Liga Portugal 2"));
});

test("Ignora diferenças de maiúsculas, minúsculas e acentos nos nomes", () => {
  assert.equal(context.normalizeLabel("PORTUGAL / LÍGA PORTUGAL 2"), context.normalizeLabel("Portugal / Liga Portugal 2"));
});

test("Preserva a separação entre país e competição", () => {
  assert.notEqual(context.normalizeLabel("Portugal / Liga Portugal 2"), context.normalizeLabel("Espanha / Liga Portugal 2"));
});
