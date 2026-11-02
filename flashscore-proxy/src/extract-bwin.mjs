// Conservative extraction of a Bwin 1X2 triplet from Flashscore match HTML.
function decodeEscapedHtml(value) {
  return String(value)
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"').replace(/\\u0026/gi, "&")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}
const TRIPLET = /\b(\d{1,2}\.\d{2,3})\s*\|\s*(\d{1,2}\.\d{2,3})\s*\|\s*(\d{1,2}\.\d{2,3})\b/g;

function tripletFrom(value, mode) {
  const matches = [...String(value).matchAll(TRIPLET)];
  if (!matches.length) return null;
  // If odds sit inside the Bwin anchor, use those. Otherwise use the closest
  // triplet immediately before it (the observed Flashscore layout), falling
  // back to the first triplet after it.
  const selected = mode === "last" ? matches[matches.length - 1] : matches[0];
  return selected.slice(1, 4).map(Number);
}

export function extractBwin1x2(html) {
  const decoded = decodeEscapedHtml(html);
  const marker = /<a\b(?=[^>]*data-bookmaker-id=["']459["'])(?=[^>]*data-event=["']odds_1["'])[^>]*>/gi;
  const candidates = [];
  for (const match of decoded.matchAll(marker)) {
    const anchorStart = match.index;
    const anchorContentStart = anchorStart + match[0].length;
    const anchorClose = decoded.indexOf("</a>", anchorContentStart);
    const anchorContentEnd = anchorClose < 0 ? Math.min(decoded.length, anchorContentStart + 500) : anchorClose;
    const rawStart = Math.max(0, anchorStart - 900);
    const rawEnd = Math.min(decoded.length, anchorContentEnd + 500);
    const raw = decoded.slice(rawStart, rawEnd);
    const text = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!/bwin\.pt/i.test(text)) continue;

    const inAnchor = tripletFrom(decoded.slice(anchorContentStart, anchorContentEnd), "first");
    const beforeAnchor = tripletFrom(decoded.slice(rawStart, anchorStart), "last");
    const afterAnchor = tripletFrom(decoded.slice(anchorContentEnd, rawEnd), "first");
    const odds = inAnchor || beforeAnchor || afterAnchor;
    if (!odds || odds.some(value => !Number.isFinite(value) || value <= 1 || value > 1000)) continue;

    const key = odds.join("|");
    if (candidates.some(item => item.key === key)) continue;
    candidates.push({
      key, bookmaker_id: "459", bookmaker: "Bwin", market: "1X2",
      selection_order: ["1", "X", "2"],
      home: odds[0], draw: odds[1], away: odds[2],
      evidence: "Triplo 1X2 associado ao marcador Flashscore data-bookmaker-id=459 e à indicação bwin.pt."
    });
  }
  return candidates.map(({ key, ...candidate }) => candidate);
}
