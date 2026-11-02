export const MATCH_TABS = Object.freeze({
  summary: null,
  statistics: "estatisticas",
  lineups: "equipas",
  standings: "classificacoes",
  commentary: "comentarios-ao-vivo",
  h2h: "h2h"
});

export function resolveMatchTab(tab) {
  if (typeof tab !== "string" || !Object.prototype.hasOwnProperty.call(MATCH_TABS, tab)) return null;
  return { key: tab, upstreamValue: MATCH_TABS[tab] };
}

export function buildMatchTabUrl(matchId, tab = "summary") {
  if (typeof matchId !== "string" || !/^[A-Za-z0-9]{6,16}$/.test(matchId)) {
    throw new TypeError("invalid_match_id");
  }
  const resolved = resolveMatchTab(tab);
  if (!resolved) throw new TypeError("invalid_match_tab");
  const url = new URL(`/jogo/${matchId}/`, "https://m.flashscore.pt");
  if (resolved.upstreamValue) url.searchParams.set("t", resolved.upstreamValue);
  return url.pathname + url.search;
}
