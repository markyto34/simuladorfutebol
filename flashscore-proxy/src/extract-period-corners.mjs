// Parse Flashscore's own delimited match-statistics feed.
// Records use ¬ as separator and ÷ between keys and values.
// SE identifies the period; SD/SG/SH/SI identify a statistic row.
function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function periodKey(value) {
  const label = normalize(value);
  if (["match", "full time", "full match", "jogo completo"].includes(label)) return "match";
  if (["1st half", "first half", "1st period", "1 half", "1 parte", "primeira parte"].includes(label)) return "ht";
  if (["2nd half", "second half", "2nd period", "2 half", "2 parte", "segunda parte"].includes(label)) return "st";
  if (label.includes("extra time") || label.includes("prolongamento")) return "extra_time";
  return null;
}

function isCornerLabel(value) {
  return ["corner kicks", "corners", "corner", "cantos", "pontapes de canto", "escanteios"].includes(normalize(value));
}

function parseCount(value) {
  const match = String(value ?? "").trim().match(/^\d{1,2}$/);
  return match ? Number(match[0]) : null;
}

export function extractPeriodCornersFromFeed(feed) {
  const candidates = { ht: [], st: [] };
  let period = null;
  let currentRow = null;

  const flush = () => {
    if (currentRow && period && isCornerLabel(currentRow.label)) {
      const home = parseCount(currentRow.home);
      const away = parseCount(currentRow.away);
      if (home !== null && away !== null && (period === "ht" || period === "st")) {
        candidates[period].push({
          home, away, source_label: currentRow.label,
          source_period: period === "ht" ? "1st Half" : "2nd Half"
        });
      }
    }
    currentRow = null;
  };

  for (const rawToken of String(feed ?? "").split("¬")) {
    const token = rawToken.replace(/^~/, "");
    if (!token) continue;
    const separator = token.indexOf("÷");
    if (separator < 0) continue;
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (key === "SE") {
      flush();
      period = periodKey(value);
    } else if (key === "SF") {
      flush();
    } else if (key === "SD") {
      flush();
      currentRow = { id: value, label: "", home: "", away: "" };
    } else if (key === "SG" && currentRow) {
      currentRow.label = value;
    } else if (key === "SH" && currentRow) {
      currentRow.home = value;
    } else if (key === "SI" && currentRow) {
      currentRow.away = value;
    }
  }
  flush();

  function resolve(list) {
    if (!list.length) return null;
    const signatures = new Set(list.map(item => item.home + ":" + item.away));
    if (signatures.size !== 1) return null;
    return list[0];
  }

  return {
    corners_ht: resolve(candidates.ht),
    corners_st: resolve(candidates.st),
    diagnostics: {
      first_half_corner_rows: candidates.ht.length,
      second_half_corner_rows: candidates.st.length,
      first_half_ambiguous: new Set(candidates.ht.map(item => item.home + ":" + item.away)).size > 1,
      second_half_ambiguous: new Set(candidates.st.map(item => item.home + ":" + item.away)).size > 1
    }
  };
}
