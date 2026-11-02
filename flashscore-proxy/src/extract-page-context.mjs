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
function plain(value) {
  return decode(String(value ?? "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function getAttr(tag, name) {
  const m = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(['\"])([\\s\\S]*?)\\1", "i"));
  return m?.[2] ?? null;
}
function parseAttrs(raw) {
  const out = {};
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}
function add(out, field, value, source) {
  const v = plain(value);
  if (!v || v.length > 180 || /^(?:-+|n\/?a|unknown|null)$/i.test(v)) return;
  if (/^(?:[a-z]{2,3}|\d+)$/i.test(v)) return;
  if (!out[field].some(x => x.value.toLowerCase() === v.toLowerCase())) out[field].push({ value: v, source });
}
function walk(value, path, out, depth = 0) {
  if (!value || typeof value !== "object" || depth > 24) return;
  if (Array.isArray(value)) return value.slice(0, 500).forEach((v, i) => walk(v, path + "[" + i + "]", out, depth + 1));
  for (const [key, v] of Object.entries(value)) {
    const k = key.toLowerCase().replace(/[_-]/g, "");
    const src = path + "." + key;
    if (typeof v === "string" || typeof v === "number") {
      if (/^(competition|tournament|league|eventseries|competitionname|tournamentname|leaguename)$/.test(k)) add(out, "competition", v, src);
      if (/^(country|countryname|countrylabel)$/.test(k)) add(out, "country", v, src);
      if (/^(season|seasonname|seasonyear)$/.test(k)) add(out, "season", v, src);
      if (/^(round|roundname|gameday|matchday)$/.test(k)) add(out, "round", v, src);
      if (/^(stage|stagename|phase|phasename)$/.test(k)) add(out, "stage", v, src);
      if (/^(referee|refereename)$/.test(k)) add(out, "referee", v, src);
      if (/^(venue|stadium|venuename)$/.test(k)) add(out, "venue", v, src);
      if (/^(attendance|spectators)$/.test(k) && /^\d[\d,. ]*$/.test(String(v))) add(out, "attendance", String(v).replace(/[,. ]/g, ""), src);
    }
    if (v && typeof v === "object") walk(v, src, out, depth + 1);
  }
}
function jsonScripts(html) {
  const found = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const type = (getAttr(m[1], "type") || "").toLowerCase();
    const body = decode(m[2].trim());
    if (!body || (!/json/i.test(type) && !/^[{[]/.test(body))) continue;
    try { found.push({ source: "script:" + (type || "json"), value: JSON.parse(body) }); } catch {}
  }
  return found;
}
function extractMeta(html, out) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (getAttr(tag, "property") || getAttr(tag, "name") || getAttr(tag, "itemprop") || "").toLowerCase();
    const val = getAttr(tag, "content");
    if (!val) continue;
    if (/competition|tournament|league/.test(key)) add(out, "competition", val, "meta:" + key);
    if (/country/.test(key)) add(out, "country", val, "meta:" + key);
    if (/season/.test(key)) add(out, "season", val, "meta:" + key);
    if (/referee/.test(key)) add(out, "referee", val, "meta:" + key);
    if (/stadium|venue/.test(key)) add(out, "venue", val, "meta:" + key);
  }
}
function extractDataIdentity(html, out) {
  const countryKeys = new Set(["data-country", "data-country-name", "data-country-label"]);
  const competitionKeys = new Set([
    "data-competition", "data-competition-name", "data-tournament",
    "data-tournament-name", "data-league", "data-league-name"
  ]);
  for (const m of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const attrs = parseAttrs(m[2]);
    for (const [key, value] of Object.entries(attrs)) {
      if (countryKeys.has(key)) add(out, "country", value, "attribute:" + key);
      if (competitionKeys.has(key)) add(out, "competition", value, "attribute:" + key);
      if (key === "data-season" || key === "data-season-name") add(out, "season", value, "attribute:" + key);
    }
  }
}
function extractBreadcrumbs(html, out) {
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = decode(getAttr(m[1], "href") || "");
    const label = plain(m[2]);
    if (!label || !/\/futebol\//i.test(href)) continue;
    const parts = href.split("/").filter(Boolean);
    if (parts.length === 2) add(out, "country", label, "breadcrumb:" + href);
    if (parts.length >= 3) add(out, "competition", label, "breadcrumb:" + href);
  }
}
function extractVisible(html, out) {
  const p = plain(html);
  for (const m of p.matchAll(/\b(20\d{2}\s*\/\s*20\d{2}|20\d{2}\s*[-–]\s*20\d{2})\b/g)) add(out, "season", m[1], "visible-page-text");
  for (const m of p.matchAll(/\b(?:jornada|round|matchday|rodada)\s*#?\s*(\d{1,3})\b/gi)) add(out, "round", m[1], "visible-page-text");
  for (const m of p.matchAll(/\b(oitavos de final|quartos de final|meias?-finais|final|playoffs?|group stage|fase de grupos)\b/gi)) add(out, "stage", m[1], "visible-page-text");
  for (const [label, field] of [["Árbitro", "referee"], ["Referee", "referee"], ["Estádio", "venue"], ["Stadium", "venue"], ["Assistência", "attendance"], ["Attendance", "attendance"]]) {
    const m = p.match(new RegExp(label + "\\s*:?\\s*([^|]{2,90})", "i"));
    if (m) add(out, field, m[1].split(/\s{2,}/)[0], "visible-label:" + label);
  }
}
const STAT_LABELS = [
  ["expected_goals", /^(golos esperados(?: \(xg\))?|expected goals(?: \(xg\))?|xg)$/i],
  ["big_chances", /^(grandes oportunidades|big chances)$/i],
  ["corners", /^(cantos|pontapés de canto|escanteios|corners)$/i],
  ["shots", /^(remates|finalizações|chutes|shots|total remates|total de remates|total shots)$/i],
  ["shots_on_target", /^(remates à baliza|remates enquadrados|finalizações no alvo|chutes no gol|shots on target)$/i],
  ["shots_off_target", /^(remates ao lado|remates para fora|finalizações para fora|shots off target)$/i],
  ["blocked_shots", /^(remates bloqueados|blocked shots)$/i],
  ["shots_inside_box", /^(remates dentro da área|shots inside box)$/i],
  ["shots_outside_box", /^(remates fora da área|shots outside box)$/i],
  ["fouls", /^(faltas|fouls)$/i],
  ["yellow_cards", /^(cartões amarelos|amarelos|yellow cards)$/i],
  ["red_cards", /^(cartões vermelhos|vermelhos|red cards)$/i],
  ["possession", /^(posse de bola|possession)$/i],
  ["offsides", /^(foras de jogo|fora de jogo|offsides)$/i],
  ["saves", /^(defesas|saves|defesas do guarda-redes|goalkeeper saves)$/i],
  ["passes", /^(passes|total de passes|total passes)$/i],
  ["tackles", /^(desarmes|tackles)$/i]
];
function statNumber(value, key) {
  const s = plain(value).replace(/%/g, "").replace(/,/g, ".");
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && (key !== "possession" || n <= 100) ? n : null;
}
function htmlTree(html) {
  const root = { tag: "root", attrs: {}, children: [] };
  const stack = [root];
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const token = /<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)\b([^>]*)>|([^<]+)/gi;
  for (const m of html.matchAll(token)) {
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      if (m[0][1] === "/") {
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === tag) { stack.length = i; break; }
        }
      } else {
        const node = { tag, attrs: parseAttrs(m[2] || ""), children: [] };
        stack[stack.length - 1].children.push(node);
        if (!voidTags.has(tag) && !/\/\s*>$/.test(m[0])) stack.push(node);
      }
    } else if (m[3] && m[3].trim()) {
      stack[stack.length - 1].children.push({ text: decode(m[3]).trim() });
    }
  }
  return root;
}
function nodeText(node) {
  if (node.text !== undefined) return node.text;
  return node.children.map(nodeText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
function collectTextLeaves(node, out) {
  if (node.text !== undefined) { if (node.text) out.push(node.text); return; }
  for (const child of node.children) collectTextLeaves(child, out);
}
function extractWclStatistics(html) {
  const root = htmlTree(html);
  const containers = [];
  const visit = node => {
    const marker = [node.attrs?.["data-testid"], node.attrs?.class, node.attrs?.id].filter(Boolean).join(" ");
    if (/wcl-statistics/i.test(marker)) containers.push(node);
    for (const child of node.children || []) if (child.tag) visit(child);
  };
  visit(root);
  const statistics = {}, evidence = [];
  for (const container of containers) {
    const rows = [];
    const findRows = node => {
      for (const child of node.children || []) {
        if (!child.tag) continue;
        if (/wcl-labelRow/i.test(child.attrs?.class || "")) rows.push(child);
        else findRows(child);
      }
    };
    findRows(container);
    const scopes = rows.length ? rows : [container];
    for (const scope of scopes) {
      const leaves = [];
      collectTextLeaves(scope, leaves);
      const values = leaves.map(plain).filter(Boolean);
      for (let i = 0; i < values.length; i++) {
        const label = values[i].replace(/\\s+/g, " ").trim();
        const found = STAT_LABELS.find(([, re]) => re.test(label));
        if (!found) continue;
        const [key] = found;
        const previous = i > 0 ? statNumber(values[i - 1], key) : null;
        const next = i + 1 < values.length ? statNumber(values[i + 1], key) : null;
        let nums = previous !== null && next !== null ? [previous, next] : [];
        if (nums.length < 2) {
          const following = [];
          for (let j = i + 1; j < values.length && following.length < 2; j++) {
            if (STAT_LABELS.some(([, re]) => re.test(values[j]))) break;
            const n = statNumber(values[j], key);
            if (n !== null) following.push(n);
          }
          if (following.length >= 2) nums = following;
        }
        if (nums.length < 2 || statistics[key]) continue;
        statistics[key] = {
          home: nums[0], away: nums[1],
          unit: key === "possession" ? "%" : null,
          source_label: label
        };
        evidence.push({ field: "statistics." + key, source: "wcl-statistics DOM", label, values: nums });
      }
    }
  }
  return { statistics, evidence };
}
function extractStats(html) {
  const statistics = {}, evidence = [];
  const rows = html.match(/<(?:div|li|tr)\b[^>]*class=["'][^"']*(?:wcl-row|stat__row|comparison__row|statRow)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|li|tr)>/gi) || [];
  for (const row of rows) {
    const parts = [...row.matchAll(/<(?:span|div|strong)\b[^>]*>([\s\S]*?)<\/(?:span|div|strong)>/gi)].map(m => plain(m[1])).filter(Boolean);
    const label = parts.find(v => STAT_LABELS.some(([, re]) => re.test(v)));
    if (!label) continue;
    const [key] = STAT_LABELS.find(([, re]) => re.test(label));
    const nums = parts.map(v => statNumber(v, key)).filter(v => v !== null);
    if (nums.length < 2 || statistics[key]) continue;
    statistics[key] = { home: nums[0], away: nums[1], unit: key === "possession" ? "%" : null, source_label: label };
    evidence.push({ field: "statistics." + key, source: "statistics-row HTML", label, values: nums.slice(0, 2) });
  }
  const modern = extractWclStatistics(html);
  for (const [key, value] of Object.entries(modern.statistics)) {
    if (!statistics[key]) statistics[key] = value;
  }
  evidence.push(...modern.evidence.filter(item => !evidence.some(existing => existing.field === item.field)));
  return { statistics, evidence };
}
export function extractPageContext(html) {
  const candidates = Object.fromEntries(["country", "competition", "season", "stage", "round", "referee", "venue", "attendance"].map(k => [k, []]));
  extractMeta(html, candidates);
  extractDataIdentity(html, candidates);
  extractBreadcrumbs(html, candidates);
  extractVisible(html, candidates);
  const scripts = jsonScripts(html);
  scripts.forEach((s, i) => walk(s.value, s.source + "[" + i + "]", candidates));
  const fields = {}, evidence = [], ambiguous = [];
  for (const [field, items] of Object.entries(candidates)) {
    const unique = [...new Map(items.map(x => [x.value.toLowerCase(), x])).values()];
    fields[field] = unique.length === 1 ? (field === "attendance" ? Number(unique[0].value) : unique[0].value) : null;
    if (unique.length > 1) ambiguous.push(field);
    if (unique.length) evidence.push({ field, selected: fields[field], candidates: unique });
  }
  const stats = extractStats(html);
  evidence.push(...stats.evidence);
  return {
    fields, statistics: stats.statistics, evidence,
    diagnostics: {
      json_scripts_parsed: scripts.length,
      candidate_counts: Object.fromEntries(Object.entries(candidates).map(([k, v]) => [k, v.length])),
      ambiguous_fields: ambiguous
    }
  };
}
