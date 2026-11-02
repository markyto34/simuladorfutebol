// Diagnostic only: preserve nearby markup around score-like values and attributes.
// It intentionally does not assign HT, second-half or FT semantics.
export function inspectScoreEvidence(html) {
  const decoded = String(html)
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"').replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=").replace(/\\u002f/gi, "/");
  const evidence = [];
  const scorePairPattern = /\b\d{1,2}\s*[-:]\s*\d{1,2}\b/g;
  for (const item of decoded.matchAll(scorePairPattern)) {
    const start = Math.max(0, item.index - 220);
    const end = Math.min(decoded.length, item.index + item[0].length + 260);
    const context = decoded.slice(start, end).replace(/\s+/g, " ").trim();
    if (!evidence.some(entry => entry.value === item[0] && entry.context === context)) {
      evidence.push({ value: item[0], offset: item.index, context: context.slice(0, 520) });
    }
    if (evidence.length >= 30) break;
  }

  const attributes = [];
  const attributePattern = /(?:class|data-[\w-]+)=["'][^"']*(?:score|period|half|part|result)[^"']*["']/gi;
  for (const item of decoded.matchAll(attributePattern)) {
    const start = Math.max(0, item.index - 140);
    const end = Math.min(decoded.length, item.index + item[0].length + 220);
    const context = decoded.slice(start, end).replace(/\s+/g, " ").trim();
    if (!attributes.includes(context)) attributes.push(context.slice(0, 480));
    if (attributes.length >= 30) break;
  }
  return { scoreEvidence: evidence, scoreRelatedAttributes: attributes };
}
