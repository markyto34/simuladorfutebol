(function (root) {
  "use strict";

  function eachCSVRow(text, visit) {
    text = String(text || "").replace(/^\uFEFF/, "");
    let headers = null, row = [], field = "", quoted = false;
    const emit = () => {
      row.push(field);
      if (headers === null) {
        headers = row.map(value => String(value || "").trim());
      } else if (row.some(value => String(value).trim() !== "")) {
        const item = {};
        headers.forEach((header, index) => { item[header] = String(row[index] ?? "").trim(); });
        visit(item);
      }
      row = [];
      field = "";
    };
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
        emit();
      } else field += c;
    }
    if (field.length || row.length) emit();
  }

  function value(row, names) {
    for (const name of names) {
      const key = Object.keys(row).find(candidate => candidate.toLowerCase() === name.toLowerCase());
      if (key && String(row[key]).trim() !== "") return row[key];
    }
    return "";
  }

  function number(row, names) {
    const raw = String(value(row, names)).trim().replace(/\s/g, "").replace(",", ".");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function dateKey(raw) {
    const text = String(raw || "").trim();
    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (match) return match[1] + "-" + match[2].padStart(2, "0") + "-" + match[3].padStart(2, "0");
    match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (match) return match[3] + "-" + match[2].padStart(2, "0") + "-" + match[1].padStart(2, "0");
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }

  function teamKey(raw) {
    return String(raw || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\b(fc|cf|sc|afc|club|clube|de|the)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  }

  function fixtureKey(date, home, away) {
    const d = dateKey(date), h = teamKey(home), a = teamKey(away);
    return d && h && a ? d + "|" + h + "|" + a : "";
  }

  function score(row, names) {
    const n = number(row, names);
    return n !== null && Number.isInteger(n) ? n : null;
  }

  function indexMatches(matches) {
    const index = new Map();
    matches.forEach(match => {
      const key = fixtureKey(match.date, match.home, match.away);
      if (!key) return;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(match);
    });
    return index;
  }

  function findMatching(index, key, homeScore, awayScore) {
    const candidates = index.get(key) || [];
    return candidates.find(match =>
      (homeScore === null || Number(match.hg) === homeScore) &&
      (awayScore === null || Number(match.ag) === awayScore)
    ) || null;
  }

  function fillMissing(match, field, nextValue) {
    if (match[field] === null || match[field] === undefined || match[field] === "") {
      if (nextValue !== null && nextValue !== undefined) {
        match[field] = nextValue;
        return true;
      }
    }
    return false;
  }

  function enrichFlashscoreStats(matches, csvText) {
    const index = indexMatches(matches), matched = new Set(), enriched = new Set();
    const fields = [
      ["hc", ["corners_home"]], ["ac", ["corners_away"]],
      ["homeShots", ["shots_home"]], ["awayShots", ["shots_away"]],
      ["homeTarget", ["shots_on_target_home"]], ["awayTarget", ["shots_on_target_away"]],
      ["homeFouls", ["fouls_home"]], ["awayFouls", ["fouls_away"]],
      ["homeYellow", ["yellow_cards_home"]], ["awayYellow", ["yellow_cards_away"]],
      ["homeXg", ["xg_home"]], ["awayXg", ["xg_away"]],
      ["homePossession", ["possession_home"]], ["awayPossession", ["possession_away"]],
      ["homeBigChances", ["big_chances_home"]], ["awayBigChances", ["big_chances_away"]],
      ["homeShotsOff", ["shots_off_target_home"]], ["awayShotsOff", ["shots_off_target_away"]],
      ["homeBlocked", ["blocked_shots_home"]], ["awayBlocked", ["blocked_shots_away"]],
      ["homeInsideBox", ["shots_inside_box_home"]], ["awayInsideBox", ["shots_inside_box_away"]],
      ["homeOutsideBox", ["shots_outside_box_home"]], ["awayOutsideBox", ["shots_outside_box_away"]],
      ["homeOffsides", ["offsides_home"]], ["awayOffsides", ["offsides_away"]]
    ];
    eachCSVRow(csvText, row => {
      const key = fixtureKey(value(row, ["date_time"]), value(row, ["home_team"]), value(row, ["away_team"]));
      if (!key) return;
      const homeScore = score(row, ["score_home"]), awayScore = score(row, ["score_away"]);
      if (homeScore === null || awayScore === null) return;
      const match = findMatching(index, key, homeScore, awayScore);
      if (!match) return;
      const id = value(row, ["match_id"]) || key;
      matched.add(id);
      let changed = false;
      fields.forEach(([field, names]) => { changed = fillMissing(match, field, number(row, names)) || changed; });
      if (changed) enriched.add(id);
      match.flashscoreMatchId = value(row, ["match_id"]) || match.flashscoreMatchId || "";
    });
    return { matched: matched.size, enriched: enriched.size };
  }

  function enrichOddsPeriods(matches, csvText) {
    const index = indexMatches(matches), matched = new Set(), ht = new Set(), secondHalf = new Set();
    eachCSVRow(csvText, row => {
      const key = fixtureKey(value(row, ["date_time"]), value(row, ["TEAM_HOME"]), value(row, ["TEAM_AWAY"]));
      if (!key) return;
      const homeFt = score(row, ["score_ft_home"]), awayFt = score(row, ["score_ft_away"]);
      if (homeFt === null || awayFt === null) return;
      const match = findMatching(index, key, homeFt, awayFt);
      if (!match) return;
      const id = key;
      matched.add(id);
      const htHome = score(row, ["score_fh_home"]), htAway = score(row, ["score_fh_away"]);
      const shHome = score(row, ["score_sh_home"]), shAway = score(row, ["score_sh_away"]);
      const hasHt = htHome !== null && htAway !== null;
      const hasSh = shHome !== null && shAway !== null;
      if (hasHt) {
        fillMissing(match, "htHome", htHome);
        fillMissing(match, "htAway", htAway);
        if (match.htHome !== null && match.htAway !== null) ht.add(id);
      }
      if (hasSh) {
        fillMissing(match, "shHome", shHome);
        fillMissing(match, "shAway", shAway);
        if (match.shHome !== null && match.shAway !== null) secondHalf.add(id);
      }
    });
    return { matched: matched.size, ht: ht.size, secondHalf: secondHalf.size };
  }

  root.FootballDataEnrichment = { enrichFlashscoreStats, enrichOddsPeriods, fixtureKey };
})(typeof globalThis !== "undefined" ? globalThis : this);
