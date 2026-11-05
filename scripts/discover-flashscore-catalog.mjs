#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

const BASE = "https://www.flashscore.pt";
const INDEX_URL = BASE + "/futebol/";
const OUTPUT = process.env.FLASHSCORE_CATALOG_OUTPUT || "data/flashscore-competition-catalog-raw.json";
const USER_AGENT = "Mozilla/5.0 (compatible; SimuladorFutebolCatalog/1.0)";
const WAIT_MS = Number(process.env.FLASHSCORE_CATALOG_WAIT_MS || 700);

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function plainText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function attributeValue(attributes, name) {
  const patterns = {
    href: /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    'aria-label': /\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    title: /\btitle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    'data-competition-name': /\bdata-competition-name\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
  };
  return patterns[name]?.exec(attributes || '')?.slice(1).find(Boolean) || '';
}

function anchors(html) {
  const found = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const match of String(html || "").matchAll(pattern)) {
    const href = attributeValue(match[1], 'href');
    if (!href) continue;
    const name = plainText(match[2]) || decodeHtml(
      attributeValue(match[1], 'aria-label') ||
      attributeValue(match[1], 'title') ||
      attributeValue(match[1], 'data-competition-name')
    ).trim();
    found.push({ href: decodeHtml(href), name });
  }
  return found;
}

function safeFlashscoreUrl(href, baseUrl) {
  try {
    const url = new URL(href, baseUrl);
    if (url.hostname !== "www.flashscore.pt" && url.hostname !== "flashscore.pt") return null;
    if (!url.pathname.startsWith("/futebol/")) return null;
    return url;
  } catch { return null; }
}

export function parseCountryLinks(html, baseUrl = INDEX_URL) {
  const countries = new Map();
  for (const anchor of anchors(html)) {
    const url = safeFlashscoreUrl(anchor.href, baseUrl);
    if (!url) continue;
    const match = url.pathname.match(/^\/futebol\/([^/]+)\/?$/);
    if (!match || !anchor.name) continue;
    const slug = match[1];
    countries.set(slug, {
      country_name: anchor.name,
      country_slug: slug,
      url: BASE + "/futebol/" + slug + "/"
    });
  }
  return [...countries.values()].sort((a, b) => a.country_name.localeCompare(b.country_name, "pt"));
}

export function parseCompetitionLinks(html, country) {
  const competitions = new Map();
  for (const anchor of anchors(html)) {
    const url = safeFlashscoreUrl(anchor.href, country.url);
    if (!url) continue;
    const match = url.pathname.match(new RegExp("^/futebol/" + country.country_slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/([^/]+)/?$"));
    if (!match || !anchor.name) continue;
    const slug = match[1];
    competitions.set(slug, {
      country_name: country.country_name,
      country_slug: country.country_slug,
      competition_name: anchor.name,
      competition_slug: slug,
      url: BASE + "/futebol/" + country.country_slug + "/" + slug + "/",
      source_country_url: country.url,
      status: "candidate_not_yet_validated"
    });
  }
  return [...competitions.values()].sort((a, b) => a.competition_name.localeCompare(b.competition_name, "pt"));
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.7",
      "User-Agent": USER_AGENT
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  const type = response.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("text/html")) throw new Error("Resposta não HTML: " + type);
  return response.text();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function discoverFlashscoreCatalog({ fetchPage = fetchHtml, waitMs = WAIT_MS } = {}) {
  const indexHtml = await fetchPage(INDEX_URL);
  const countries = parseCountryLinks(indexHtml);
  if (!countries.length) throw new Error("Não foram encontradas páginas de países no índice Flashscore.");
  const competitions = [];
  const errors = [];
  for (const country of countries) {
    try {
      const html = await fetchPage(country.url);
      const found = parseCompetitionLinks(html, country);
      competitions.push(...found);
      country.competition_count = found.length;
      country.fetch_status = "success";
    } catch (error) {
      country.competition_count = 0;
      country.fetch_status = "error";
      country.error = String(error?.message || error).slice(0, 180);
      errors.push({ country: country.country_name, url: country.url, error: country.error });
    }
    if (waitMs > 0) await sleep(waitMs);
  }
  const unique = new Map();
  for (const item of competitions) unique.set(item.url, item);
  return {
    generated_at: new Date().toISOString(),
    source: "Flashscore.pt",
    source_index: INDEX_URL,
    scope: "Catálogo bruto das páginas públicas de futebol por país/região. Não confirma que todas as competições têm histórico estatístico ou odds.",
    country_page_count: countries.length,
    country_pages_successful: countries.filter(item => item.fetch_status === "success").length,
    country_pages_failed: errors.length,
    competition_candidate_count: unique.size,
    countries,
    competitions: [...unique.values()].sort((a, b) => a.country_name.localeCompare(b.country_name, "pt") || a.competition_name.localeCompare(b.competition_name, "pt")),
    errors
  };
}

async function main() {
  const report = await discoverFlashscoreCatalog();
  await writeFile(OUTPUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    output: OUTPUT,
    country_page_count: report.country_page_count,
    country_pages_successful: report.country_pages_successful,
    country_pages_failed: report.country_pages_failed,
    competition_candidate_count: report.competition_candidate_count,
    errors: report.errors.slice(0, 10)
  }, null, 2));
  if (report.country_pages_successful === 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
