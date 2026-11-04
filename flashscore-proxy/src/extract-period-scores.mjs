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
  const firstMatch = html.match(/1(?:\\.|ª|º)\\s*Parte\\s*:\\s*<b[^>]*>\\s*(\\d{1,2}\\s*[-:]\\s*\\d{1,2})\\s*<\\/b>/i);
  const secondMatch = html.match(/2(?:\\.|ª|º)\\s*Parte\\s*:\\s*<b[^>]*>\\s*(\\d{1,2}\\s*[-:]\\s*\\d{1,2})\\s*<\\/b>/i);
  const extraTimeMatch = html.match(/(?:Prolong(?:amento)?\\.?|Extra\\s*Time)\\s*:\\s*<b[^>]*>\\s*(\\d{1,2}\\s*[-:]\\s*\\d{1,2})\\s*<\\/b>/i);

  // O resumo do jogo aparece imediatamente antes do estado final. O Flashscore
  // usa rótulos diferentes em jogos normais e em partidas com prolongamento.
  const finishedAt = html.search(/>\\s*(?:Terminado|Tempo\\s+Final|Depois\\s+de\\s+Prolongamento|Após\\s+prolongamento)\\s*</i);
  const summaryArea = finishedAt >= 0 ? html.slice(Math.max(0, finishedAt - 900), finishedAt) : "";
  const finalMatches = [...summaryArea.matchAll(/<b[^>]*>\\s*(\\d{1,2}\\s*[-:]\\s*\\d{1,2})\\s*<\\/b>\\s*\\(\\s*(\\d{1,2}\\s*[-:]\\s*\\d{1,2})\\s*,\\s*(\\d{1,2}\\s*[-:]\\s*\\d{1,2})(?:\\s*,\\s*(\\d{1,2}\\s*[-:]\\s*\\d{1,2}))?\\s*\\)/gi)];

  if (!firstMatch || !secondMatch || finalMatches.length !== 1) return null;
  const firstHalf = parsePair(firstMatch[1]);
  const secondHalf = parsePair(secondMatch[1]);
  const fullTime = parsePair(finalMatches[0][1]);
  const summaryFirst = parsePair(finalMatches[0][2]);
  const summarySecond = parsePair(finalMatches[0][3]);
  const summaryExtra = finalMatches[0][4] ? parsePair(finalMatches[0][4]) : null;
  const extraTime = extraTimeMatch ? parsePair(extraTimeMatch[1]) : null;
  if (!firstHalf || !secondHalf || !fullTime || !summaryFirst || !summarySecond) return null;

  // Cross-check every explicitly labelled period against the summary and FT
  // arithmetic. Penalty shootouts are outside this breakdown and never enter FT.
  if (firstHalf.text !== summaryFirst.text || secondHalf.text !== summarySecond.text) return null;
  if (summaryExtra && (!extraTime || summaryExtra.text !== extraTime.text)) return null;
  if (!summaryExtra && extraTime) return null;
  const expectedHome = firstHalf.home + secondHalf.home + (extraTime?.home || 0);
  const expectedAway = firstHalf.away + secondHalf.away + (extraTime?.away || 0);
  if (fullTime.home !== expectedHome || fullTime.away !== expectedAway) return null;

  return {
    status: "validated",
    ht: firstHalf.text,
    second_half: secondHalf.text,
    ...(extraTime ? { extra_time: extraTime.text } : {}),
    ft: fullTime.text,
    evidence: extraTime
      ? "Explicit first half, second half and extra-time scores cross-checked against the FT breakdown and score arithmetic; penalties excluded."
      : "Explicit 1.ª Parte and 2.ª Parte headings cross-checked against the FT breakdown and score arithmetic."
  };
}
