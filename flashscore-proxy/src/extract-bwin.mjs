// Conservative extraction of a Bwin 1X2 triplet from Flashscore match HTML.
function decodeEscapedHtml(value) {
  return String(value)
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"').replace(/\\u0026/gi, "&")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}
export function extractBwin1x2(html) {
  const decoded = decodeEscapedHtml(html);
  const marker = /<a\b(?=[^>]*data-bookmaker-id=["']459["'])(?=[^>]*data-event=["']odds_1["'])[^>]*>/gi;
  const candidates = [];
  for (const match of decoded.matchAll(marker)) {
    const raw = decoded.slice(Math.max(0, match.index - 900), Math.min(decoded.length, match.index + match[0].length + 500));
    const text = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!/bwin\.pt/i.test(text)) continue;
    const triplets = [...text.matchAll(/\b(\d{1,2}\.\d{2,3})\s*\|\s*(\d{1,2}\.\d{2,3})\s*\|\s*(\d{1,2}\.\d{2,3})\b/g)];
    for (const triplet of triplets) {
      const odds = triplet.slice(1, 4).map(Number);
      if (odds.some(value => !Number.isFinite(value) || value <= 1 || value > 1000)) continue;
      const key = odds.join("|");
      if (candidates.some(item => item.key === key)) continue;
      candidates.push({ key, bookmaker_id: "459", bookmaker: "Bwin", market: "1X2",
        selection_order: ["1", "X", "2"], home: odds[0], draw: odds[1], away: odds[2],
        evidence: "Três valores decimais separados por barras verticais no contexto do link Bwin e da atribuição bwin.pt." });
    }
  }
  return candidates.map(({ key, ...candidate }) => candidate);
}
