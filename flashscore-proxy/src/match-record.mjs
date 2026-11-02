const CORE_FIELDS = [
  "country",
  "competition",
  "season",
  "stage",
  "round",
  "status",
  "score.full_time",
  "odds.markets.1x2.home",
  "odds.markets.1x2.draw",
  "odds.markets.1x2.away"
];

function getPath(value, path) {
  return path.split(".").reduce((current, key) => current == null ? undefined : current[key], value);
}

export function validateMatchRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, completeness: 0, missing_fields: CORE_FIELDS, errors: ["record_must_be_object"] };
  }
  if (record.schema_version !== "1.0.0") errors.push("unsupported_schema_version");
  if (!/^[A-Za-z0-9]{6,16}$/.test(String(record.match_id || ""))) errors.push("invalid_match_id");
  if (record.source !== "Flashscore") errors.push("invalid_source");
  if (typeof record.date_time !== "string" || !record.date_time.trim()) errors.push("missing_date_time");
  if (!record.teams || !record.teams.home || !record.teams.away ||
      typeof record.teams.home.name !== "string" || !record.teams.home.name.trim() ||
      typeof record.teams.away.name !== "string" || !record.teams.away.name.trim()) {
    errors.push("missing_team_identity");
  }
  if (!record.source_capture || typeof record.source_capture.url !== "string" ||
      typeof record.source_capture.retrieved_at !== "string") errors.push("missing_source_provenance");

  const missing_fields = CORE_FIELDS.filter(path => {
    const value = getPath(record, path);
    return value === undefined || value === null || value === "";
  });
  const completeness = Math.round(((CORE_FIELDS.length - missing_fields.length) / CORE_FIELDS.length) * 100);
  return { valid: errors.length === 0, completeness, missing_fields, errors };
}
