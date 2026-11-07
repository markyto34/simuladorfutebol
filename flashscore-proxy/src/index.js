import { extractBwin1x2 } from "./extract-bwin.mjs";
import { extractPeriodCornersFromFeed } from "./extract-period-corners.mjs";
import { inspectScoreEvidence } from "./extract-scores.mjs";
import { extractPeriodScores } from "./extract-period-scores.mjs";
import { inspectMatchDiscovery, extractExplicitCompetitionForMatch } from "./discover-matches.mjs";
import { extractStructuredMatch } from "./extract-match-record.mjs";
import { inspectPageStructure } from "./inspect-page-structure.mjs";
import { buildMatchTabUrl, resolveMatchTab } from "./match-tabs.mjs";
import { extractTeamProfileLinks, parseTeamResultsFeed, selectLatestFinishedTeamMatches } from "./team-results.mjs";
const UPSTREAM = "https://m.flashscore.pt";
const ALLOWED_ORIGINS = new Set([
  "https://simuladorfutebol.onrender.com"
]);
const CACHE_SECONDS = 600;
const MAX_BODY_BYTES = 2_000_000;

function corsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://simuladorfutebol.onrender.com";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function validMatchId(value) {
  return typeof value === "string" && /^[A-Za-z0-9]{6,16}$/.test(value);
}

function inspectHtml(html, matchId, options = {}) {
  const plain = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);

  const bwinRegex = /bwin/ig;
  const bwinSnippets = [];
  let match;
  while ((match = bwinRegex.exec(html)) && bwinSnippets.length < 8) {
    const start = Math.max(0, match.index - 180);
    const end = Math.min(html.length, match.index + 260);
    const snippet = html.slice(start, end)
      .replace(/<[^>]+>/g, " ")
      .replace(/\\u003c/gi, "<")
      .replace(/\\u003e/gi, ">")
      .replace(/\\u0026/gi, "&")
      .replace(/\\u0022/gi, '"')
      .replace(/\\n|\\t/g, " ")
      .replace(/\s+/g, " ").trim();
    bwinSnippets.push(snippet.slice(0, 360));
  }

  const scorePatterns = [
    /"?(?:homeScore|awayScore|scoreHome|scoreAway|score)"?\s*[:=]\s*"?\d{1,2}(?:\s*[-:]\s*\d{1,2})?/gi,
    /\b\d{1,2}\s*[-:]\s*\d{1,2}\b/g
  ];
  const scoreCandidates = [];
  for (const pattern of scorePatterns) {
    for (const item of html.matchAll(pattern)) {
      const value = item[0].slice(0, 80);
      if (!scoreCandidates.includes(value)) scoreCandidates.push(value);
      if (scoreCandidates.length >= 20) break;
    }
    if (scoreCandidates.length >= 20) break;
  }

  const oddsPattern = /\b\d{1,2}[.,]\d{2,3}\b/g;
  const oddsCandidates = [];
  for (const item of html.matchAll(oddsPattern)) {
    const value = item[0].replace(",", ".");
    if (!oddsCandidates.includes(value)) oddsCandidates.push(value);
    if (oddsCandidates.length >= 30) break;
  }
  // Contexto dos marcadores Bwin. Os valores próximos são apenas candidatos:
  // este diagnóstico não lhes atribui mercado, seleção 1/X/2 ou fecho.
  const bwinOddsMarkers = [];
  const markerPattern = /<[^>]*(?:data-bookmaker-id=["']459["'][^>]*|data-event=["']odds_[^"']+["'][^>]*)>/gi;
  for (const marker of html.matchAll(markerPattern)) {
    const startAt = Math.max(0, marker.index - 220);
    const endAt = Math.min(html.length, marker.index + marker[0].length + 420);
    const rawContext = html.slice(startAt, endAt);
    const context = rawContext
      .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">")
      .replace(/\\u0022/gi, '"').replace(/\\u0026/gi, "&")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ").trim();
    const nearbyValues = [...context.matchAll(/\b\d{1,2}[.,]\d{2,3}\b/g)]
      .map(item => item[0].replace(",", "."));
    bwinOddsMarkers.push({
      marker: marker[0].slice(0, 500),
      nearby_decimal_values: [...new Set(nearbyValues)],
      context: context.slice(0, 700)
    });
    if (bwinOddsMarkers.length >= 20) break;
  }

  const { scoreEvidence, scoreRelatedAttributes } = inspectScoreEvidence(html);

  const scoreContexts = [];
  const scoreMarkerPattern = /(?:score|period|half|event__part|detailScore|participant__score)/ig;
  for (const item of html.matchAll(scoreMarkerPattern)) {
    const context = html.slice(Math.max(0, item.index - 180), Math.min(html.length, item.index + 300))
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (context && !scoreContexts.includes(context)) scoreContexts.push(context.slice(0, 420));
    if (scoreContexts.length >= 12) break;
  }

  return {
    title: title || null,
    team_links: extractTeamProfileLinks(html),
    page_structure: inspectPageStructure(html),
    match_record: extractStructuredMatch(html, matchId, { httpStatus: 200, sourceUrl: options.sourceUrl }),
    bwin: {
      found: /bwin/i.test(html),
      mentions: (html.match(/bwin/gi) || []).length,
      snippets: bwinSnippets,
      odds_markers: bwinOddsMarkers,
      one_x_two_candidates: extractBwin1x2(html)
    },
    period_scores: extractPeriodScores(html),
    score_candidates: scoreCandidates,
    score_evidence: scoreEvidence,
    score_related_attributes: scoreRelatedAttributes,
    score_contexts: scoreContexts,
    decimal_number_candidates: oddsCandidates,
    note: "one_x_two_candidates exige um triplo explícito junto do marcador Bwin. Estes valores são os apresentados na página consultada, não odds históricas/de fecho. period_scores só é preenchido quando os cabeçalhos explícitos de 1.ª/2.ª Parte coincidem com a decomposição do FT e a soma dos golos. Caso contrário devolve null. score_evidence e score_related_attributes são provas de diagnóstico."
  };
}


