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

    if (incoming.pathname !== "/match") {
      return json({
        error: "not_found",
        usage: "/match?id=FLASHscore_MATCH_ID"
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
    let cached = await cache.match(cacheKey);

    if (cached) {
      const outputHeaders = new Headers(cached.headers);
      for (const [key, value] of Object.entries(headers)) outputHeaders.set(key, value);
      outputHeaders.set("X-Proxy-Cache", "HIT");
      return new Response(cached.body, { status: cached.status, headers: outputHeaders });
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
