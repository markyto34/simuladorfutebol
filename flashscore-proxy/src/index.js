import { extractBwin1x2 } from "./extract-bwin.mjs";
import { inspectScoreEvidence } from "./extract-scores.mjs";
import { extractPeriodScores } from "./extract-period-scores.mjs";
import { inspectMatchDiscovery } from "./discover-matches.mjs";
import { extractStructuredMatch } from "./extract-match-record.mjs";
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

function inspectHtml(html, matchId) {
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
    match_record: extractStructuredMatch(html, matchId, { httpStatus: 200 }),
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

    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405, headers);
    }

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "origin_not_allowed" }, 403, headers);
    }

    const incoming = new URL(request.url);

    if (incoming.pathname === "/health") {
      return json({
        ok: true,
        service: "simuladorfutebol-flashscore-proxy",
        upstream: UPSTREAM,
        mode: "single-match-html-relay"
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
      const discoveryType = discoveryResponse.headers.get("content-type") || "";
      if (!discoveryType.toLowerCase().includes("text/html")) return json({ error: "unexpected_content_type", content_type: discoveryType || "unknown" }, 502, headers);
      const discoveryBody = await discoveryResponse.arrayBuffer();
      if (discoveryBody.byteLength > MAX_BODY_BYTES) return json({ error: "response_too_large" }, 502, headers);
      const discoveryHtml = new TextDecoder("utf-8").decode(discoveryBody);
      const summaryOnly = incoming.searchParams.get("summary") === "1";
      return json({ ok: true, upstream_status: discoveryResponse.status, content_type: discoveryType, body_bytes: discoveryBody.byteLength, inspection: inspectMatchDiscovery(discoveryHtml, date, { summary: summaryOnly }) }, 200, headers);
    }

    const inspectOnly = incoming.pathname === "/inspect";
    if (!inspectOnly && incoming.pathname !== "/match") {
      return json({
        error: "not_found",
        usage: "/match?id=FLASHscore_MATCH_ID or /inspect?id=FLASHscore_MATCH_ID"
      }, 404, headers);
    }

    const matchId = incoming.searchParams.get("id");
    if (!validMatchId(matchId)) {
      return json({
        error: "invalid_match_id",
        message: "Indica apenas o identificador alfanumérico de uma partida."
      }, 400, headers);
    }

    const target = new URL(`/jogo/${matchId}/`, UPSTREAM);
    const cacheKey = new Request(target.toString(), { method: "GET" });
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

    if (inspectOnly) {
      return json({
        ok: true,
        match_id: matchId,
        upstream_status: upstream.status,
        content_type: contentType,
        body_bytes: body.byteLength,
        inspection: inspectHtml(html, matchId)
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