async function fetchPeriodCornerStats(matchId) {
  const target = new URL("/2/x/feed/df_st_1_" + matchId, "https://2.flashscore.ninja");
  let response;
  try {
    response = await fetch(target.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.flashscore.pt/",
        "Origin": "https://www.flashscore.pt",
        "x-fsign": "SW9D1eZo",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(12_000)
    });
  } catch (error) {
    return { status: "unavailable", reason: "network_error", detail: String(error?.message || "").slice(0, 160), source_url: target.toString() };
  }
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return { status: "upstream_rejected", upstream_status: response.status, source_url: target.toString() };
  }
  if (!response.ok || response.status >= 300) {
    return { status: "upstream_error", upstream_status: response.status, source_url: target.toString() };
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) {
    return { status: "response_too_large", source_url: target.toString() };
  }
  const feed = new TextDecoder("utf-8").decode(bytes);
  const extracted = extractPeriodCornersFromFeed(feed);
  const hasHt = Boolean(extracted.corners_ht);
  const hasSt = Boolean(extracted.corners_st);
  return {
    status: hasHt && hasSt ? "available" : hasHt || hasSt ? "partial" : "no_period_corners",
    source_url: target.toString(),
    corners_ht: extracted.corners_ht,
    corners_st: extracted.corners_st,
    diagnostics: extracted.diagnostics,
    response_bytes: bytes.byteLength
  };
}

