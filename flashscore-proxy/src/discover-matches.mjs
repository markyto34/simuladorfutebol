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

export function inspectMatchDiscovery(html, requestedDate, options = {}) {
  const summaryOnly = options.summary === true;
  const targetMatchId = typeof options.matchId === "string" ? options.matchId : null;
  const matches = [];
  const sampleMatches = [];
  let targetCompetitionIdentity = null;
  const seen = new Set();
  let candidateAnchorCount = 0;
  let duplicateLinkCount = 0;
  let totalUniqueMatchCount = 0;
  const anchorPattern = /<a\b([^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*)>([\s\S]*?)<\/a>/gi;

  for (const item of html.matchAll(anchorPattern)) {
    candidateAnchorCount += 1;
    const href = decodeEntities(item[2] || item[3] || item[4] || "");
    const id = href.match(/\/jogo\/([A-Za-z0-9]{6,16})(?:\/|[?#]|$)/i)?.[1];
    if (!id || (targetMatchId && id !== targetMatchId)) continue;
    if (seen.has(id)) {
      duplicateLinkCount += 1;
      continue;
    }
    seen.add(id);
    totalUniqueMatchCount += 1;
    const anchorText = plainText(item[5]).slice(0, 180) || null;
    const compact = { match_id: id, href, anchor_text: anchorText };
    if (targetMatchId && id === targetMatchId) {
      // Flashscore mobile groups fixtures under explicit <h4> headings
      // such as "ALEMANHA: Bundesliga". Use the nearest preceding heading,
      // never team names or inferred competition data.
      const headingStart = html.toLowerCase().lastIndexOf("<h4", item.index);
      const headingOpenEnd = headingStart >= 0 ? html.indexOf(">", headingStart) : -1;
      const headingEnd = headingOpenEnd >= 0 ? html.indexOf("</h4>", headingOpenEnd) : -1;
      const headingIsBeforeMatch = headingStart >= 0 && headingEnd >= 0 && headingEnd < item.index;
      const headingHtml = headingIsBeforeMatch ? html.slice(headingOpenEnd + 1, headingEnd) : "";
      const headingText = plainText(headingHtml);
      const identityMatch = headingText.match(/^([^:]{2,60}):\s*(.{2,100})$/);
      const standingsHref = headingHtml.match(/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
      targetCompetitionIdentity = identityMatch ? {
        status: "identified",
        country: identityMatch[1].trim(),
        competition: identityMatch[2].trim(),
        season: null,
        stage: null,
        round: null,
        source: "flashscore_daily_results_group_heading",
        evidence: {
          heading: headingText,
          match_id: id,
          standings_href: decodeEntities(standingsHref?.[1] || standingsHref?.[2] || standingsHref?.[3] || "") || null
        }
      } : {
        status: "unavailable",
        country: null,
        competition: null,
        season: null,
        stage: null,
        round: null,
        source: null,
        evidence: { nearest_heading: headingText || null, match_id: id }
      };
    }
    if (sampleMatches.length < 15) sampleMatches.push(compact);

    if (!summaryOnly && matches.length < 500) {
      const before = targetMatchId ? 3200 : 900;
      const after = targetMatchId ? 1600 : 500;
      const start = Math.max(0, item.index - before);
      const end = Math.min(html.length, item.index + item[0].length + after);
      const rawContext = html.slice(start, end);
      const context = plainText(rawContext).slice(targetMatchId ? -3200 : -900);
      matches.push({
        ...compact,
        context: context || null,
        ...(targetMatchId ? { context_html: rawContext.slice(0, 5200) } : {})
      });
    }
  }

  const pageTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const dateTokens = [...new Set((html.match(/\b\d{2}\.\d{2}\.\d{4}\b/g) || []))].slice(0, 30);
  const common = {
    requested_date: requestedDate,
    ...(targetMatchId ? { target_match_id: targetMatchId } : {}),
    page_title: pageTitle ? plainText(pageTitle).slice(0, 180) : null,
    candidate_anchor_count: candidateAnchorCount,
    match_count: totalUniqueMatchCount,
    duplicate_link_count: duplicateLinkCount,
    truncated: totalUniqueMatchCount > 500,
    date_tokens: dateTokens
  };

  if (summaryOnly) {
    return {
      ...common,
      sample_matches: sampleMatches,
      note: "Resumo da descoberta. match_count conta IDs únicos em todos os links encontrados no HTML. sample_matches mostra apenas os primeiros 15 IDs; não contém a lista completa nem valida país/competição."
    };
  }

  return {
    ...common,
    matches,
    ...(targetMatchId ? { competition_identity: targetCompetitionIdentity } : {}),
    note: targetMatchId ? "Contexto HTML isolado para o ID solicitado. O excerto é evidência de diagnóstico; país/competição só podem ser aceites se o HTML mostrar uma associação explícita e inequívoca." : "Diagnóstico passivo da página de resultados. Os contextos são excertos HTML e ainda não constituem metadados validados de país/competição nem confirmação de que todos os jogos da data foram listados."
  };
}
