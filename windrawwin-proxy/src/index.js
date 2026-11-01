const UPSTREAM = "https://www.windrawwin.com";
const ALLOWED_ORIGINS = new Set([
  "https://simuladorfutebol.onrender.com"
]);
const CACHE_SECONDS = 900;

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://simuladorfutebol.onrender.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

function safePath(raw) {
  if (!raw || raw.length > 500 || !raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || /[\r\n]/.test(raw)) return null;
  let url;
  try { url = new URL(raw, UPSTREAM); } catch { return null; }
  if (url.origin !== UPSTREAM) return null;
  if (!/^\/(predictions|football-statistics|team-statistics|teams|leagues|results)(\/|$)/i.test(url.pathname)) return null;
  return url.pathname + url.search;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405, headers);
    }

    const incoming = new URL(request.url);
    if (incoming.pathname === "/health") {
      return json({ ok: true, service: "simuladorfutebol-windrawwin-proxy", upstream: UPSTREAM }, 200, headers);
    }

    if (!ALLOWED_ORIGINS.has(origin) && origin !== "") {
      return json({ error: "origin_not_allowed" }, 403, headers);
    }

    const path = safePath(incoming.searchParams.get("path") || "");
    if (!path) {
      return json({
        error: "invalid_path",
        usage: "/page?path=/predictions/today"
      }, 400, headers);
    }

    const target = new URL(path, UPSTREAM);
    const cacheKey = new Request(target.toString(), { method: "GET" });
    const cache = caches.default;
    let response = await cache.match(cacheKey);

    if (!response) {
      try {
        const upstream = await fetch(target.toString(), {
          method: "GET",
          headers: {
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-GB,en;q=0.9"
          },
          redirect: "follow"
        });
        if (!upstream.ok) {
          return json({ error: "upstream_error", status: upstream.status }, 502, headers);
        }
        const contentType = upstream.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          return json({ error: "unexpected_content_type" }, 502, headers);
        }
        const body = await upstream.text();
        if (body.length > 3_000_000) {
          return json({ error: "upstream_response_too_large" }, 502, headers);
        }
        response = new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
            "X-Proxy-Cache": "MISS"
          }
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      } catch {
        return json({ error: "upstream_unavailable" }, 502, headers);
      }
    } else {
      response = new Response(response.body, {
        status: response.status,
        headers: { ...Object.fromEntries(response.headers), "X-Proxy-Cache": "HIT" }
      });
    }

    const outputHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) outputHeaders.set(key, value);
    outputHeaders.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers: outputHeaders });
  }
};
