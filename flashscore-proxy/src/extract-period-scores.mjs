// Extract only explicitly labelled period scores from a Flashscore match page.
// No score is inferred from a bare score candidate or from incident timelines.
function decodeMarkup(value) {
  return String(value)
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"').replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=").replace(/\\u002f/gi, "/")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function parsePair(value) {
  const match = String(value).match(/^\s*(\d{1,2})\s*[-:]\s*(\d{1,2})\s*$/);
  if (!match) return null;
  const home = Number(match[1]);
  const away = Number(match[2]);
  return { home, away, text: home + "-" + away };
}

export function extractPeriodScores(input) {
  const html = decodeMarkup(input);
  const firstMatch = html.match(/1(?:\.|ª|º)\s*Parte\s*:\s*<b[^>]*>\s*(\d{1,2}\s*[-:]\s*\d{1,2})\s*<\/b>/i);
  const secondMatch = html.match(/2(?:\.|ª|º)\s*Parte\s*:\s*<b[^>]*>\s*(\d{1,2}\s*[-:]\s*\d{1,2})\s*<\/b>/i);

  // The mobile summary places FT followed by (first-half, second-half)
  // immediately before the "Terminado" status.
  const finishedAt = html.search(/>\s*Terminado\s*</i);
  const summaryArea = finishedAt >= 0 ? html.slice(Math.max(0, finishedAt - 900), finishedAt) : "";
  const finalMatches = [...summaryArea.matchAll(/<b[^>]*>\s*(\d{1,2}\s*[-:]\s*\d{1,2})\s*<\/b>\s*\(\s*(\d{1,2}\s*[-:]\s*\d{1,2})\s*,\s*(\d{1,2}\s*[-:]\s*\d{1,2})\s*\)/gi)];

  if (!firstMatch || !secondMatch || finalMatches.length !== 1) return null;
  const firstHalf = parsePair(firstMatch[1]);
  const secondHalf = parsePair(secondMatch[1]);
  const fullTime = parsePair(finalMatches[0][1]);
  const summaryFirst = parsePair(finalMatches[0][2]);
  const summarySecond = parsePair(finalMatches[0][3]);
  if (!firstHalf || !secondHalf || !fullTime || !summaryFirst || !summarySecond) return null;

  // Cross-check period headings against the FT breakdown and arithmetic.
  if (firstHalf.text !== summaryFirst.text || secondHalf.text !== summarySecond.text) return null;
  if (fullTime.home !== firstHalf.home + secondHalf.home ||
      fullTime.away !== firstHalf.away + secondHalf.away) return null;

  return {
    status: "validated",
    ht: firstHalf.text,
    second_half: secondHalf.text,
    ft: fullTime.text,
    evidence: "Explicit 1.ª Parte and 2.ª Parte headings cross-checked against the FT breakdown and score arithmetic."
  };
}