function compactDiagnostic(inspection) {
  const summary = summarizeInspection(inspection);
  const structure = summary.page_structure || {};
  const samples = Array.isArray(structure.dom_samples) ? structure.dom_samples : [];
  const statsSamples = samples.filter(item => /wcl-statistics|statistic/i.test(item.marker || '')).slice(0, 6).map(item => ({
    marker: item.marker, attributes: item.attributes,
    text_preview: String(item.text_preview || '').slice(0, 240),
    html_preview: String(item.html_preview || '').slice(0, 420)
  }));
  const competitionLinks = (structure.relevant_links || []).filter(item => String(item.href || '').includes('/futebol/') || /league|competition|tournament|breadcrumb|classif/i.test([item.href, item.text, item.class, item.id].filter(Boolean).join(' '))).slice(0, 8);
  const identityAttributes = (structure.data_attributes || []).filter(item => /country|league|competition|tournament|season|stage|round/i.test([item.name, item.value, item.class, item.id].join(' '))).slice(0, 10);
  return { mode: 'compact-diagnostic', match_id: summary.match_id, title: summary.title, teams: summary.teams, competition_identity: summary.competition_identity, statistics: summary.statistics, missing_fields: summary.missing_fields, evidence: { statistics_dom: statsSamples, competition_links: competitionLinks, identity_attributes: identityAttributes, text_terms: (structure.text_terms || []).filter(item => /bundesliga|liga|league|tournament|competição|classificações|época/i.test(item.term + ' ' + item.context)).slice(0, 6) }, limits: { statistics_dom_samples: 6, html_preview_chars: 420, competition_links: 8, identity_attributes: 10 } };
}
async function resolveCompetitionFromDiscovery(date, matchId) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: "unavailable", reason: "match_date_unavailable" };
  const parsed = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return { status: "unavailable", reason: "invalid_match_date" };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const offset = Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
  if (!Number.isSafeInteger(offset) || Math.abs(offset) > 3650) return { status: "unavailable", reason: "date_out_of_supported_range" };
  const target = new URL("/", UPSTREAM);
  target.searchParams.set("d", String(offset));
  const cacheKey = new Request("https://simuladorfutebol-flashscore-proxy.cache/discovery?date=" + date);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  let html;
  if (cached) html = await cached.text();
  else {
    let response;
    try { response = await fetch(target.toString(), { method: "GET", redirect: "manual", headers: { "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.7", "User-Agent": "SimuladorFutebol/1.0" } }); }
    catch (error) { return { status: "unavailable", reason: "discovery_upstream_unavailable", detail: String(error?.message || "").slice(0, 120) }; }
    if (response.status === 403 || response.status === 429) return { status: "unavailable", reason: "discovery_upstream_rejected", upstream_status: response.status };
    if (!response.ok || response.status >= 300 || !(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) return { status: "unavailable", reason: "discovery_response_invalid", upstream_status: response.status };
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return { status: "unavailable", reason: "discovery_response_too_large" };
    html = new TextDecoder("utf-8").decode(body);
    await cache.put(cacheKey, new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600" } }));
  }
  return extractExplicitCompetitionForMatch(html, matchId) || { status: "unavailable", reason: "no_explicit_match_group" };
}
function summarizeInspection(inspection) {
  const structure = inspection.page_structure || {};
  const record = inspection.match_record || {};
  const links = Array.isArray(structure.links) ? structure.links : [];
  const scripts = Array.isArray(structure.scripts) ? structure.scripts : [];
  const dataAttributes = Array.isArray(structure.data_attributes) ? structure.data_attributes : [];
  const textTerms = Array.isArray(structure.text_terms) ? structure.text_terms : [];
  const domSamples = Array.isArray(structure.dom_samples) ? structure.dom_samples : [];
  const relevantLinks = links.filter(item =>
    /stat|league|tournament|competition|breadcrumb|standings|classif|match|event|tab/i
      .test([item.href, item.text, item.class, item.id, item.title, item["aria-label"], item["data-testid"]].filter(Boolean).join(" "))
  );
  const relevantScripts = scripts.filter(item => item.src || item.has_json_content).slice(0, 10);
  const relevantAttributes = dataAttributes.slice(0, 15);
  const statistics = record.statistics && typeof record.statistics === "object" ? record.statistics : {};
  const bwin = inspection.bwin || {};

  return {
    mode: "summary",
    title: inspection.title || null,
    match_id: record.match_id || null,
    teams: record.teams || null,
    team_links: Array.isArray(inspection.team_links) ? inspection.team_links : [],
    date_time: record.date_time || null,
    status: record.status || null,
    competition_identity: {
      country: record.country || null,
      competition: record.competition || null,
      season: record.season || null,
      stage: record.stage || null,
      round: record.round || null
    },
    score: record.score || null,
    statistics,
    missing_fields: record.missing_fields || [],
    bwin: {
      found: Boolean(bwin.found),
      one_x_two_candidates: Array.isArray(bwin.one_x_two_candidates) ? bwin.one_x_two_candidates.length : 0,
      odds_markers: (Array.isArray(bwin.odds_markers) ? bwin.odds_markers : []).slice(0, 4).map(item => ({
        marker: String(item.marker || "").slice(0, 220),
        nearby_decimal_values: (item.nearby_decimal_values || []).slice(0, 8),
        context: String(item.context || "").slice(0, 260)
      }))
    },
    page_structure: {
      counts: structure.counts || {
        links: links.length,
        scripts: scripts.length,
        data_attributes: dataAttributes.length,
        class_tokens: (structure.class_tokens || []).length,
        id_tokens: (structure.id_tokens || []).length
      },
      relevant_links: relevantLinks.slice(0, 20),
      scripts: relevantScripts,
      data_attributes: relevantAttributes,
      class_tokens: (structure.class_tokens || []).slice(0, 20),
      id_tokens: (structure.id_tokens || []).slice(0, 20),
      text_terms: textTerms.slice(0, 15),
      dom_samples: domSamples,
      truncated: {
        relevant_links: relevantLinks.length > 20,
        scripts: scripts.filter(item => item.src || item.has_json_content).length > 10,
        data_attributes: dataAttributes.length > 15,
        text_terms: textTerms.length > 15,
        dom_samples: domSamples.length >= 12
      }
    },
    note: "Resumo do HTML já recebido. Não foram feitos pedidos adicionais ao Flashscore; listas longas foram limitadas."
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return json({ error: "origin_not_allowed" }, 403, headers);
      }
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, headers);
    }

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "origin_not_allowed" }, 403, headers);
    }

    const incoming = new URL(request.url);

    if (incoming.pathname === "/trigger-collection") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);
      const auth = request.headers.get("Authorization") || "";
      if (!env.CONTROL_TOKEN || auth !== "Bearer " + env.CONTROL_TOKEN) {
        return json({ error: "unauthorized", message: "Acesso não autorizado ao controlo de recolha." }, 401, headers);
      }
      if (!env.GITHUB_ACTIONS_TOKEN) {
        return json({ error: "control_not_configured", message: "Falta configurar o token de Actions no Worker." }, 503, headers);
      }
      let body;
      try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, headers); }
      const targetDate = String(body?.target_date || "");
      const parsedDate = new Date(targetDate + "T00:00:00Z");
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== targetDate || targetDate > today) {
        return json({ error: "invalid_date", message: "Indica uma data válida, não futura, no formato YYYY-MM-DD." }, 400, headers);
      }
      const githubHeaders = { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + env.GITHUB_ACTIONS_TOKEN, "X-GitHub-Api-Version": "2022-11-28" };
      const workflow = "recolha-diaria-flashscore.yml";
      const runsUrl = "https://api.github.com/repos/markyto34/simuladorfutebol/actions/workflows/" + workflow + "/runs?per_page=20";
      let runsResponse;
      try { runsResponse = await fetch(runsUrl, { headers: githubHeaders, signal: AbortSignal.timeout(12000), cache: "no-store" }); }
      catch { return json({ error: "github_unavailable", message: "Não foi possível verificar o estado atual no GitHub." }, 502, headers); }
      if (!runsResponse.ok) return json({ error: "github_check_failed", message: "O GitHub não permitiu verificar as execuções existentes.", github_status: runsResponse.status }, 502, headers);
      const runsData = await runsResponse.json();
      const busyRun = (runsData.workflow_runs || []).find(run => run.status === "queued" || run.status === "in_progress");
      if (busyRun) return json({ error: "collection_in_progress", message: "Já existe uma recolha na fila ou em execução. Aguarda que termine.", run_id: busyRun.id, run_url: busyRun.html_url }, 409, headers);
      let dispatchResponse;
      try {
        dispatchResponse = await fetch("https://api.github.com/repos/markyto34/simuladorfutebol/actions/workflows/" + workflow + "/dispatches", {
          method: "POST", headers: { ...githubHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ ref: "main", inputs: { target_date: targetDate } }),
          signal: AbortSignal.timeout(12000)
        });
      } catch { return json({ error: "dispatch_unavailable", message: "Não foi possível enviar o pedido ao GitHub." }, 502, headers); }
      if (dispatchResponse.status !== 204) return json({ error: "dispatch_failed", message: "O GitHub recusou o início da recolha.", github_status: dispatchResponse.status }, 502, headers);
      return json({ ok: true, target_date: targetDate, message: "Pedido de recolha aceite pelo GitHub Actions." }, 202, headers);
    }

    if (incoming.pathname === "/health") {
      return json({
        ok: true,
        service: "simuladorfutebol-flashscore-proxy",
        upstream: UPSTREAM,
        mode: "single-match-html-and-period-statistics-feed"
      }, 200, headers);
    }

    if (incoming.pathname === "/team-inspect") {
      const teamId = incoming.searchParams.get("id") || "";
      if (!/^[A-Za-z0-9]{8}$/.test(teamId)) {
        return json({ error: "invalid_team", message: "Indica um ID Flashscore de equipa com 8 caracteres." }, 400, headers);
      }
      const teamTarget = new URL("/2/x/feed/pr_1_198_" + teamId + "_0_1_en_1", "https://global.flashscore.ninja");
      let teamResponse;
      try {
        teamResponse = await fetch(teamTarget.toString(), {
          method: "GET",
          headers: {
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.flashscore.pt/",
            "Origin": "https://www.flashscore.pt",
            "x-fsign": "SW9D1eZo",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
          }
        });
      } catch (error) {
        return json({ error: "upstream_unavailable", detail: String(error?.message || "Falha de ligação").slice(0, 180) }, 502, headers);
      }
      if (!teamResponse.ok) return json({ error: "upstream_rejected", upstream_status: teamResponse.status }, 502, headers);
      const bytes = await teamResponse.arrayBuffer();
      if (bytes.byteLength > MAX_BODY_BYTES) return json({ error: "response_too_large" }, 502, headers);
      const feed = new TextDecoder("utf-8").decode(bytes);
      const events = parseTeamResultsFeed(feed);
      const latestFinished = selectLatestFinishedTeamMatches(events, 5);
      const discovered = new Map();
      for (const event of events) {
        for (const side of [event.home, event.away]) {
          if (side?.id && /^[A-Za-z0-9]{8}$/.test(side.id) && side.name) {
            discovered.set(side.id, { team_id: side.id, name: side.name, slug: side.slug || null });
          }
        }
      }
      return json({
        ok: true,
        team_id: teamId,
        upstream_status: teamResponse.status,
        content_type: teamResponse.headers.get("content-type") || null,
        body_bytes: bytes.byteLength,
        source_url: teamTarget.toString(),
        event_count: events.length,
        finished_count: events.filter(event => event.stage === "finished").length,
        latest_finished_matches: latestFinished,
        discovered_teams: [...discovered.values()],
        note: "Últimos cinco jogos concluídos da equipa e IDs de todos os adversários encontrados no feed recente. Nenhuma recolha de estatísticas foi iniciada."
      }, 200, headers);
    }

    if (incoming.pathname === "/discover-inspect") {
      const date = incoming.searchParams.get("date") || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json({ error: "invalid_date", message: "Indica a data no formato YYYY-MM-DD." }, 400, headers);
      }
      const parsedDate = new Date(date + "T00:00:00Z");
      if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
        return json({ error: "invalid_date" }, 400, headers);
      }
      // O Flashscore mobile usa offsets relativos: ?d=0 (hoje), ?d=-1 (ontem).
      // Converter a data pedida para o offset do calendário de Portugal.
      const portugalToday = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date());
      const requestedDay = Date.parse(date + "T00:00:00Z");
      const todayDay = Date.parse(portugalToday + "T00:00:00Z");
      const dayOffset = Math.round((requestedDay - todayDay) / 86_400_000);
      if (!Number.isSafeInteger(dayOffset) || Math.abs(dayOffset) > 3650) {
        return json({ error: "date_out_of_supported_range" }, 400, headers);
      }
      // Cache curta por data: evita repetir a descoberta durante retries/backfills.
      const discoveryCache = caches.default;
      const discoveryCacheKey = new Request("https://simuladorfutebol-flashscore-proxy.cache/discovery?date=" + date);
      const cachedDiscovery = await discoveryCache.match(discoveryCacheKey);
      let discoveryHtml;
      let discoveryStatus = 200;
      let discoveryType = "text/html; charset=utf-8";
      if (cachedDiscovery) {
        discoveryHtml = await cachedDiscovery.text();
      } else {
        // URL fixa do Flashscore; nunca encaminhar URL arbitrário.
        const discoveryTarget = new URL("/", UPSTREAM);
        discoveryTarget.searchParams.set("d", String(dayOffset));
        let discoveryResponse;
        try {
          discoveryResponse = await fetch(discoveryTarget.toString(), {
            method: "GET", redirect: "manual",
            headers: { "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.7", "User-Agent": "SimuladorFutebol/1.0" }
          });
        } catch (error) {
          return json({ error: "upstream_unavailable", detail: String(error?.message || "Falha de ligação").slice(0, 200) }, 502, headers);
        }
        if (discoveryResponse.status >= 300 && discoveryResponse.status < 400) {
          return json({ error: "upstream_redirect", upstream_status: discoveryResponse.status, message: "O Flashscore redirecionou a página de resultados; não foi seguido." }, 502, headers);
        }
        if (!discoveryResponse.ok) {
          return json({ error: "upstream_rejected", upstream_status: discoveryResponse.status, message: discoveryResponse.status === 403 || discoveryResponse.status === 429 ? "O Flashscore recusou ou limitou o pedido. A recolha foi interrompida." : "A página de resultados não pôde ser obtida." }, 502, headers);
        }
        discoveryType = discoveryResponse.headers.get("content-type") || "";
        if (!discoveryType.toLowerCase().includes("text/html")) return json({ error: "unexpected_content_type", content_type: discoveryType || "unknown" }, 502, headers);
        const discoveryBody = await discoveryResponse.arrayBuffer();
        if (discoveryBody.byteLength > MAX_BODY_BYTES) return json({ error: "response_too_large" }, 502, headers);
        discoveryHtml = new TextDecoder("utf-8").decode(discoveryBody);
        ctx.waitUntil(discoveryCache.put(discoveryCacheKey, new Response(discoveryHtml, {
          headers: { "Content-Type": discoveryType, "Cache-Control": "public, max-age=" + CACHE_SECONDS }
        })));
        discoveryStatus = discoveryResponse.status;
      }
      const summaryOnly = incoming.searchParams.get("summary") === "1";
      const targetMatchId = incoming.searchParams.get("match_id") || null;
      if (targetMatchId && !validMatchId(targetMatchId)) {
        return json({ error: "invalid_match_id", message: "O match_id deve ser um identificador alfanumérico válido." }, 400, headers);
      }
      return json({ ok: true, upstream_status: discoveryStatus, content_type: discoveryType, body_bytes: new TextEncoder().encode(discoveryHtml).byteLength, inspection: inspectMatchDiscovery(discoveryHtml, date, { summary: summaryOnly, idsOnly: incoming.searchParams.get("ids") === "1", matchId: targetMatchId }) }, 200, headers);
    }

    const inspectOnly = incoming.pathname === "/inspect";
    const recordOnly = incoming.pathname === "/record";
    if (!inspectOnly && !recordOnly && incoming.pathname !== "/match") {
      return json({
        error: "not_found",
        usage: "/match?id=FLASHscore_MATCH_ID, /record?id=FLASHscore_MATCH_ID or /inspect?id=FLASHscore_MATCH_ID"
      }, 404, headers);
    }

    // /record recolhe a página de estatísticas e as odds Bwin. Quando há estatísticas,
    // consulta também o feed de períodos para cantos HT/ST; não faz descoberta secundária.
    const requestedTab = incoming.searchParams.get("tab") || (recordOnly ? "statistics" : "summary");
    if (!inspectOnly && !recordOnly && incoming.searchParams.has("tab")) {
      return json({ error: "tab_only_supported_on_inspect" }, 400, headers);
    }
    const tab = resolveMatchTab(requestedTab);
    if (!tab) {
      return json({ error: "invalid_tab", allowed_tabs: ["summary", "statistics", "lineups", "standings", "commentary", "h2h"] }, 400, headers);
    }

    const matchId = incoming.searchParams.get("id");
    if (!validMatchId(matchId)) {
      return json({
        error: "invalid_match_id",
        message: "Indica apenas o identificador alfanumérico de uma partida."
      }, 400, headers);
    }

    const target = new URL(buildMatchTabUrl(matchId, requestedTab), UPSTREAM);
    const cacheTarget = new URL(target.toString());
    if (recordOnly) cacheTarget.searchParams.set("record_schema", "2");
    const cacheKey = new Request(cacheTarget.toString(), { method: "GET" });
    const cache = caches.default;
    let html = null;

    if (!inspectOnly) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const outputHeaders = new Headers(cached.headers);
        for (const [key, value] of Object.entries(headers)) outputHeaders.set(key, value);
        outputHeaders.set("X-Proxy-Cache", "HIT");
        return new Response(cached.body, { status: cached.status, headers: outputHeaders });
      }
    }

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: "GET",
        redirect: "manual",
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.7",
          "User-Agent": "SimuladorFutebol/1.0"
        }
      });
    } catch (error) {
      return json({
        error: "upstream_unavailable",
        detail: String(error?.message || "Falha de ligação").slice(0, 200)
      }, 502, headers);
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      return json({
        error: "upstream_redirect",
        upstream_status: upstream.status,
        message: "O destino redirecionou o pedido; não foi seguido automaticamente."
      }, 502, headers);
    }

    if (!upstream.ok) {
      return json({
        error: "upstream_rejected",
        upstream_status: upstream.status,
        message: upstream.status === 403 || upstream.status === 429
          ? "O Flashscore recusou ou limitou o pedido. A recolha foi interrompida."
          : "A página da partida não pôde ser obtida."
      }, 502, headers);
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return json({
        error: "unexpected_content_type",
        content_type: contentType || "unknown"
      }, 502, headers);
    }

    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return json({ error: "response_too_large" }, 502, headers);
    }

    html = new TextDecoder("utf-8").decode(body);

    if (inspectOnly || recordOnly) {
      const fullInspection = inspectHtml(html, matchId, { sourceUrl: target.toString() });
      const record = fullInspection.match_record;
      if (recordOnly) {
        // O separador de estatísticas nem sempre inclui o marcador. Quando o
        // jogo está terminado e o resultado falta, consultar o Sumário uma vez.
        // A extração continua a exigir decomposição explícita e validação dos parciais.
        const finishedStatus = /^(?:Terminado|Tempo Final|Depois de Prolongamento|Após prolongamento|A\.P\.)$/i.test(String(record?.status || ""));
        const hasMatchStatistics = Object.keys(record?.statistics || {}).length > 0;
        if (hasMatchStatistics || finishedStatus) {
          const periodFeed = await fetchPeriodCornerStats(matchId);
          record.period_statistics_feed = {
            status: periodFeed.status,
            source_url: periodFeed.source_url || null,
            upstream_status: periodFeed.upstream_status || null,
            reason: periodFeed.reason || null,
            diagnostics: periodFeed.diagnostics || null
          };
          record.statistics = record.statistics || {};
          for (const [key, value] of [["corners_ht", periodFeed.corners_ht], ["corners_st", periodFeed.corners_st]]) {
            if (!value) continue;
            record.statistics[key] = {
              home: value.home,
              away: value.away,
              unit: null,
              source_label: value.source_label,
              source_period: value.source_period
            };
            record.source_capture.evidence.push({
              field: "statistics." + key,
              source: "Flashscore period statistics feed",
              period: value.source_period,
              label: value.source_label,
              values: { home: value.home, away: value.away }
            });
          }
          if (Object.keys(record.statistics).length > 0) {
            record.missing_fields = (record.missing_fields || []).filter(field => field !== "statistics");
          }
        }
        if (requestedTab === "statistics" && finishedStatus &&
            (!record?.score?.half_time || !record?.score?.second_half)) {
          const summaryTarget = new URL(buildMatchTabUrl(matchId, "summary"), UPSTREAM);
          try {
            const summaryResponse = await fetch(summaryTarget.toString(), {
              method: "GET",
              redirect: "manual",
              headers: {
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.7",
                "User-Agent": "SimuladorFutebol/1.0"
              }
            });
            const summaryType = summaryResponse.headers.get("content-type") || "";
            if (summaryResponse.ok && summaryType.toLowerCase().includes("text/html")) {
              const summaryBody = await summaryResponse.arrayBuffer();
              if (summaryBody.byteLength <= MAX_BODY_BYTES) {
                const summaryHtml = new TextDecoder("utf-8").decode(summaryBody);
                const summaryRecord = extractStructuredMatch(summaryHtml, matchId, {
                  httpStatus: summaryResponse.status,
                  sourceUrl: summaryTarget.toString()
                });
                const summaryHasPeriods = Boolean(
                  summaryRecord?.score?.half_time && summaryRecord?.score?.second_half &&
                  summaryRecord?.score?.full_time
                );
                const statsFullTime = record?.score?.full_time;
                const summaryFullTime = summaryRecord?.score?.full_time;
                const sameFullTime = !statsFullTime || (
                  statsFullTime.home === summaryFullTime?.home &&
                  statsFullTime.away === summaryFullTime?.away
                );
                if (summaryHasPeriods && sameFullTime) {
                  record.score = {
                    ...(record.score || {}),
                    half_time: summaryRecord.score.half_time,
                    second_half: summaryRecord.score.second_half,
                    ...(summaryRecord.score.extra_time ? { extra_time: summaryRecord.score.extra_time } : {}),
                    full_time: statsFullTime || summaryRecord.score.full_time
                  };
                  record.missing_fields = (record.missing_fields || []).filter(field => field !== "score_full_time");
                  record.source_capture.evidence.push({
                    field: "score_periods",
                    source: "validated explicit period scores from summary tab fallback",
                    value: {
                      half_time: record.score.half_time,
                      second_half: record.score.second_half
                    }
                  });
                }
              }
            }
          } catch {
            // Falha do pedido secundário não invalida as estatísticas já recolhidas.
          }
        }
        const recordResponse = json({
          ok: true,
          match_id: matchId,
          upstream_status: upstream.status,
          requested_tab: requestedTab,
          source_url: target.toString(),
          record
        }, 200, headers);
        // Cachear o JSON já extraído, não o HTML bruto, porque /record devolve JSON.
        const cacheableRecordResponse = new Response(recordResponse.clone().body, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=" + CACHE_SECONDS,
            ...headers
          }
        });
        ctx.waitUntil(cache.put(cacheKey, cacheableRecordResponse));
        return recordResponse;
      }
      if (record && (!record.country || !record.competition)) {
        const matchDate = record.date_time_iso_local ? record.date_time_iso_local.slice(0, 10) : null;
        const identity = await resolveCompetitionFromDiscovery(matchDate, matchId);
        record.competition_identity = identity;
        if (identity.status === "identified") {
          record.country = identity.country;
          record.competition = identity.competition;
          record.missing_fields = (record.missing_fields || []).filter(field => field !== "country" && field !== "competition");
          record.source_capture.evidence.push({ field: "competition_identity", source: "explicit score-data group from date discovery", value: identity });
        }
      }
      const summaryOnly = incoming.searchParams.get("summary") === "1";
      const diagnosticOnly = incoming.searchParams.get("diagnostic") === "1";
      return json({
        ok: true,
        match_id: matchId,
        upstream_status: upstream.status,
        content_type: contentType,
        body_bytes: body.byteLength,
        requested_tab: requestedTab,
        source_url: target.toString(),
        inspection: diagnosticOnly ? compactDiagnostic(fullInspection) : summaryOnly ? summarizeInspection(fullInspection) : fullInspection
      }, 200, headers);
    }

    const responseHeaders = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
      "X-Content-Type-Options": "nosniff",
      "X-Proxy-Cache": "MISS"
    });
    for (const [key, value] of Object.entries(headers)) {
      responseHeaders.set(key, value);
    }

    const response = new Response(body, { status: 200, headers: responseHeaders });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
};
