// Extract the Bwin 1X2 triplet shown by Flashscore, using the bookmaker marker
// and the nearby explicit "bwin.pt" attribution as evidence.
function decodeEscapedHtml(value) {
  return String(value)
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"').replace(/\\u0026/gi, "&")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

const TRIPLET = /\b(\d{1,2}\.\d{2,3})\s*\|\s*(\d{1,2}\.\d{2,3})\s*\|\s*(\d{1,2}\.\d{2,3})\b/g;

function visibleText(value) {
  return decodeEscapedHtml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractBwin1x2(html) {
  const decoded = decodeEscapedHtml(html);
  const marker = /<a\b(?=[^>]*data-bookmaker-id=["']459["'])(?=[^>]*data-event=["']odds_1["'])[^>]*>/gi;
  const candidates = [];

  for (const match of decoded.matchAll(marker)) {
    const markerStart = match.index;
    const rawStart = Math.max(0, markerStart - 1400);
    const rawEnd = Math.min(decoded.length, markerStart + 1400);
    const rawWindow = decoded.slice(rawStart, rawEnd);
    const text = visibleText(rawWindow);
    if (!/bwin\.pt/i.test(text)) continue;

    const markerTextOffset = visibleText(decoded.slice(rawStart, markerStart)).length;
    const matches = [...text.matchAll(TRIPLET)];
    if (!matches.length) continue;

    matches.sort((a, b) =>
      Math.abs(a.index - markerTextOffset) - Math.abs(b.index - markerTextOffset)
    );
    const odds = matches[0].slice(1, 4).map(Number);
    if (odds.some(value => !Number.isFinite(value) || value <= 1 || value > 1000)) continue;

    const key = odds.join("|");
    if (candidates.some(item => item.key === key)) continue;
    candidates.push({
      key, bookmaker_id: "459", bookmaker: "Bwin", market: "1X2",
      selection_order: ["1", "X", "2"],
      home: odds[0], draw: odds[1], away: odds[2],
      evidence: "Triplo 1X2 próximo do marcador Flashscore data-bookmaker-id=459 e associado à indicação bwin.pt."
    });
  }
  return candidates.map(({ key, ...candidate }) => candidate);
}
