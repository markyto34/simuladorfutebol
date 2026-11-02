#!/usr/bin/env node
"use strict";

// Diagnóstico passivo do HTML guardado do Flashscore. Não faz pedidos de rede,
// não contorna proteções e não transforma odds atuais em odds de fecho.
const fs = require("node:fs");

function decodeHtml(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function collectJsonScripts(html) {
  const found = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const body = match[1].trim();
    if (!body || (!body.startsWith("{") && !body.startsWith("["))) continue;
    try { found.push(JSON.parse(body)); } catch (_) { /* script não é JSON puro */ }
  }
  return found;
}

function walk(value, path, output, depth = 0) {
  if (!value || typeof value !== "object" || depth > 30) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, path + "[" + index + "]", output, depth + 1));
    return;
  }
  const entries = Object.entries(value);
  const identity = entries.filter(([key, item]) =>
    /bookmaker|provider|operator|name|title|label/i.test(key) &&
    typeof item === "string" && /bwin/i.test(item));
  if (identity.length) {
    output.push({
      path,
      identity: identity.map(([key, item]) => ({ key, value: item })),
      keys: entries.map(([key]) => key).slice(0, 80),
      scalarValues: entries.filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))
        .slice(0, 80).map(([key, item]) => ({ key, value: item }))
    });
  }
  entries.forEach(([key, item]) => walk(item, path + "." + key, output, depth + 1));
}

function inspectHtml(input) {
  const html = decodeHtml(input);
  const scripts = collectJsonScripts(html);
  const bwinObjects = [];
  scripts.forEach((value, index) => walk(value, "script[" + index + "]", bwinObjects));
  const lower = html.toLowerCase();
  const occurrences = [];
  let at = -1;
  while ((at = lower.indexOf("bwin", at + 1)) !== -1 && occurrences.length < 100) {
    occurrences.push({
      offset: at,
      context: html.slice(Math.max(0, at - 350), Math.min(html.length, at + 650))
        .replace(/\s+/g, " ").slice(0, 1000)
    });
  }
  const scoreKeys = new Set();
  for (const script of scripts) {
    (function scan(value, depth = 0) {
      if (!value || typeof value !== "object" || depth > 30) return;
      if (Array.isArray(value)) return value.forEach(item => scan(item, depth + 1));
      for (const [key, item] of Object.entries(value)) {
        if (/score|period|home|away|result|participant/i.test(key)) scoreKeys.add(key);
        scan(item, depth + 1);
      }
    })(script);
  }
  return {
    htmlBytes: Buffer.byteLength(input, "utf8"),
    parsedJsonScripts: scripts.length,
    bwinMentionCount: occurrences.length,
    bwinStructuredCandidates: bwinObjects,
    bwinTextContexts: occurrences,
    scoreRelatedKeys: [...scoreKeys].sort(),
    conclusion: bwinObjects.length
      ? "Foram encontrados objetos JSON associados a Bwin; validar manualmente o significado dos campos antes de extrair odds."
      : occurrences.length
        ? "Bwin aparece no HTML, mas não foi identificado um objeto JSON estruturado. Não extrair odds por aproximação."
        : "Não foi encontrada referência a Bwin no HTML guardado."
  };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error("Utilização: node scripts/inspect-flashscore-html.cjs caminho/para/jogo.html");
    process.exit(2);
  }
  const report = inspectHtml(fs.readFileSync(file, "utf8"));
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

module.exports = { inspectHtml, collectJsonScripts };
