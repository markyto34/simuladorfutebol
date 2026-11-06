#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCsv } from "./validate-flashscore-history.mjs";

const SITE = "https://www.flashscore.pt";
const FEED = "https://global.flashscore.ninja/2/x/feed/";
const FEED_SIGN = process.env.FLASHSCORE_FEED_SIGN || "SW9D1eZo";
let activeFeedSign = FEED_SIGN;
const MAX_PAGES = 100;
const MAX_MATCHES = 2000;
const DELAY_MS = Math.max(100, Number(process.env.FLASHSCORE_SEASON_PAGE_DELAY_MS || 1500));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function jsObject(html, marker) {
  const start = html.indexOf(marker), open = html.indexOf("{", start);
  if (start < 0 || open < 0) return {};
  let depth = 0, inString = false, escaped = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\" && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(html.slice(open, i + 1)); } catch { return {}; }
    }
  }
  return {};
}

function parseRecords(text) {
  return String(text || "").split("~").map(chunk => {
    const row = {};
    for (const token of chunk.split("¬")) {
      const at = token.indexOf("÷");
      if (at > 0 && !(token.slice(0, at) in row)) row[token.slice(0, at)] = token.slice(at + 1);
    }
    return row;
  }).filter(row => Object.keys(row).length);
}

function parseInitialResults(html) {
  const match = /cjs\.initialFeeds\[['"]results['"]\]\s*=\s*\{([\s\S]*?)\n\s*\}/.exec(html);
  if (!match) throw new Error("A página não contém cjs.initialFeeds[results]; não é possível confirmar a época.");
  const body = match[1];
  const data = /data:\s*[\x60]([\s\S]*?)[\x60]/.exec(body);
  const total = /allEventsCount:\s*(\d+)/.exec(body);
  const season = /seasonId:\s*(\d+)/.exec(body);
  if (!data || !season) throw new Error("O feed inicial não contém data ou seasonId.");
  return { text: data[1], total_count: total ? Number(total[1]) : null, season_id: Number(season[1]) };
}

function isFriendlyCompetition(value) {
  return /friendly|friendlies|amig[aá]v|amistos|club[- ]?friend/i.test(String(value || ""));
}

function getCurrentSeasonContext(html, path) {
  const env = jsObject(html, "window.environment");
  const feed = parseInitialResults(html);
  const stages = env?.stages_group?.stages || [];
  const seasonList = Array.isArray(env?.season_list) ? env.season_list : [];
  const selected = Number.isInteger(Number(env?.selected_season_id)) ? Number(env.selected_season_id) : 0;
  const selectedSeason = seasonList[selected] || seasonList[0] || {};
  const ids = String(selectedSeason.pathname || "").split("/").filter(Boolean).filter(v => /^[A-Za-z0-9]{8}$/.test(v));
  const header = parseRecords(feed.text).find(row => row.ZA || row.ZEE) || {};
  const context = {
    path, season_name: String(selectedSeason.name || ""),
    tournament_id: ids[0] || null, stage_id: ids[1] || null,
    template_id: header.ZEE || null, season_id: feed.season_id,
    sport_id: Number(env?.sport_id || 1), country_id: Number(stages[0]?.countryId || 0),
    total_count: feed.total_count, feed_competition: header.ZA || ""
  };
  if (!context.tournament_id || !context.stage_id || !context.template_id || !context.season_id) {
    throw new Error("Não foi possível validar os IDs da época, template e feed de resultados Flashscore.");
  }
  if (isFriendlyCompetition(path) || isFriendlyCompetition(context.feed_competition)) {
    throw new Error("Competições amigáveis estão excluídas.");
  }
  return { ...context, first_page: feed.text };
}

function parseMatchRows(text, fallbackCompetition) {
  const matches = [];
  let competition = fallbackCompetition;
  for (const row of parseRecords(text)) {
    if (row.ZA) competition = row.ZA;
    if (!row.AA || !/^[A-Za-z0-9]{6,16}$/.test(row.AA)) continue;
    if (Number(row.AB) !== 3 || !/^\d+$/.test(row.AD || "")) continue;
    const parts = String(competition || "").split(":");
    const country = parts.length > 1 ? parts.shift().trim() : "";
    const name = parts.join(":").trim();
    if (isFriendlyCompetition(competition) || isFriendlyCompetition(name)) continue;
    matches.push({
      match_id: row.AA, date_time: new Date(Number(row.AD) * 1000).toISOString(),
      competition: competition || fallbackCompetition || "", country,
      home_team: row.AE || "", away_team: row.AF || ""
    });
  }
  return matches;
}

async function fetchText(url, headers, label) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (response.status === 403 || response.status === 429) {
    throw new Error("Flashscore bloqueou/limitou " + label + ": HTTP " + response.status + "; recolha interrompida.");
  }
  if (!response.ok) throw new Error(label + ": HTTP " + response.status);
  return response.text();
}

export async function discoverSeasonFromHtml({ html, path, fetchFeedPage }) {
  const context = getCurrentSeasonContext(html, path);
  const fallback = context.feed_competition || path.split("/").filter(Boolean).at(-1).replace(/-/g, " ");
  const all = parseMatchRows(context.first_page, fallback);
  const expected = Number(context.total_count || 0);
  let page = 2, exhausted = false;
  while (page <= MAX_PAGES && (!expected || all.length < expected)) {
    const feedName = "tr_" + context.sport_id + "_" + (context.country_id || 0) + "_" +
      context.template_id + "_" + context.season_id + "_" + (page - 1) + "_5_en_1";
    const body = await fetchFeedPage(feedName);
    if (!body || body === "0" || body === "A1÷¬~") { exhausted = true; break; }
    const rows = parseMatchRows(body, fallback);
    if (!rows.length) { exhausted = true; break; }
    all.push(...rows);
    console.log("[SEASON PAGE] " + page + ": " + rows.length + " jogos concluídos; acumulado=" + all.length);
    page++;
    if (page <= MAX_PAGES) await sleep(DELAY_MS);
    if (all.length > MAX_MATCHES) throw new Error("A época excede o limite de segurança de " + MAX_MATCHES + " jogos; não será recolhida parcialmente.");
  }
  const unique = [...new Map(all.map(item => [item.match_id, item])).values()];
  if (!exhausted && page > MAX_PAGES && expected && all.length < expected) {
    throw new Error("Limite de " + MAX_PAGES + " páginas atingido antes de percorrer todos os eventos indicados pelo Flashscore; manifesto parcial rejeitado.");
  }
  if (expected && unique.length < expected) {
    console.warn("[SEASON WARNING] Flashscore indica " + expected + " eventos; foram identificados " + unique.length + " jogos concluídos. Verificar estados/linhas sem resultado.");
  }
  if (unique.length > MAX_MATCHES) throw new Error("A época contém " + unique.length + " jogos; limite de segurança " + MAX_MATCHES + ".");
  return { context: { ...context, first_page: undefined }, fixtures: unique };
}

async function main() {
  const path = process.argv.find(arg => arg.startsWith("--path="))?.slice(7) || "";
  const out = process.argv.find(arg => arg.startsWith("--out="))?.slice(6) || "season-manifest.json";
  if (!/^\/futebol\/[a-z0-9-]+\/[a-z0-9-]+\/$/.test(path)) {
    throw new Error("Usa --path=/futebol/<pais>/<competicao>/; apenas caminhos Flashscore de futebol são aceites.");
  }
  if (isFriendlyCompetition(path)) throw new Error("Competições amigáveis estão excluídas.");
  const htmlUrl = SITE + path + "resultados/";
  console.log("[SEASON] A consultar " + htmlUrl);
  const html = await fetchText(htmlUrl, {
    "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.7",
    "User-Agent": "Mozilla/5.0 (compatible; SimuladorFutebol/1.0)"
  }, "página da competição");
  const result = await discoverSeasonFromHtml({
    html, path,
    fetchFeedPage: async feedName => {
      const headers = () => ({
        "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9", "Referer": SITE + "/",
        "Origin": SITE, "x-fsign": activeFeedSign,
        "User-Agent": "Mozilla/5.0 (compatible; SimuladorFutebol/1.0)"
      });
      let response = await fetch(FEED + feedName, { headers: headers(), signal: AbortSignal.timeout(60000) });
      if (response.status === 401) {
        const home = await fetchText(SITE + "/", {
          "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.7",
          "User-Agent": "Mozilla/5.0 (compatible; SimuladorFutebol/1.0)"
        }, "página inicial para atualizar assinatura do feed");
        const fresh = /feed_sign\s*[:=]\s*["']([A-Za-z0-9_-]{4,32})["']/.exec(home)?.[1];
        if (fresh) activeFeedSign = fresh;
        response = await fetch(FEED + feedName, { headers: headers(), signal: AbortSignal.timeout(60000) });
      }
      if (response.status === 403 || response.status === 429) {
        throw new Error("Flashscore bloqueou/limitou feed " + feedName + ": HTTP " + response.status + "; recolha interrompida.");
      }
      if (!response.ok) throw new Error("Feed " + feedName + ": HTTP " + response.status);
      return response.text();
    }
  });
  let catalogLabel = null;
  try {
    const coverage = JSON.parse(await readFile("data/flashscore-competition-coverage.json", "utf8"));
    catalogLabel = (coverage.competitions || []).find(item => {
      try { return new URL(item.url).pathname === path; } catch { return false; }
    }) || null;
  } catch {}
  let completeIds = new Set();
  try {
    const existing = parseCsv(await readFile("data/flashscore-statistics.csv", "utf8"));
    const allFields = [
      "score_home", "score_away", "ht_home", "ht_away", "sh_home", "sh_away",
      ...["xg", "possession", "shots", "shots_on_target", "big_chances", "corners", "corners_ht", "corners_st",
        "yellow_cards", "red_cards", "shots_off_target", "blocked_shots", "shots_inside_box",
        "shots_outside_box", "offsides", "fouls"].flatMap(key => [key + "_home", key + "_away"])
    ];
    const coreFields = [
      "score_home", "score_away",
      ...["xg", "possession", "shots", "shots_on_target", "corners", "corners_ht", "corners_st", "yellow_cards", "fouls"]
        .flatMap(key => [key + "_home", key + "_away"])
    ];
    const fieldsByCompetition = new Map();
    for (const row of existing) {
      const key = String(row.country || "") + "|" + String(row.competition || "");
      if (!fieldsByCompetition.has(key)) fieldsByCompetition.set(key, []);
      fieldsByCompetition.get(key).push(row);
    }
    const observedByCompetition = new Map();
    for (const [key, rows] of fieldsByCompetition) {
      const observed = allFields.filter(field => rows.some(row => String(row[field] ?? "").trim() !== ""));
      observedByCompetition.set(key, [...new Set([...coreFields, ...observed])]);
    }
    completeIds = new Set(existing.filter(row => {
      const key = String(row.country || "") + "|" + String(row.competition || "");
      const required = observedByCompetition.get(key) || coreFields;
      return required.every(field => String(row[field] ?? "").trim() !== "");
    }).map(row => row.match_id));
  } catch {}
  const fixtures = result.fixtures.map(item => {
    const parts = String(item.competition || "").split(":");
    const competitionName = parts.length > 1
      ? parts.slice(1).join(":").trim()
      : (catalogLabel?.competition_name || parts[0].trim());
    const countryName = catalogLabel?.country_name || (parts.length > 1 ? parts[0].trim() : "");
    const competition = countryName && competitionName ? countryName + ": " + competitionName : item.competition;
    return {
      match_id: item.match_id, competition,
      stats_status: completeIds.has(item.match_id) ? "already_complete" : "pending"
    };
  });
  const manifest = {
    source: "Flashscore tournament season results feed", generated_at: new Date().toISOString(),
    path, season: result.context.season_name, tournament_id: result.context.tournament_id,
    stage_id: result.context.stage_id, template_id: result.context.template_id,
    season_id: result.context.season_id, expected_events: result.context.total_count,
    finished_matches_discovered: fixtures.length,
    already_complete_with_period_corners: fixtures.filter(f => f.stats_status === "already_complete").length,
    fixtures
  };
  await writeFile(resolve(out), JSON.stringify(manifest, null, 2) + "\n");
  console.log("[SEASON COMPLETE] " + (manifest.season || "época atual") + " | " +
    fixtures.length + " jogos concluídos | " + manifest.already_complete_with_period_corners +
    " já completos com cantos HT/ST | manifesto=" + out);
  if (!fixtures.length) throw new Error("O feed de resultados não devolveu jogos concluídos; nenhum CSV foi alterado.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => { console.error("[SEASON ERROR] " + (error?.stack || error)); process.exitCode = 1; });
}
