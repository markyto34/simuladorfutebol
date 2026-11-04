import { extractPeriodScores } from "./extract-period-scores.mjs";
import { extractBwin1x2 } from "./extract-bwin.mjs";
import { extractPageContext } from "./extract-page-context.mjs";

function decodeMarkup(value) {
  return String(value)
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"').replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=").replace(/\\u002f/gi, "/")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function cleanText(value) {
  return decodeMarkup(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePair(value) {
  const match = String(value || "").match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
  return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

function parseTitle(title) {
  const match = String(title || "").match(/^[^|]+\|\s*(.*?)\s+-\s+(.*?)\s*$/);
  if (!match) return { home: null, away: null };
  return { home: cleanText(match[1]), away: cleanText(match[2]) };
}

function parseEvents(html) {
  const decoded = decodeMarkup(html);
  const events = [];
  const blocks = decoded.match(/<div\b[^>]*class=["'][^"']*\bincident\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi) || [];
  for (const block of blocks) {
    const minuteRaw = cleanText(block.match(/<p\b[^>]*class=["'][^"']*\btime(?:-wide)?\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || "");
    const minuteMatch = minuteRaw.match(/^(\d{1,3}(?:\+\d{1,2})?)\s*['’]?$/);
    const classes = block.match(/class=["']([^"']*)["']/gi) || [];
    const classText = classes.join(" ").toLowerCase();
    let type = "other";
    if (/icon\s+ball|\bball\b/.test(classText)) type = "goal";
    else if (/y-card|yellow/.test(classText)) type = "yellow_card";
    else if (/r-card|red/.test(classText)) type = "red_card";
    else if (/substitution|sub-in|sub-out/.test(classText)) type = "substitution";
    const description = cleanText(block);
    if (!description) continue;
    const event = { type, minute: minuteMatch ? minuteMatch[1] : null, description };
    const teamMatch = description.match(/\[([^\]]+)\]\s*$/);
    if (teamMatch) event.team_abbreviation = teamMatch[1];
    events.push(event);
  }
  return events;
}

function parseSubstitutions(events) {
  return events
    .filter(event => event.type === "substitution")
    .map(event => {
      const detail = String(event.description || "")
        .replace(/^\s*\d{1,3}(?:\+\d{1,2})?['’]?\s*/, "")
        .replace(/\s*\[[^\]]+\]\s*$/, "")
        .trim();
      const match = detail.match(/^(.+?)\s*\((.+?)\)\s*$/);
      if (!match) return null;
      return {
        minute: event.minute,
        player_in: match[1].trim(),
        player_out: match[2].trim(),
        team_abbreviation: event.team_abbreviation || null
      };
    })
    .filter(Boolean);
}

function parseDateTime(html) {
  const decoded = decodeMarkup(html);
  const match = decoded.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/);
  return match ? {
    source_text: match[0],
    iso_local: `${match[3]}-${match[2]}-${match[1]}T${match[4]}`
  } : null;
}

function parseFullTimeFromSummary(html, home, away) {
  if (!home || !away) return null;
  const plain = cleanText(html);
  const escapeRegex = value => String(value).split('').map(char => '.^$*+?()[]{}|\\\\'.includes(char) ? '\\\\' + char : char).join('');
  const pattern = new RegExp(
    escapeRegex(home) + '\\s+-\\s+' + escapeRegex(away) + '\\s+(\\d{1,2})\\s*[-:]\\s*(\\d{1,2})(?=\\s*\\(|\\s+(?:Terminado|Tempo Final|Depois de Prolongamento|Após prolongamento|A\\.P\\.|Após|Adiado|Cancelado|Interrompido|Atrasado|Não iniciado))',
    'i'
  );
  const match = plain.match(pattern);
  return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

export function extractStructuredMatch(html, matchId, options = {}) {
  const decoded = decodeMarkup(html);
  const pageContext = extractPageContext(decoded);
  const context = pageContext.fields;
  const title = cleanText(decoded.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const teams = parseTitle(title);
  const dateTime = parseDateTime(decoded);
  const statusMatch = decoded.match(/>\s*(Terminado|Tempo Final|Depois de Prolongamento|Após prolongamento|A\.P\.|Adiado|Cancelado|Interrompido|Atrasado|Não iniciado)\s*</i);
  const status = statusMatch ? cleanText(statusMatch[1]) : null;
  const periods = extractPeriodScores(decoded);
  const summaryFullTime = parseFullTimeFromSummary(decoded, teams.home, teams.away);
  const periodFullTime = periods ? parsePair(periods.ft) : null;
  const fullTime = periodFullTime || summaryFullTime;
  const score = fullTime ? {
    half_time: periods ? parsePair(periods.ht) : null,
    second_half: periods ? parsePair(periods.second_half) : null,
    ...(periods?.extra_time ? { extra_time: parsePair(periods.extra_time) } : {}),
    full_time: fullTime
  } : null;
  const events = parseEvents(decoded);
  const substitutions = parseSubstitutions(events);
  const bwinCandidates = extractBwin1x2(decoded);
  const singleBwin1x2 = bwinCandidates.length === 1 ? bwinCandidates[0] : null;
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const odds = singleBwin1x2 ? {
    bookmaker: "Bwin",
    retrieved_at: retrievedAt,
    odds_timestamp_type: "observed_at_collection",
    markets: {
      "1x2": {
        home: singleBwin1x2.home,
        draw: singleBwin1x2.draw,
        away: singleBwin1x2.away
      }
    },
    evidence: singleBwin1x2.evidence
  } : null;

  const missingFields = [];
  for (const [key, value] of Object.entries({
    country: context.country,
    competition: context.competition,
    season: context.season,
    stage: context.stage,
    round: context.round,
    referee: context.referee,
    venue: context.venue,
    attendance: context.attendance,
    date_time: dateTime?.source_text || null,
    teams_home: teams.home,
    teams_away: teams.away,
    status,
    events: events.length ? events : null,
    statistics: Object.keys(pageContext.statistics).length ? pageContext.statistics : null,
    lineups: null,
    formations: null,
    score_full_time: score?.full_time || null,
    bwin_1x2: odds?.markets["1x2"] || null
  })) {
    if (value === null || value === "") missingFields.push(key);
  }

  return {
    schema_version: "1.0.0",
    match_id: matchId,
    source: "Flashscore",
    date_time: dateTime?.source_text || null,
    date_time_iso_local: dateTime?.iso_local || null,
    timezone: null,
    country: context.country,
    competition: context.competition,
    season: context.season,
    stage: context.stage,
    round: context.round,
    venue: context.venue,
    attendance: context.attendance,
    referee: context.referee,
    status,
    teams: {
      home: { name: teams.home },
      away: { name: teams.away }
    },
    score,
    events,
    statistics: pageContext.statistics,
    lineups: null,
    formations: null,
    substitutions,
    odds,
    context: null,
    missing_fields: missingFields,
    source_capture: {
      url: options.sourceUrl || `https://m.flashscore.pt/jogo/${matchId}/`,
      retrieved_at: retrievedAt,
      http_status: options.httpStatus ?? 200,
      evidence: [
        { field: "teams", source: "HTML title", value: title || null },
        { field: "date_time", source: "visible match summary", value: dateTime?.source_text || null },
        { field: "score", source: periods?.evidence || (summaryFullTime ? "visible match summary, matched to both team names" : null), value: fullTime },
        { field: "events", source: "visible incident blocks", count: events.length },
        { field: "substitutions", source: "substitution incident blocks with explicit incoming/outgoing player format", count: substitutions.length },
        { field: "page_context", source: "meta, breadcrumbs, visible labels and embedded JSON", evidence: pageContext.evidence, diagnostics: pageContext.diagnostics },
        { field: "odds", source: singleBwin1x2?.evidence || null }
      ]
    }
  };
}
