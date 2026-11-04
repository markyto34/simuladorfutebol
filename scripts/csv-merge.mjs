/**
 * Merge CSV rows without allowing a partial refresh to erase known values.
 * Existing duplicate keys are rejected instead of being silently discarded.
 */
export function mergeRows(existing, incoming, keyFn) {
  const map = new Map();
  for (const row of existing) {
    const key = keyFn(row);
    if (map.has(key)) {
      throw new Error("Duplicado preexistente no CSV para a chave: " + key);
    }
    map.set(key, { ...row });
  }

  for (const row of incoming) {
    const key = keyFn(row);
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...row });
      continue;
    }

    const merged = { ...current };
    for (const [field, value] of Object.entries(row)) {
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        merged[field] = value;
      }
    }
    map.set(key, merged);
  }

  return [...map.values()];
}
