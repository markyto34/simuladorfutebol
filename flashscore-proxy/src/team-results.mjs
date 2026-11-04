function decode(value) {
  return String(value ?? "")
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"').replace(/\\u0026/gi, "&")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, " ")
    .replace(/\\s+/g, " ").trim();
}
function plain(value) {
  return decode(String(value ?? "").replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, " ").replace(/<[^>]*>/g, " "));
}
function attr(raw, name) {
  return raw.match(new RegExp("\\b" + name + "\\s*=\\s*(['\\"])([\\s\\S]*?)\\1", "i"))?.[2] ?? "";
}
export function extractTeamProfileLinks(html) {
  const teams = new Map();
  for (const item of String(html ?? "").matchAll(/<a\\b([^>]*?)href\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))([^>]*)>([\\s\\S]*?)<\\/a\\s*>/gi)) {
    const href = decode(item[2] || item[3] || item[4] || "");
    const match = href.match(/\\/(?:equipa|team)\\/([a-z0-9-]{1,100})\\/([A-Za-z0-9]{8})(?:\\/|[?#]|$)/i);
    if (!match) continue;
    const slug = match[1], id = match[2];
    const label = (plain(item[6]) || attr(item[1] + " " + item[5], "aria-label") || attr(item[1] + " " + item[5], "title")).slice(0, 120);
    const previous = teams.get(id);
    if (!previous || (!previous.name && label)) teams.set(id, { team_id: id, slug, name: label || null, href: "/" + (href.includes("/team/") ? "team" : "equipa") + "/" + slug + "/" + id + "/" });
  }
  return [...teams.values()];
}
export function extractTeamResultCandidates(html, limit = 30) {
  const results = new Map();
  const source = String(html ?? "");
  for (const item of source.matchAll(/<a\\b([^>]*?)href\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))([^>]*)>([\\s\\S]*?)<\\/a\\s*>/gi)) {
    const href = decode(item[2] || item[3] || item[4] || "");
    const match = href.match(/\\/jogo\\/([A-Za-z0-9]{6,16})(?:\\/|[?#]|$)/i);
    if (!match || results.has(match[1])) continue;
    const start = Math.max(0, item.index - 900);
    const end = Math.min(source.length, item.index + item[0].length + 900);
    const contextHtml = source.slice(start, end);
    const contextText = plain(contextHtml).slice(0, 900);
    const date = contextText.match(/\\b(\\d{2}\\.\\d{2}\\.\\d{4})\\b/)?.[1] || null;
    const scores = [...contextText.matchAll(/\\b(\\d{1,2})\\s*[-:]\\s*(\\d{1,2})\\b/g)].map(m => [Number(m[1]), Number(m[2])]);
    results.set(match[1], {
      match_id: match[1],
      date_text: date,
      score_candidates: scores.slice(0, 4),
      anchor_text: plain(item[6]).slice(0, 180) || null,
      context_text: contextText
    });
    if (results.size >= limit) break;
  }
  return [...results.values()];
}
