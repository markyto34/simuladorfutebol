"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const config = fs.readFileSync(path.join(root, "config.js"), "utf8");
const proxy = fs.readFileSync(path.join(root, "windrawwin-proxy/src/index.js"), "utf8");

function fail(message) { console.error("VALIDAÇÃO FALHOU: " + message); process.exitCode = 1; }
const mapStart = app.indexOf("const WDW_LEAGUES={");
const mapEnd = app.indexOf("const WDW_ALIASES=", mapStart);
if (mapStart < 0 || mapEnd < 0) {
  fail("Não foi possível localizar o mapa WDW_LEAGUES.");
} else {
  const mapText = app.slice(mapStart, mapEnd);
  const mapped = new Set([...mapText.matchAll(/"([^"]+)"\\s*:/g)].map(m => m[1]));
  const leagueSelect = html.match(/<select id="league">([\\s\\S]*?)<\\/select>/);
  if (!leagueSelect) fail("Seletor de competições não encontrado.");
  else {
    const options = [...leagueSelect[1].matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
    const missing = options.filter(id => !mapped.has(id));
    const extra = [...mapped].filter(id => !options.includes(id));
    if (missing.length) fail("Competições sem slug WDW: " + missing.join(", "));
    if (extra.length) fail("Slugs WDW sem opção correspondente: " + extra.join(", "));
    if (options.length !== 65) fail("Esperadas 65 competições; encontradas " + options.length + ".");
    if (!missing.length && !extra.length) console.log("OK: " + options.length + " competições têm mapeamento WDW.");
  }
}
if (!/windrawwinProxyUrl:\\s*"https:\\/\\//.test(config)) fail("URL HTTPS do proxy não configurado em config.js.");
if (!html.includes('<script src="config.js"></script>') || !html.includes('<script src="app.js"></script>')) fail("Scripts de configuração/aplicação não estão ligados no HTML.");
if (!app.includes("async function loadWdwMatchPair") || !app.includes('Promise.all([loadWdwTeam("home"),loadWdwTeam("away")])')) fail("A validação conjunta das duas equipas WDW não está ativa.");
if (!app.includes('loadWdwMatchPair();')) fail("Os seletores de equipas não acionam a validação conjunta WDW.");
if (!proxy.includes('https://simuladorfutebol.onrender.com')) fail("Origem do site não autorizada no proxy.");
if (!proxy.includes('incoming.pathname === "/health"')) fail("Endpoint /health do proxy não existe.");
if (!proxy.includes("function safePath")) fail("Validação de caminhos do proxy não existe.");
if (!process.exitCode) console.log("OK: configuração, proxy, scripts e validação das duas equipas.");
