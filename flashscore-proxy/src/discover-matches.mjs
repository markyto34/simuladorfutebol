function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function plainText(value) {
  return decodeEntities(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0026/gi, "&"))
    .replace(/\s+/g, " ")
    .trim();
}

export function inspectMatchDiscovery(html, requestedDate) {
  const matches = [];
  const seen = new Set();
  const anchorPattern = /<a\b([^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*)>([\s\S]*?)<\/a>/gi;
  for (const item of html.matchAll(anchorPattern)) {
    const href = decodeEntities(item[2] || item[3] || item[4] || "");
    const id = href.match(/\/jogo\/([A-Za-z0-9]{6,16})(?:\/|[?#]|$)/i)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const start = Math.max(0, item.index - 900);
    const end = Math.min(html.length, item.index + item[0].length + 500);
    const context = plainText(html.slice(start, end)).slice(-900);
    matches.push({
      match_id: id,
      href,
      anchor_text: plainText(item[5]).slice(0, 180) || null,
      context: context || null
    });
    if (matches.length >= 500) break;
  }

  const pageTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const dateTokens = [...new Set((html.match(/\b\d{2}\.\d{2}\.\d{4}\b/g) || []))].slice(0, 30);
  return {
    requested_date: requestedDate,
    page_title: pageTitle ? plainText(pageTitle).slice(0, 180) : null,
    match_count: matches.length,
    truncated: matches.length >= 500,
    date_tokens: dateTokens,
    matches,
    note: "Diagnóstico passivo da página de resultados. Os contextos são excertos HTML e ainda não constituem metadados validados de país/competição nem confirmação de que todos os jogos da data foram listados."
  };
}
