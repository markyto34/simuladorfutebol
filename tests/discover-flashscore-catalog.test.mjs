import test from "node:test";
import assert from "node:assert/strict";
import { parseCountryLinks, parseCompetitionLinks, discoverFlashscoreCatalog } from "../scripts/discover-flashscore-catalog.mjs";

test("descobre páginas de países e regiões apenas no caminho de futebol", () => {
  const html = `
    <a href="/futebol/portugal/">Portugal</a>
    <a href="https://www.flashscore.pt/futebol/alemanha/">Alemanha</a>
    <a href="/futebol/europa/">Europa</a>
    <a href="/tenis/portugal/">Ténis Portugal</a>
    <a href="https://example.com/futebol/italia/">Site externo</a>
    <a href="/futebol/portugal/liga-portugal/">Liga Portugal</a>
  `;
  const result = parseCountryLinks(html);
  assert.deepEqual(result.map(item => item.country_slug).sort(), ["alemanha", "europa", "portugal"]);
});

test("extrai todas as competições da página de país sem fundir fases e divisões", () => {
  const country = { country_name: "Portugal", country_slug: "portugal", url: "https://www.flashscore.pt/futebol/portugal/" };
  const html = `
    <a href="/futebol/portugal/liga-portugal/">Liga Portugal Betclic</a>
    <a href="/futebol/portugal/campeonato-portugal-serie-a/">Campeonato de Portugal - Série A</a>
    <a href="/futebol/portugal/campeonato-portugal-serie-b/">Campeonato de Portugal - Série B</a>
    <a href="/futebol/portugal/campeonato-portugal-playoffs/">Campeonato de Portugal - Playoffs</a>
    <a href="/futebol/portugal/liga-futebol-feminino/">Liga de Futebol Feminino</a>
    <a href="/futebol/portugal/liga-portugal/">Liga Portugal (2026/27)</a>
    <a href="/futebol/espanha/laliga/">LaLiga</a>
  `;
  const result = parseCompetitionLinks(html, country);
  assert.equal(result.length, 5);
  assert.equal(result.find(item => item.competition_slug === "campeonato-portugal-serie-a").competition_name, "Campeonato de Portugal - Série A");
  assert.equal(result.find(item => item.competition_slug === "campeonato-portugal-playoffs").status, "candidate_not_yet_validated");
});

test("o crawler regista erros por país e preserva páginas que responderam", async () => {
  const pages = new Map([
    ["https://www.flashscore.pt/futebol/", '<a href="/futebol/portugal/">Portugal</a><a href="/futebol/alemanha/">Alemanha</a>'],
    ["https://www.flashscore.pt/futebol/portugal/", '<a href="/futebol/portugal/liga-portugal/">Liga Portugal</a>']
  ]);
  const report = await discoverFlashscoreCatalog({
    fetchPage: async url => {
      if (url.endsWith("/alemanha/")) throw new Error("HTTP 403");
      if (!pages.has(url)) throw new Error("unexpected URL " + url);
      return pages.get(url);
    },
    waitMs: 0
  });
  assert.equal(report.country_page_count, 2);
  assert.equal(report.country_pages_successful, 1);
  assert.equal(report.country_pages_failed, 1);
  assert.equal(report.competition_candidate_count, 1);
  assert.equal(report.errors[0].country, "Alemanha");
});
