(function (root) {
  "use strict";

  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    text = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (quoted) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"' && field.length === 0) quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && next === "\n") i++;
        row.push(field); field = "";
        if (row.some(v => v.trim() !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
    if (field.length || row.length) {
      row.push(field);
      if (row.some(v => v.trim() !== "")) rows.push(row);
    }
    if (!rows.length) return [];
    const headers = rows.shift().map(v => v.trim());
    return rows.map(values => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (values[i] || "").trim(); });
      return obj;
    });
  }

  function number(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const n = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function score(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const n = Number(String(value).trim());
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(String(value).trim().replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function normalizeRows(rawRows) {
    return rawRows.map((r, index) => {
      const finalHome = score(r.score_final_home), finalAway = score(r.score_final_away);
      const ftHome = score(r.score_ft_home), ftAway = score(r.score_ft_away);
      let outcome = null;
      // As odds odd_ft_* são de tempo regulamentar, o desfecho 1X2 tem de usar score_ft_*.
      // score_final_* pode incluir prolongamento/decisão posterior e não deve contaminar o mercado FT.
      if (ftHome !== null && ftAway !== null) outcome = ftHome > ftAway ? "1" : ftHome < ftAway ? "2" : "X";
      return {
        id: index + 1,
        dateRaw: r.date_time || "",
        date: parseDate(r.date_time),
        country: r.COUNTRY || "",
        league: r.LEAGUE || "",
        home: r.TEAM_HOME || "",
        away: r.TEAM_AWAY || "",
        odds: { "1": number(r.odd_ft_1), "X": number(r.odd_ft_x), "2": number(r.odd_ft_2) },
        ht: [score(r.score_fh_home), score(r.score_fh_away)],
        secondHalf: [score(r.score_sh_home), score(r.score_sh_away)],
        ft: [ftHome, ftAway],
        final: [finalHome, finalAway],
        outcome,
        completed: outcome !== null
      };
    });
  }

  function summarize(matches) {
    const completed = matches.filter(m => m.completed);
    const total = completed.length;
    const counts = { "1": 0, "X": 0, "2": 0 };
    completed.forEach(m => counts[m.outcome]++);
    const pct = key => total ? counts[key] / total * 100 : 0;
    return { total: matches.length, completed: total, pending: matches.length - total, counts,
      percentages: { "1": pct("1"), "X": pct("X"), "2": pct("2") } };
  }

  function analyzeOdds(matches, market, minOdd, maxOdd) {
    const eligible = matches.filter(m => m.completed && Number.isFinite(m.odds[market]) &&
      m.odds[market] >= minOdd && m.odds[market] <= maxOdd);
    const n = eligible.length;
    if (!n) return { count: 0, wins: 0, hitRate: null, avgOdds: null, implied: null, roi: null };
    let wins = 0, oddsSum = 0, impliedSum = 0, profit = 0;
    eligible.forEach(m => {
      const odd = m.odds[market];
      const won = m.outcome === market;
      if (won) wins++;
      oddsSum += odd;
      impliedSum += 1 / odd;
      profit += won ? odd - 1 : -1;
    });
    return { count: n, wins, hitRate: wins / n * 100, avgOdds: oddsSum / n,
      implied: impliedSum / n * 100, roi: profit / n * 100 };
  }

  function filterMatches(matches, filters) {
    const q = (filters.search || "").trim().toLocaleLowerCase();
    return matches.filter(m => {
      if (filters.country && m.country !== filters.country) return false;
      if (filters.league && m.league !== filters.league) return false;
      if (filters.team) { const team = filters.team.trim().toLocaleLowerCase(); if (!(m.home.toLocaleLowerCase().includes(team) || m.away.toLocaleLowerCase().includes(team))) return false; }
      if (filters.from && (!m.date || m.date < filters.from)) return false;
      if (filters.to && (!m.date || m.date > filters.to)) return false;
      if (filters.status === "completed" && !m.completed) return false;
      if (filters.status === "pending" && m.completed) return false;
      if (q && !(m.home + " " + m.away + " " + m.league + " " + m.country).toLocaleLowerCase().includes(q)) return false;
      return true;
    });
  }

  const api = { parseCSV, normalizeRows, summarize, analyzeOdds, filterMatches };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CSVOdds = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
