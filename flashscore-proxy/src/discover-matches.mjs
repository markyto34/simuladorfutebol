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

export function extractExplicitCompetitionIdentities(html) {
  const scoreData = html.match(/<div\b[^>]*id=["']score-data["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if (!scoreData) return {};
  let currentHeading = null;
  const identities = {};
  const tokens = scoreData.match(/<h4\b[^>]*>[\s\S]*?<\/h4>|<a\b[^>]*href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>[\s\S]*?<\/a>/gi) || [];
  for (const token of tokens) {
    if (/^<h4\b/i.test(token)) {
      currentHeading = plainText(token.replace(/^<h4\b[^>]*>/i, "").replace(/<\/h4>$/i, "").replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " "));
      continue;
    }
    const href = decodeEntities(token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)?.slice(1).find(Boolean) || "");
    const id = href.match(/\/jogo\/([A-Za-z0-9]{6,16})(?:\/|[?#]|$)/i)?.[1];
    if (!id || !currentHeading) continue;
    const match = currentHeading.match(/^\s*([^:]+?)\s*:\s*(.+?)\s*$/);
    const identity = match
      ? { status: "identified", heading: currentHeading, country: match[1].trim(), competition: match[2].trim() }
      : { status: "ambiguous", heading: currentHeading, country: null, competition: null };
    const previous = identities[id];
    if (!previous) identities[id] = identity;
    else if (previous.status !== "ambiguous" && (previous.country !== identity.country || previous.competition !== identity.competition)) {
      identities[id] = { status: "ambiguous", heading: "multiple_competition_groups", country: null, competition: null };
    }
  }
  return identities;
}

export function extractExplicitCompetitionForMatch(html, matchId) {
  return extractExplicitCompetitionIdentities(html)[matchId] || null;
}


export function extractFixtureTeams(anchorText) {
  let value = plainText(String(anchorText || ""));
  value = value
    .replace(/^\s*\d{1,2}:\d{2}\s*/, "")
    .replace(/\s+(?:Terminado|Tempo Final|Adiado|Cancelado|Interrompido|Atrasado|Não iniciado)\s*$/i, "")
    .replace(/\s+\d{1,2}\s*[-:]\s*\d{1,2}\s*$/, "")
    .trim();
  const match = value.match(/^(.+?)\s+-\s+(.+?)$/);
  if (!match) return null;
  const home = match[1].trim(), away = match[2].trim();
  if (!home || !away || home.length > 100 || away.length > 100) return null;
  return { home, away };
}


function extractFixtureTeamsFromScoreData(html, anchorIndex) {
  const scoreDataStart = html.search(/<div\b[^>]*\bid=["']score-data["']/i);
  if (scoreDataStart < 0 || anchorIndex <= scoreDataStart) return null;
  const spanStart = html.lastIndexOf("<span", anchorIndex);
  if (spanStart < scoreDataStart) return null;
  const spanEnd = html.indexOf(">", spanStart);
  if (spanEnd < 0 || spanEnd >= anchorIndex) return null;
  const value = plainText(html.slice(spanEnd + 1, anchorIndex)).replace(/^\\d{1,2}:\\d{2}\\s*/, "").trim();
  const match = value.match(/^(.+?)\s+-\s+(.+?)$/);
  if (!match) return null;
  const home = match[1].trim(), away = match[2].trim();
  if (!home || !away || home.length > 100 || away.length > 100) return null;
  return { home, away };
}

function extractFixtureTeamsFromEvent(html, anchorIndex) {
  const before = html.slice(0, anchorIndex);
  const stack = [];
  const divToken = /<div\b[^>]*>|<\/div\s*>/gi;
  for (const token of before.matchAll(divToken)) {
    if (/^<\/div/i.test(token[0])) stack.pop();
    else stack.push({ start: token.index, tagEnd: token.index + token[0].length, attributes: token[0] });
  }
  const eventContainer = [...stack].reverse().find(item => /(?:^|[\s"'])event__match(?:[\s"'-]|$)/i.test(item.attributes));
  if (!eventContainer) return null;
  const tail = html.slice(eventContainer.tagEnd);
  let depth = 1, end = -1;
  for (const token of tail.matchAll(/<div\b[^>]*>|<\/div\s*>/gi)) {
    if (/^<\/div/i.test(token[0])) depth--; else depth++;
    if (depth === 0) { end = eventContainer.tagEnd + token.index; break; }
  }
  if (end < 0 || end - eventContainer.start > 12000) return null;
  const block = html.slice(eventContainer.tagEnd, end);
  const participants = { home: null, away: null };
  const elementPattern = /<([a-z][a-z0-9:-]*)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  for (const item of block.matchAll(elementPattern)) {
    const classValue = item[2].match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(Boolean) || "";
    const side = /(?:^|\s)event__participant--home(?:\s|$)/i.test(classValue) ? "home"
      : /(?:^|\s)event__participant--away(?:\s|$)/i.test(classValue) ? "away" : null;
    if (!side || participants[side]) continue;
    const name = plainText(item[3]).trim();
    if (name && name.length <= 100) participants[side] = name;
  }
  return participants.home && participants.away ? participants : null;
}

export function inspectMatchDiscovery(html, requestedDate, options = {}) {
  const summaryOnly = options.summary === true;
  const idsOnly = options.idsOnly === true;
  const targetMatchId = typeof options.matchId === "string" ? options.matchId : null;
  const matches = [];
  const sampleMatches = [];
  const matchFixtures = {};
  const seen = new Set();
  let candidateAnchorCount = 0;
  let duplicateLinkCount = 0;
  let totalUniqueMatchCount = 0;
  const competitionIdentities = (idsOnly || targetMatchId) ? extractExplicitCompetitionIdentities(html) : {};
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
    const teams = extractFixtureTeams(anchorText) || extractFixtureTeamsFromScoreData(html, item.index) || extractFixtureTeamsFromEvent(html, item.index);
    const compact = { match_id: id, href, anchor_text: anchorText, ...(teams ? { teams } : {}) };
    if (teams) matchFixtures[id] = teams;
    if (targetMatchId && competitionIdentities[id]) compact.competition_identity = competitionIdentities[id];
    if (sampleMatches.length < 15) sampleMatches.push(compact);

    if (!summaryOnly && !idsOnly && matches.length < 2000) {
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
    truncated: totalUniqueMatchCount > 2000,
    date_tokens: dateTokens
  };

  if (idsOnly) {
    return {
      ...common,
      match_ids: [...seen],
      match_competition_identities: Object.fromEntries([...seen].filter(id => competitionIdentities[id]).map(id => [id, competitionIdentities[id]])),
      match_fixtures: matchFixtures,
      identified_competition_count: [...seen].filter(id => competitionIdentities[id]?.status === "identified").length,
      note: "Lista compacta de IDs únicos e identidades de competição explicitamente associadas no HTML do calendário. Não valida resultados, odds ou estatísticas."
    };
  }

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
    note: targetMatchId ? "Contexto HTML isolado para o ID solicitado. O excerto é evidência de diagnóstico; país/competição só podem ser aceites se o HTML mostrar uma associação explícita e inequívoca." : "Diagnóstico passivo da página de resultados. Os contextos são excertos HTML e ainda não constituem metadados validados de país/competição nem confirmação de que todos os jogos da data foram listados."
  };
}
