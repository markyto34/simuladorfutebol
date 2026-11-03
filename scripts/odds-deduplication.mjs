export function oddsDeduplicationKey(row) {
  return [row.match_id, row.bookmaker, row.market].map(value => String(value ?? "").trim()).join("|");
}

export function keepLatestOddsRows(rows) {
  const latest = new Map();
  for (const row of rows) {
    const key = oddsDeduplicationKey(row);
    const current = latest.get(key);
    if (!current) {
      latest.set(key, row);
      continue;
    }
    const currentTime = Date.parse(current.retrieved_at || "");
    const nextTime = Date.parse(row.retrieved_at || "");
    const currentValid = Number.isFinite(currentTime);
    const nextValid = Number.isFinite(nextTime);
    if ((nextValid && !currentValid) ||
        (nextValid === currentValid && (!nextValid || nextTime >= currentTime))) {
      latest.set(key, row);
    }
  }
  return [...latest.values()];
}
