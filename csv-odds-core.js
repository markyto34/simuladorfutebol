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

  function validOdd(value) {
    return Number.isFinite(value) && value > 1 && value <= 1000;
  }

  function hasCompleteOdds(odds) {
    return ["1", "X", "2"].every(key => validOdd(odds && odds[key]));
  }

  const CONTINENT_COUNTRIES = {
    "Europa": ["Albania","Andorra","Armenia","Austria","Azerbaijan","Belarus","Belgium","Bélgica","Bosnia","Bosnia and Herzegovina","Bulgaria","Croatia","Cyprus","Czech Republic","Czechia","Denmark","England","Estonia","Faroe Islands","Finland","France","Georgia","Germany","Gibraltar","Greece","Hungary","Iceland","Ireland","Italy","Kosovo","Latvia","Liechtenstein","Lithuania","Luxembourg","Malta","Moldova","Montenegro","Netherlands","North Macedonia","Northern Ireland","Norway","Poland","Portugal","Romania","Russia","San Marino","Scotland","Serbia","Slovakia","Slovenia","Spain","Sweden","Switzerland","Turkey","Türkiye","Ukraine","Wales"],
    "Ásia": ["Afghanistan","Bahrain","Bangladesh","Bhutan","Brunei","Cambodia","China","Hong Kong","India","Indonesia","Iran","Iraq","Israel","Japan","Jordan","Kazakhstan","Kuwait","Kyrgyzstan","Laos","Lebanon","Malaysia","Maldives","Mongolia","Myanmar","Nepal","North Korea","Oman","Pakistan","Palestine","Philippines","Qatar","Saudi Arabia","Singapore","South Korea","Sri Lanka","Syria","Taiwan","Tajikistan","Thailand","Turkmenistan","United Arab Emirates","Uzbekistan","Vietnam","Yemen"],
    "África": ["Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi","Cameroon","Cape Verde","Central African Republic","Chad","Comoros","Congo","DR Congo","Democratic Republic of the Congo","Djibouti","Egypt","Equatorial Guinea","Eritrea","Eswatini","Ethiopia","Gabon","Gambia","Ghana","Guinea","Guinea-Bissau","Ivory Coast","Kenya","Lesotho","Liberia","Libya","Madagascar","Malawi","Mali","Mauritania","Mauritius","Morocco","Mozambique","Namibia","Niger","Nigeria","Rwanda","Sao Tome and Principe","Senegal","Seychelles","Sierra Leone","Somalia","South Africa","South Sudan","Sudan","Tanzania","Togo","Tunisia","Uganda","Zambia","Zimbabwe"],
    "América do Norte": ["Antigua and Barbuda","Bahamas","Barbados","Belize","Bermuda","Canada","Costa Rica","Cuba","Dominica","Dominican Republic","El Salvador","Grenada","Guatemala","Haiti","Honduras","Jamaica","Mexico","Nicaragua","Panama","Puerto Rico","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Trinidad and Tobago","United States","USA","US"],
    "América do Sul": ["Argentina","Bolivia","Brazil","Brasil","Chile","Colombia","Ecuador","Guyana","Paraguay","Peru","Suriname","Uruguay","Venezuela"],
    "Oceânia": ["Australia","Fiji","New Zealand","Papua New Guinea","Solomon Islands","Tahiti","Vanuatu"]
  };
  function continentForCountry(country) {
    const value = String(country || "").trim().toLocaleLowerCase();
    for (const [continent, countries] of Object.entries(CONTINENT_COUNTRIES)) {
      if (countries.some(name => name.toLocaleLowerCase() === value)) return continent;
    }
    return "Por identificar";
  }

  function normalizeRows(rawRows) {
    return rawRows.map((r, index) => {
      const finalHome = score(r.score_final_home), finalAway = score(r.score_final_away);
      const ftHome = score(r.score_ft_home), ftAway = score(r.score_ft_away);
      const odds = { "1": number(r.odd_ft_1), "X": number(r.odd_ft_x), "2": number(r.odd_ft_2) };
      let outcome = null;
      // As odds odd_ft_* são de tempo regulamentar; score_final_* pode incluir prolongamento.
      if (ftHome !== null && ftAway !== null) outcome = ftHome > ftAway ? "1" : ftHome < ftAway ? "2" : "X";
      return {
        id: index + 1,
        dateRaw: r.date_time || "",
        date: parseDate(r.date_time),
        country: r.COUNTRY || "",
        continent: continentForCountry(r.COUNTRY || ""),
        league: r.LEAGUE || "",
        home: r.TEAM_HOME || "",
        away: r.TEAM_AWAY || "",
        odds,
        oddsComplete: hasCompleteOdds(odds),
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

  function wilsonInterval(wins, total, z) {
    if (!total) return null;
    z = z || 1.959963984540054;
    const p = wins / total, z2 = z * z;
    const denominator = 1 + z2 / total;
    const center = (p + z2 / (2 * total)) / denominator;
    const margin = z * Math.sqrt((p * (1 - p) / total) + z2 / (4 * total * total)) / denominator;
    return { lower: Math.max(0, center - margin) * 100, upper: Math.min(1, center + margin) * 100 };
  }

  function impliedProbabilities(odds) {
    if (!hasCompleteOdds(odds)) return null;
    const raw = { "1": 1 / odds["1"], "X": 1 / odds.X, "2": 1 / odds["2"] };
    const overround = raw["1"] + raw.X + raw["2"] - 1;
    const total = raw["1"] + raw.X + raw["2"];
    return {
      raw: { "1": raw["1"] * 100, X: raw.X * 100, "2": raw["2"] * 100 },
      fair: { "1": raw["1"] / total * 100, X: raw.X / total * 100, "2": raw["2"] / total * 100 },
      overround: overround * 100
    };
  }

  function rangeMatches(matches, ranges) {
    ranges = ranges || {};
    return matches.filter(m => {
      if (!m.completed || !hasCompleteOdds(m.odds)) return false;
      return ["1", "X", "2"].every(key => {
        const range = ranges[key] || {};
        const min = range.min === undefined || range.min === null || range.min === "" ? 1.0000001 : Number(range.min);
        const max = range.max === undefined || range.max === null || range.max === "" ? 1000 : Number(range.max);
        return Number.isFinite(min) && Number.isFinite(max) && min <= max &&
          m.odds[key] >= min && m.odds[key] <= max;
      });
    });
  }

  function analyzeOdds(matches, market, minOdd, maxOdd) {
    const eligible = matches.filter(m => m.completed && Number.isFinite(m.odds[market]) &&
      m.odds[market] >= minOdd && m.odds[market] <= maxOdd);
    const n = eligible.length;
    if (!n) return { count: 0, wins: 0, hitRate: null, avgOdds: null, implied: null, roi: null };
    let wins = 0, oddsSum = 0, impliedSum = 0, profit = 0;
    eligible.forEach(m => {
      const odd = m.odds[market], won = m.outcome === market;
      if (won) wins++;
      oddsSum += odd; impliedSum += 1 / odd; profit += won ? odd - 1 : -1;
    });
    return { count: n, wins, hitRate: wins / n * 100, avgOdds: oddsSum / n,
      implied: impliedSum / n * 100, roi: profit / n * 100 };
  }

  function analyzeTriplet(matches, ranges) {
    const eligible = rangeMatches(matches, ranges);
    const n = eligible.length;
    const result = { count: n, excludedIncompleteOdds: matches.filter(m => m.completed && !hasCompleteOdds(m.odds)).length,
      outcomes: {}, averageOdds: {}, averageRawImplied: {}, averageFairImplied: {}, averageOverround: null };
    const sums = { "1": 0, X: 0, "2": 0 }, rawSums = { "1": 0, X: 0, "2": 0 }, fairSums = { "1": 0, X: 0, "2": 0 };
    let overroundSum = 0;
    ["1", "X", "2"].forEach(key => { result.outcomes[key] = { wins: 0, frequency: null, roi: null, profitUnits: 0, confidence95: null }; });
    eligible.forEach(match => {
      const probs = impliedProbabilities(match.odds);
      overroundSum += probs.overround;
      ["1", "X", "2"].forEach(key => {
        sums[key] += match.odds[key];
        rawSums[key] += probs.raw[key];
        fairSums[key] += probs.fair[key];
        if (match.outcome === key) result.outcomes[key].wins++;
        result.outcomes[key].profitUnits += match.outcome === key ? match.odds[key] - 1 : -1;
      });
    });
    if (n) {
      ["1", "X", "2"].forEach(key => {
        const item = result.outcomes[key];
        item.frequency = item.wins / n * 100;
        item.roi = item.profitUnits / n * 100;
        item.confidence95 = wilsonInterval(item.wins, n);
        result.averageOdds[key] = sums[key] / n;
        result.averageRawImplied[key] = rawSums[key] / n;
        result.averageFairImplied[key] = fairSums[key] / n;
      });
      result.averageOverround = overroundSum / n;
    }
    return result;
  }

  function evaluateCurrentOdds(matches, currentOdds, tolerance) {
    if (!hasCompleteOdds(currentOdds)) throw new Error("É necessário introduzir as três odds válidas: 1, X e 2.");
    tolerance = Number.isFinite(Number(tolerance)) ? Math.max(0, Number(tolerance)) : 0.15;
    const cohort = matches.filter(m => m.completed && hasCompleteOdds(m.odds) &&
      ["1", "X", "2"].every(key => Math.abs(m.odds[key] - currentOdds[key]) <= tolerance));
    const analysis = analyzeTriplet(cohort);
    return { currentOdds, tolerance, market: impliedProbabilities(currentOdds), sample: cohort.length,
      historical: analysis.outcomes, averageOverround: analysis.averageOverround, matches: cohort };
  }

  function forecastExactScores(matches, limit) {
    const eligible = matches.filter(m => m.completed && m.ft[0] !== null && m.ft[1] !== null);
    const counts = new Map();
    eligible.forEach(m => {
      const key = m.ft[0] + "-" + m.ft[1];
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const ranked = [...counts.entries()].sort((a,b) => b[1] - a[1]);
    return { sample: eligible.length, scores: ranked.slice(0, limit || 5).map(([score, count]) => ({
      score: score.replace("-", "–"), count, frequency: count / eligible.length * 100
    })) };
  }

  function backtestTriplet(matches, ranges, splitDate) {
    const eligible = rangeMatches(matches, ranges)
      .filter(m => m.date instanceof Date && !Number.isNaN(m.date.getTime()))
      .sort((a, b) => a.date - b.date);
    const parsedSplit = splitDate ? new Date(splitDate) : null;
    const validSplit = parsedSplit instanceof Date && !Number.isNaN(parsedSplit.getTime());
    const training = validSplit ? eligible.filter(m => m.date < parsedSplit) : eligible;
    const validation = validSplit ? eligible.filter(m => m.date >= parsedSplit) : [];
    return { splitDate: validSplit ? parsedSplit.toISOString() : null,
      training: analyzeTriplet(training), validation: validSplit ? analyzeTriplet(validation) : null,
      eligible: eligible.length, chronological: eligible.every((m, i) => i === 0 || eligible[i - 1].date <= m.date) };
  }

  function filterMatches(matches, filters) {
    const q = (filters.search || "").trim().toLocaleLowerCase();
    return matches.filter(m => {
      if (filters.continent && m.continent !== filters.continent) return false;
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

  const api = { parseCSV, normalizeRows, summarize, analyzeOdds, analyzeTriplet, impliedProbabilities,
    hasCompleteOdds, rangeMatches, evaluateCurrentOdds, forecastExactScores, continentForCountry, backtestTriplet, wilsonInterval, filterMatches };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CSVOdds = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
