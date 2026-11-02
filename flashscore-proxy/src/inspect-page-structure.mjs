const MAX_LINKS = 60;
const MAX_SCRIPTS = 40;
const MAX_DATA_ATTRIBUTES = 80;
const MAX_TOKENS = 100;
const MAX_DOM_SAMPLES = 12;
const MAX_DOM_SAMPLE_CHARS = 900;
const TERMS = ["Estatísticas", "Classificações", "Bundesliga", "Competição", "Época", "Árbitro", "Estádio", "Statistics", "Standings", "League", "Tournament", "Match"];

function decode(value) {
  return String(value ?? "")
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"').replace(/\\u0026/gi, "&")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function textOnly(value) {
  return decode(String(value ?? "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function attrs(raw) {
  const out = {};
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}
function internalHref(href) {
  if (!href || href.startsWith("#") || /^javascript:/i.test(href) || /^mailto:/i.test(href)) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    const url = new URL(href);
    return ["flashscore.pt", "www.flashscore.pt", "m.flashscore.pt"].includes(url.hostname.toLowerCase()) && url.protocol === "https:";
  } catch { return false; }
}
function relevant(value) {
  return /stat|league|tournament|competition|breadcrumb|match|event|tab|standings|classif|futebol/i.test(value || "");
}

export function inspectPageStructure(html) {
  const source = String(html ?? "");
  const links = [];
  for (const m of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const a = attrs(m[1]);
    if (!internalHref(a.href)) continue;
    links.push({
      href: a.href,
      text: textOnly(m[2]).slice(0, 120) || null,
      class: a.class || null,
      id: a.id || null,
      title: a.title || null,
      "aria-label": a["aria-label"] || null,
      "data-testid": a["data-testid"] || null
    });
    if (links.length >= MAX_LINKS) break;
  }

  const scripts = [];
  for (const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const a = attrs(m[1]);
    scripts.push({
      src: a.src || null,
      type: a.type || null,
      id: a.id || null,
      content_bytes: new TextEncoder().encode(m[2]).length,
      has_json_content: /json/i.test(a.type || "") || /^\s*[\[{]/.test(m[2])
    });
    if (scripts.length >= MAX_SCRIPTS) break;
  }

  const dataAttributes = [];
  const classTokens = new Set();
  const idTokens = new Set();
  for (const m of source.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const a = attrs(m[2]);
    const classValue = a.class || "";
    const idValue = a.id || "";
    if (relevant(classValue) || relevant(idValue)) {
      for (const token of classValue.split(/\s+/).filter(relevant)) classTokens.add(token.slice(0, 100));
      for (const token of idValue.split(/\s+/).filter(relevant)) idTokens.add(token.slice(0, 100));
    }
    if (!relevant(classValue + " " + idValue) && !Object.keys(a).some(k => k.startsWith("data-") && relevant(k + " " + a[k]))) continue;
    for (const [name, value] of Object.entries(a)) {
      if (!name.startsWith("data-") || !relevant(name + " " + value)) continue;
      dataAttributes.push({ tag: m[1].toLowerCase(), name, value: value.slice(0, 180), class: classValue || null, id: idValue || null });
      if (dataAttributes.length >= MAX_DATA_ATTRIBUTES) break;
    }
    if (dataAttributes.length >= MAX_DATA_ATTRIBUTES) break;
    if (classTokens.size + idTokens.size >= MAX_TOKENS) break;
  }

  const tokenList = [...classTokens].slice(0, MAX_TOKENS);
  const idList = [...idTokens].slice(0, Math.max(0, MAX_TOKENS - tokenList.length));
  // Amostras curtas da estrutura real: apenas elementos com marcadores explícitos
  // de estatísticas/competição. Não devolve o HTML completo nem faz pedidos de rede.
  const domSamples = [];
  const samplePattern = /<([a-z][\\w:-]*)\\b([^>]*)>/gi;
  for (const match of source.matchAll(samplePattern)) {
    const rawAttrs = attrs(match[2]);
    const marker = [rawAttrs["data-testid"], rawAttrs["data-type"], rawAttrs["data-qa"], rawAttrs.class, rawAttrs.id]
      .filter(Boolean).join(" ");
    if (!/(wcl-statistics|statistic|competition|tournament|league|breadcrumb|country)/i.test(marker)) continue;
    const start = match.index;
    const snippet = source.slice(start, Math.min(source.length, start + MAX_DOM_SAMPLE_CHARS));
    domSamples.push({
      tag: match[1].toLowerCase(),
      marker: marker.slice(0, 220),
      attributes: Object.fromEntries(Object.entries(rawAttrs)
        .filter(([key]) => key.startsWith("data-") || key === "class" || key === "id" || key === "href")
        .slice(0, 16).map(([key, value]) => [key, value.slice(0, 180)])),
      text_preview: textOnly(snippet).slice(0, 360),
      html_preview: snippet.replace(/\\s+/g, " ").slice(0, MAX_DOM_SAMPLE_CHARS)
    });
    if (domSamples.length >= MAX_DOM_SAMPLES) break;
  }

  const plain = textOnly(source);
  const termEvidence = [];
  for (const term of TERMS) {
    let offset = plain.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
    while (offset !== -1 && termEvidence.length < 40) {
      termEvidence.push({ term, offset, context: plain.slice(Math.max(0, offset - 90), Math.min(plain.length, offset + term.length + 120)) });
      offset = plain.toLocaleLowerCase().indexOf(term.toLocaleLowerCase(), offset + term.length);
    }
    if (termEvidence.length >= 40) break;
  }

  return {
    counts: { links: links.length, scripts: scripts.length, data_attributes: dataAttributes.length, class_tokens: tokenList.length, id_tokens: idList.length },
    links,
    scripts,
    data_attributes: dataAttributes,
    class_tokens: tokenList,
    id_tokens: idList,
    text_terms: termEvidence,
    dom_samples: domSamples,
    limits: { links: MAX_LINKS, scripts: MAX_SCRIPTS, data_attributes: MAX_DATA_ATTRIBUTES, tokens: MAX_TOKENS, text_terms: 40, dom_samples: MAX_DOM_SAMPLES, dom_sample_chars: MAX_DOM_SAMPLE_CHARS }
  };
}
