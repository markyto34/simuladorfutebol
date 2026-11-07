#!/usr/bin/env node
/**
 * Recolhe estatísticas e odds Bwin a partir da mesma página de estatísticas
 * de cada jogo Flashscore. Não recolhe odds de outras casas.
 *
 * Uso: node scripts/collect-flashscore-csv.mjs <match_id> [match_id...]
 * Opcional: FLASHSCORE_PROXY_URL e FLASHSCORE_REQUEST_DELAY_MS.
 */
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mergeRows, mergeLatestRows } from "./csv-merge.mjs";
import { filterHistoricalMatchIds } from "./historical-fixture-matching.mjs";

const PROXY = (process.env.FLASHSCORE_PROXY_URL || "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev").replace(/\/$/, "");
const DELAY_MS = Math.max(100, Number(process.env.FLASHSCORE_REQUEST_DELAY_MS || 300));
const CONCURRENCY = Math.max(1, Math.min(4, Number.parseInt(process.env.FLASHSCORE_CONCURRENCY || "2", 10) || 2));
const REQUEST_TIMEOUT_MS = 45_000;
const DISCOVERY_TIMEOUT_MS = 60_000;
const MAX_MANUAL_MATCHES = 5;
const MAX_DAILY_MATCHES = 2000;
const BASE_ODDS_HISTORY_FILE = resolve("ganhonasodds_com_20261101.csv");
const STATS_FILE = resolve("data/flashscore-statistics.csv");
const ODDS_FILE = resolve("data/bwin-odds-flashscore.csv");

export function buildTeamLastFiveCompetitionMap(payload) {
  const identities = {};
  for (const fixture of Array.isArray(payload?.fixtures) ? payload.fixtures : []) {
    const competitionLabel = String(fixture?.competition || "");
    const match = competitionLabel.match(/^([^:]+):\s*(.+)$/);
    if (fixture?.match_id && match) {
      identities[fixture.match_id] = {
        status: "identified",
        country: match[1].trim(),
        competition: match[2].trim()
      };
    }
  }
  return identities;
}

export function selectTeamLastFiveMatchIds(payload, limit = 0) {
  const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];
  const ids = [...new Set(fixtures.filter(f => f?.stats_status !== "already_complete" && f?.stats_status !== "already_collected" && /^[A-Za-z0-9]{6,16}$/.test(String(f?.match_id || ""))).map(f => f.match_id))];
  const n = Number(limit);
  return Number.isInteger(n) && n > 0 ? ids.slice(0, n) : ids;
}

const STAT_KEYS = [
  "xg", "possession", "shots", "shots_on_target", "big_chances", "corners", "corners_ht", "corners_st",
  "yellow_cards", "red_cards", "shots_off_target", "blocked_shots", "shots_inside_box",
  "shots_outside_box", "offsides", "fouls"
];
const STAT_HEADERS = [
  "match_id", "date_time", "country", "competition", "home_team", "away_team",
  "status", "score_home", "score_away", "ht_home", "ht_away", "sh_home", "sh_away",
  ...STAT_KEYS.flatMap(key => [key + "_home", key + "_away"]),
  "source", "source_url", "retrieved_at"
];
const ODDS_HEADERS = [
  "match_id", "date_time", "country", "competition", "home_team", "away_team",
  "bookmaker", "market", "odd_1", "odd_x", "odd_2",
  "odds_timestamp_type", "retrieved_at", "source", "source_url"
];

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function toCsv(headers, rows) {
  return [headers.join(","), ...rows.map(row => headers.map(key => csvCell(row[key])).join(","))].join("\n") + "\n";
}
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  text = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some(value => value !== "")) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift();
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}
async function readRows(path) {
  try { return parseCsv(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
const FINAL_STATUSES_WITHOUT_FT = /^(Terminado|Tempo Final|Depois de Prolongamento|Após prolongamento|A\\.P\\.)$/i;

export function shouldStoreStatisticsRecord(record) {
  const status = String(record?.status || "").trim();
  if (!FINAL_STATUSES_WITHOUT_FT.test(status)) return true;
  const score = record?.score?.full_time;
  const hasHome = score?.home !== null && score?.home !== undefined && String(score.home).trim() !== "";
  const hasAway = score?.away !== null && score?.away !== undefined && String(score.away).trim() !== "";
  return hasHome && hasAway;
}

function statisticsRow(record) {
  const row = {
    match_id: record.match_id,
    date_time: record.date_time_iso_local || record.date_time || "",
    country: record.country || "",
    competition: record.competition || "",
    home_team: record.teams?.home?.name || "",
    away_team: record.teams?.away?.name || "",
    status: record.status || "",
    score_home: record.score?.full_time?.home ?? "",
    score_away: record.score?.full_time?.away ?? "",
    ht_home: record.score?.half_time?.home ?? "",
    ht_away: record.score?.half_time?.away ?? "",
    sh_home: record.score?.second_half?.home ?? "",
    sh_away: record.score?.second_half?.away ?? "",
    source: "Flashscore",
    source_url: record.source_capture?.url || "",
    retrieved_at: record.source_capture?.retrieved_at || ""
  };
  for (const key of STAT_KEYS) {
    const sourceKey = key === "xg" ? "expected_goals" : key;
    row[key + "_home"] = record.statistics?.[sourceKey]?.home ?? "";
    row[key + "_away"] = record.statistics?.[sourceKey]?.away ?? "";
  }
  return row;
}
function bwinOddsRow(record) {
  const odds = record.odds;
  const market = odds?.markets?.["1x2"];
  if (odds?.bookmaker !== "Bwin" || !market) return null;
  const values = [market.home, market.draw, market.away].map(Number);
  if (!values.every(value => Number.isFinite(value) && value > 1 && value <= 1000)) return null;
  return {
    match_id: record.match_id,
    date_time: record.date_time_iso_local || record.date_time || "",
    country: record.country || "",
    competition: record.competition || "",
    home_team: record.teams?.home?.name || "",
    away_team: record.teams?.away?.name || "",
    bookmaker: "Bwin",
    market: "1X2",
    odd_1: values[0],
    odd_x: values[1],
    odd_2: values[2],
    odds_timestamp_type: odds.odds_timestamp_type || "observed_at_collection",
    retrieved_at: odds.retrieved_at || record.source_capture?.retrieved_at || "",
    source: "Flashscore",
    source_url: record.source_capture?.url || ""
  };
}
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const PROGRESS_BRANCH = "collection-progress";
const PROGRESS_PATH = process.env.FLASHSCORE_PROGRESS_PATH || "monitor/collection-progress.json";
let progressSnapshot = null;
let progressBranchReady = false;

async function publishProgress() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository || !progressSnapshot) return;
  const headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const api = "https://api.github.com/repos/" + repository;
  const request = (url, options = {}) => fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) }, signal: AbortSignal.timeout(12_000) });
  try {
    if (!progressBranchReady) {
      const refResponse = await request(api + "/git/ref/heads/" + PROGRESS_BRANCH);
      if (refResponse.status === 404) {
        const createResponse = await request(api + "/git/refs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: "refs/heads/" + PROGRESS_BRANCH, sha: process.env.GITHUB_SHA })
        });
        if (!createResponse.ok && createResponse.status !== 422) throw new Error("Não foi possível criar a branch de progresso (HTTP " + createResponse.status + ").");
      } else if (!refResponse.ok) {
        throw new Error("Não foi possível consultar a branch de progresso (HTTP " + refResponse.status + ").");
      }
      progressBranchReady = true;
    }
    const fileUrl = api + "/contents/" + PROGRESS_PATH + "?ref=" + PROGRESS_BRANCH;
    const currentFile = await request(fileUrl);
    let contentSha;
    if (currentFile.ok) contentSha = (await currentFile.json()).sha;
    else if (currentFile.status !== 404) throw new Error("Não foi possível ler o estado anterior (HTTP " + currentFile.status + ").");
    const payload = { ...progressSnapshot, updated_at: new Date().toISOString() };
    const updateResponse = await request(api + "/contents/" + PROGRESS_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Atualizar progresso da recolha " + (payload.run_id || "manual"),
        content: Buffer.from(JSON.stringify(payload, null, 2) + "\n").toString("base64"),
        branch: PROGRESS_BRANCH,
        ...(contentSha ? { sha: contentSha } : {})
      })
    });
    if (!updateResponse.ok) throw new Error("Não foi possível publicar o progresso (HTTP " + updateResponse.status + ").");
    console.log("[MONITOR] Progresso publicado: " + payload.processed_games + "/" + payload.total_games + " jogos; fase=" + payload.phase + ".");
  } catch (error) {
    console.warn("[MONITOR] Não foi possível atualizar o painel de progresso: " + error.message);
  }
}

async function setProgress(patch) {
  progressSnapshot = { ...(progressSnapshot || {}), ...patch, updated_at: new Date().toISOString() };
  await publishProgress();
}

async function collect(matchId) {
  if (!/^[A-Za-z0-9]{6,16}$/.test(matchId)) throw new Error("ID inválido: " + matchId);
  const url = new URL(PROXY + "/record");
  url.searchParams.set("id", matchId);
  url.searchParams.set("tab", "statistics");
  let response;
  try {
    response = await fetch(url, { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error("Timeout: o pedido ao proxy excedeu " + (REQUEST_TIMEOUT_MS / 1000) + " segundos.");
    throw new Error("Erro de rede ao consultar o proxy: " + error.message);
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("Resposta não JSON para " + matchId + " (HTTP " + response.status + ")."); }
  if (!response.ok || payload.ok !== true || !payload.record) {
    const upstream = Number(payload.upstream_status || 0);
    if (upstream === 403 || upstream === 429) {
      const error = new Error("Flashscore respondeu HTTP " + upstream + "; recolha interrompida sem novas tentativas.");
      error.stop = true;
      throw error;
    }
    throw new Error("Falha ao recolher " + matchId + ": " + (payload.error || "HTTP " + response.status));
  }
  if (payload.record.source !== "Flashscore" || payload.record.match_id !== matchId) {
    throw new Error("A resposta não corresponde ao jogo Flashscore solicitado: " + matchId);
  }
  return payload.record;
}

async function collectWithRetry(matchId) {
  // Backoff exponencial para 5xx/timeout: evita repetir pedidos demasiado depressa.
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await collect(matchId);
    } catch (error) {
      const retryable = !error.stop && /Erro de rede|Timeout:|HTTP 408|HTTP 429|HTTP 5\d\d|upstream_unavailable|upstream_rejected/i.test(error.message || "");
      if (!retryable || attempt === maxAttempts) throw error;
      const waitMs = Math.min(60_000, 5_000 * (2 ** (attempt - 1)));
      console.warn("[RETRY] " + matchId + " | tentativa " + (attempt + 1) + "/" + maxAttempts + " em " + waitMs + " ms | " + error.message);
      await sleep(waitMs);
    }
  }
}

async function discoverMatchIds(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
    throw new Error("Data inválida. Usa --date=YYYY-MM-DD.");
  }
  const url = new URL(PROXY + "/discover-inspect");
  url.searchParams.set("date", date);
  url.searchParams.set("ids", "1");
  console.log("[DISCOVERY] A pedir ao proxy a lista de jogos de " + date + "...");
  let response;
  let lastDiscoveryError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      response = await fetch(url, { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
      if (response.status >= 500 && attempt < 4) {
        const waitMs = 5_000 * (2 ** (attempt - 1));
        console.warn("[DISCOVERY RETRY] " + date + " | HTTP " + response.status + " | tentativa " + (attempt + 1) + "/4 em " + waitMs + " ms.");
        await sleep(waitMs);
        continue;
      }
      break;
    } catch (error) {
      lastDiscoveryError = error;
      if (attempt === 4) {
        if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error("Timeout na descoberta: o proxy não respondeu em " + (DISCOVERY_TIMEOUT_MS / 1000) + " segundos.");
        throw new Error("Erro de rede durante a descoberta: " + error.message);
      }
      const waitMs = 5_000 * (2 ** (attempt - 1));
      console.warn("[DISCOVERY RETRY] " + date + " | erro de rede | tentativa " + (attempt + 1) + "/4 em " + waitMs + " ms.");
      await sleep(waitMs);
    }
  }
  if (!response) throw new Error("Falha na descoberta após novas tentativas: " + String(lastDiscoveryError?.message || "sem resposta"));
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("Resposta não JSON na descoberta da data (HTTP " + response.status + ")."); }
  if (!response.ok || payload.ok !== true || !payload.inspection) {
    const upstream = Number(payload.upstream_status || 0);
    const upstreamMessage = String(payload.message || "").trim();
    const contentType = String(payload.content_type || "").trim();
    const detail = [
      "proxy_http=" + response.status,
      upstream ? "flashscore_http=" + upstream : "",
      "error=" + String(payload.error || "unknown"),
      upstreamMessage ? "message=" + upstreamMessage : "",
      contentType ? "content_type=" + contentType : ""
    ].filter(Boolean).join("; ");
    if (upstream === 403 || upstream === 429) {
      const error = new Error("Flashscore respondeu HTTP " + upstream + " na descoberta; recolha interrompida. " + detail);
      error.stop = true;
      throw error;
    }
    throw new Error("Falha na descoberta de jogos (" + detail + ").");
  }
  if (payload.inspection.truncated) {
    throw new Error("A lista da data excede o limite seguro de 2000 jogos; não foi iniciada a recolha.");
  }
  return {
    matchIds: [...new Set((payload.inspection.match_ids || []).filter(id => /^[A-Za-z0-9]{6,16}$/.test(id)))],
    competitionByMatchId: payload.inspection.match_competition_identities || {},
    fixturesByMatchId: payload.inspection.match_fixtures || {}
  };
}

export function normalizeCompetitionIdentity(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function filterMatchIdsToSelectedCompetitions(ids, identities, selectedPairs) {
  return ids.filter(id => {
    const identity = identities[id];
    return identity?.status === "identified" &&
      selectedPairs.has(normalizeCompetitionIdentity(identity.country) + "|" + normalizeCompetitionIdentity(identity.competition));
  });
}

export async function loadSelectedCompetitionPairs() {
  const [selection, catalog] = await Promise.all([
    readFile("data/flashscore-competition-selection.json", "utf8").then(JSON.parse),
    readFile("data/flashscore-competition-catalog.json", "utf8").then(JSON.parse)
  ]);
  if (selection.selection_mode !== "explicit" || !Array.isArray(selection.selected_paths) || !selection.selected_paths.length) {
    throw new Error("A seleção explícita de competições Flashscore está vazia ou inválida; recolha cancelada.");
  }
  const selectedPaths = new Set(selection.selected_paths);
  const selectedPairs = new Set((catalog.competitions || []).filter(item => {
    try { return selectedPaths.has(new URL(item.url).pathname); } catch { return false; }
  }).map(item => normalizeCompetitionIdentity(item.country_name) + "|" + normalizeCompetitionIdentity(item.competition_name)));
  if (!selectedPairs.size) throw new Error("Nenhuma competição selecionada corresponde ao catálogo Flashscore.");
  return { selectedPaths, selectedPairs };
}

async function filterToSelectedCompetitions(ids, identities) {
  const { selectedPaths, selectedPairs } = await loadSelectedCompetitionPairs();
  const kept = filterMatchIdsToSelectedCompetitions(ids, identities, selectedPairs);
  console.log("[COMPETITION SELECTION] " + kept.length + "/" + ids.length + " jogos pertencem às " + selectedPaths.size + " competições escolhidas; restantes excluídos.");
  return kept;
}

async function main() {
  const args = process.argv.slice(2);
  progressSnapshot = {
    run_id: process.env.GITHUB_RUN_ID || "local",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
    collection_type: process.env.FLASHSCORE_COLLECTION_TYPE || "daily",
    current_competition_path: process.env.FLASHSCORE_BACKFILL_COMPETITION_PATH || "",
    competition_index: Number(process.env.FLASHSCORE_BACKFILL_COMPETITION_INDEX || 0),
    total_competitions: Number(process.env.FLASHSCORE_BACKFILL_COMPETITION_TOTAL || 0),
    selected_competitions: (() => { try { return JSON.parse(process.env.FLASHSCORE_BACKFILL_SELECTED_PATHS_JSON || "[]"); } catch { return []; } })(),
    competitions_completed: Number(process.env.FLASHSCORE_BACKFILL_COMPLETED || 0),
    competitions_failed: Number(process.env.FLASHSCORE_BACKFILL_FAILURES || 0),
    failed_competitions: (() => { try { return JSON.parse(process.env.FLASHSCORE_BACKFILL_FAILED_PATHS_JSON || "[]"); } catch { return []; } })(),
    blocked: false,
    target_date: "",
    status: "running",
    phase: "discovery",
    total_games: 0,
    processed_games: 0,
    stats_games: 0,
    bwin_odds: 0,
    failed_games: 0,
    current_match: "A descobrir jogos",
    last_result: ""
  };
  await publishProgress();
  const dateOption = args.find(arg => arg.startsWith("--date="));
  const historicalOddsOnly = args.includes("--historical-odds");
  const statsOnly = args.includes("--stats-only");
  const teamLastFiveOption = args.find(arg => arg.startsWith("--team-last-five="));
  const teamLastFiveLimit = Number(args.find(arg => arg.startsWith("--limit="))?.slice("--limit=".length) || 0);
  let matchIds = args.filter(arg => !arg.startsWith("--"));
  let competitionByMatchId = {};
  let fixturesByMatchId = {};
  let selectedPairsForDailyStats = null;
  if (teamLastFiveOption && (dateOption || matchIds.length)) throw new Error("Usa --team-last-five=ficheiro.json isoladamente, sem IDs nem --date.");
  if (dateOption && matchIds.length) {
    throw new Error("Usa IDs de jogos ou --date=YYYY-MM-DD, não ambos.");
  }
  if (historicalOddsOnly && !dateOption) {
    throw new Error("A opção --historical-odds só pode ser usada com --date=YYYY-MM-DD.");
  }
  if (teamLastFiveOption) {
    const file = resolve(teamLastFiveOption.slice("--team-last-five=".length));
    let payload;
    try { payload = JSON.parse(await readFile(file, "utf8")); }
    catch (error) { throw new Error("Não foi possível ler o manifesto de últimos cinco jogos: " + error.message); }
    const allIds = selectTeamLastFiveMatchIds(payload, 0);
    matchIds = selectTeamLastFiveMatchIds(payload, teamLastFiveLimit);
    competitionByMatchId = buildTeamLastFiveCompetitionMap(payload);
    // O manifesto é criado para uma competição já selecionada pelo workflow.
    // Reaplicar aqui o filtro global por nomes do catálogo pode excluir jogos
    // legítimos quando a designação do feed difere da designação do catálogo.
    // A validação posterior compara todos os jogos do manifesto com o CSV.
    console.log("[SEASON BACKFILL] " + allIds.length + " jogos concluídos pendentes no manifesto desta competição; selecionados " + matchIds.length + "; jogos já consultados ignorados=" + ((payload.fixtures || []).filter(f => f.stats_status === "already_complete" || f.stats_status === "already_collected").length) + ".");
    await setProgress({ phase: "collecting", current_match: "A preparar todos os jogos pendentes da época", total_games: matchIds.length });
  }
  if (dateOption) {
    const date = dateOption.slice("--date=".length);
    await setProgress({ target_date: date, phase: "discovery", current_match: "A descobrir jogos" });
    console.log("[DISCOVERY] Início da descoberta no Flashscore para " + date + ".");
    const discovery = await discoverMatchIds(date);
    matchIds = discovery.matchIds;
    competitionByMatchId = discovery.competitionByMatchId;
    fixturesByMatchId = discovery.fixturesByMatchId;
    // A recolha diária de odds percorre todos os jogos descobertos; a seleção
    // Flashscore limita apenas as estatísticas guardadas para o simulador.
    selectedPairsForDailyStats = (await loadSelectedCompetitionPairs()).selectedPairs;
    const identified = Object.values(competitionByMatchId).filter(identity => identity?.status === "identified").length;
    console.log("[DISCOVERY] Concluída: " + matchIds.length + " IDs únicos válidos encontrados para " + date + "; " + identified + " com país/competição explicitamente identificados.");
    await setProgress({ total_games: matchIds.length, phase: "collecting", current_match: "A preparar recolha" });
    if (historicalOddsOnly) {
      const [historicalRows, statsRows] = await Promise.all([
        readRows(BASE_ODDS_HISTORY_FILE),
        readRows(STATS_FILE)
      ]);
      if (!historicalRows.length) throw new Error("O CSV histórico completo não foi encontrado ou está vazio; recolha filtrada cancelada.");
      const selection = filterHistoricalMatchIds({
        date,
        matchIds,
        fixturesByMatchId,
        competitionByMatchId,
        historicalRows,
        existingStats: statsRows
      });
      matchIds = selection.matchIds;
      console.log("[HISTORICAL FILTER] " + JSON.stringify(selection));
      if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(process.env.GITHUB_STEP_SUMMARY,
          "\n## Filtro pelo histórico completo de odds\n\n" +
          "- Jogos descobertos no Flashscore: **" + selection.discovered + "**\n" +
          "- Jogos do histórico encontrados: **" + selection.matched_targets + "**\n" +
          "- Sem correspondência: **" + selection.unmatched_fixtures + "**\n" +
          "- Ambíguos ignorados: **" + selection.ambiguous_fixtures + "**\n" +
          "- Sem nomes de equipas: **" + selection.missing_fixture_names + "**\n" +
          "- Já completos e ignorados: **" + selection.skipped_complete_stats + "**\n" +
          "- Na fila para recolha: **" + selection.queued_for_collection + "**\n", "utf8");
      }
    }
  }
  matchIds = [...new Set(matchIds)];
  const recoveryBatch = args.includes("--recovery-batch");
  const maxMatches = (dateOption || teamLastFiveOption || recoveryBatch) ? MAX_DAILY_MATCHES : MAX_MANUAL_MATCHES;
  if (matchIds.length > maxMatches) {
    throw new Error("Limite de segurança: máximo de " + maxMatches + " jogos por execução" + (dateOption ? " diária." : " manual."));
  }
  if (!matchIds.length) {
    if (teamLastFiveOption) {
      console.log("Não existem jogos pendentes no manifesto de últimos cinco. Nada a recolher.");
      await setProgress({ status: "completed", phase: "completed", total_games: 0, current_match: "Sem jogos pendentes" });
      return;
    }
    if (dateOption) {
      console.log("Não foram encontrados jogos Flashscore para a data indicada. Nada a acrescentar aos CSV.");
      await setProgress({ status: "completed", phase: "completed", total_games: 0, current_match: "Sem jogos para recolher" });
      return;
    }
    console.error("Uso: node scripts/collect-flashscore-csv.mjs <match_id> [match_id...]");
    console.error("  ou: node scripts/collect-flashscore-csv.mjs --date=YYYY-MM-DD");
    console.error("  ou: node scripts/collect-flashscore-csv.mjs --team-last-five=ficheiro.json [--limit=5]");
    console.error("  ou: node scripts/collect-flashscore-csv.mjs --recovery-batch <match_id...>");
    process.exitCode = 2;
    return;
  }
  await mkdir(dirname(STATS_FILE), { recursive: true });
  const existingStats = await readRows(STATS_FILE);
  const existingOdds = await readRows(ODDS_FILE);
  // Em recuperação por IDs explícitos, reutilizar a identidade já guardada no histórico.
  // O endpoint de detalhes do jogo nem sempre devolve país/competição.
  const historicalIdentityByMatchId = new Map(existingStats
    .filter(row => row.match_id && row.country && row.competition)
    .map(row => [row.match_id, { country: row.country, competition: row.competition }]));
  for (const row of existingOdds) {
    if (row.match_id && row.country && row.competition && !historicalIdentityByMatchId.has(row.match_id)) {
      historicalIdentityByMatchId.set(row.match_id, { country: row.country, competition: row.competition });
    }
  }
  if (!dateOption && !teamLastFiveOption) {
    const { selectedPaths, selectedPairs } = await loadSelectedCompetitionPairs();
    const identities = Object.fromEntries([...historicalIdentityByMatchId].map(([id, identity]) => [id, { ...identity, status: "identified" }]));
    const filteredIds = filterMatchIdsToSelectedCompetitions(matchIds, identities, selectedPairs);
    if (filteredIds.length !== matchIds.length) {
      const excluded = matchIds.length - filteredIds.length;
      throw new Error("Execução cancelada: " + excluded + " IDs manuais/recuperação não têm uma competição selecionada confirmada no histórico. Nenhum jogo foi recolhido.");
    }
    matchIds = filteredIds;
    console.log("[COMPETITION SELECTION] IDs manuais/recuperação validados contra " + selectedPaths.size + " competições selecionadas.");
  }
  for (const row of existingOdds) {
    const identity = historicalIdentityByMatchId.get(row.match_id);
    if (identity) {
      if (!row.country) row.country = identity.country;
      if (!row.competition) row.competition = identity.competition;
    }
  }
  const statsNew = [], oddsNew = [];
  let failures = 0, processed = 0, stoppedByUpstream = false;
  let competitionIdentified = 0, competitionMissing = 0;
  let nextIndex = 0, nextStartAt = 0;
  const collectionStartedAt = Date.now();
  await setProgress({ total_games: matchIds.length, phase: "collecting", current_match: "A iniciar recolha" });
  console.log("[COLLECT] A iniciar " + matchIds.length + " jogos; concorrência máxima: " + CONCURRENCY + "; intervalo global entre inícios: " + DELAY_MS + " ms; timeout por jogo: " + (REQUEST_TIMEOUT_MS / 1000) + " s.");

  async function takeNextJob() {
    if (stoppedByUpstream || nextIndex >= matchIds.length) return null;
    const index = nextIndex++;
    const now = Date.now();
    const wait = Math.max(0, nextStartAt - now);
    nextStartAt = Math.max(now, nextStartAt) + DELAY_MS;
    if (wait) await sleep(wait);
    if (stoppedByUpstream) return null;
    return { index, matchId: matchIds[index] };
  }

  async function worker() {
    while (!stoppedByUpstream) {
      const job = await takeNextJob();
      if (!job) return;
      const { index, matchId } = job;
      const matchStartedAt = Date.now();
      progressSnapshot.phase = "collecting";
      progressSnapshot.current_match = "A consultar jogo " + (index + 1) + "/" + matchIds.length + " · " + matchId;
      console.log("[PROGRESS] " + (index + 1) + "/" + matchIds.length + " | START | id=" + matchId);
      try {
        const record = await collectWithRetry(matchId);
        const identity = competitionByMatchId[matchId];
        const historicalIdentity = historicalIdentityByMatchId.get(matchId);
        const resolvedIdentity = identity?.status === "identified" ? identity : historicalIdentity;
        if (resolvedIdentity) {
          if (!record.country) record.country = resolvedIdentity.country;
          if (!record.competition) record.competition = resolvedIdentity.competition;
        }
        if (record.country && record.competition) competitionIdentified++;
        else competitionMissing++;
        const statsIdentity = resolvedIdentity || (record.country && record.competition
          ? { country: record.country, competition: record.competition, status: "identified" }
          : null);
        const keepStatsForSimulator = !dateOption || Boolean(statsIdentity &&
          filterMatchIdsToSelectedCompetitions([matchId], { [matchId]: statsIdentity }, selectedPairsForDailyStats).length);
        // No backfill por época, guardar também a consulta bem-sucedida sem
        // estatísticas: distingue "Flashscore consultado, sem dados" de erro técnico.
        // A recolha diária continua a guardar apenas registos com estatísticas.
        const hasStatistics = record.statistics && Object.keys(record.statistics).length > 0;
        if (keepStatsForSimulator && (hasStatistics || teamLastFiveOption || statsOnly)) {
          if (shouldStoreStatisticsRecord(record)) {
            statsNew.push(statisticsRow(record));
            if (hasStatistics) progressSnapshot.stats_games++;
          } else {
            console.log("[SKIP] Jogo finalizado sem resultado FT; não entra no CSV estatístico: " + matchId);
          }
        }
        const oddsRow = statsOnly ? null : bwinOddsRow(record);
        if (oddsRow) {
          oddsNew.push(oddsRow);
          progressSnapshot.bwin_odds++;
        }
        const home = record.teams?.home?.name || "Casa";
        const away = record.teams?.away?.name || "Fora";
        progressSnapshot.last_result = home + " - " + away + ": " + Object.keys(record.statistics || {}).length + " estatísticas; Bwin 1X2 " + (oddsRow ? "encontradas" : "não confirmado");
        progressSnapshot.current_match = "Último concluído: " + home + " - " + away;
        console.log("[PROGRESS] " + (index + 1) + "/" + matchIds.length + " | OK | " + home + " - " + away + " | id=" + matchId + " | stats=" + Object.keys(record.statistics || {}).length + " | competição=" + (record.country && record.competition ? record.country + "/" + record.competition : "não identificada") + " | bwin_1x2=" + (oddsRow ? "sim" : "não confirmado") + " | " + (Date.now() - matchStartedAt) + " ms");
      } catch (error) {
        failures++;
        progressSnapshot.failed_games++;
        progressSnapshot.last_result = "Falha em " + matchId + ": " + error.message;
        progressSnapshot.current_match = "Último erro: " + matchId;
        console.error("[PROGRESS] " + (index + 1) + "/" + matchIds.length + " | ERROR | id=" + matchId + " | " + error.message);
        if (error.stop) stoppedByUpstream = true;
      } finally {
        processed++;
        progressSnapshot.processed_games = processed;
      }
      if (processed % 25 === 0 || processed === matchIds.length || stoppedByUpstream) {
        await setProgress({
          phase: stoppedByUpstream ? "stopped" : "collecting",
          status: stoppedByUpstream ? "blocked" : "running",
          current_match: stoppedByUpstream ? "Recolha interrompida por resposta 403/429" : progressSnapshot.current_match
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, matchIds.length) }, () => worker()));
  const mergedStats = mergeRows(existingStats, statsNew, row => row.match_id);
  const mergedOdds = statsOnly ? existingOdds : mergeLatestRows(existingOdds, oddsNew, row => [row.match_id, row.bookmaker, row.market].join("|"));
  await writeFile(STATS_FILE, toCsv(STAT_HEADERS, mergedStats), "utf8");
  if (!statsOnly) await writeFile(ODDS_FILE, toCsv(ODDS_HEADERS, mergedOdds), "utf8");
  console.log("CSV de estatísticas: " + STATS_FILE + " (" + mergedStats.length + " jogos).");
  const uniqueOddsKeys = new Set(mergedOdds.map(row => [row.match_id, row.bookmaker, row.market].join("|")));
  if (uniqueOddsKeys.size !== mergedOdds.length) throw new Error("Validação falhou: existem chaves duplicadas no CSV de odds.");
  console.log("CSV exclusivo Bwin: " + ODDS_FILE + " (" + mergedOdds.length + " registos totais; " + uniqueOddsKeys.size + " chaves únicas).");
  const elapsedSeconds = Math.round((Date.now() - collectionStartedAt) / 1000);
  await setProgress({ status: stoppedByUpstream ? "blocked" : failures ? "completed_with_errors" : "completed", phase: stoppedByUpstream ? "stopped" : "completed", blocked: stoppedByUpstream, current_match: stoppedByUpstream ? "Interrompida por bloqueio 403/429" : "Recolha terminada" });
  const summary = [
    "## Recolha Flashscore + Bwin",
    "",
    "- Jogos descobertos: **" + matchIds.length + "**",
    "- Jogos processados: **" + processed + "**",
    "- Registos com estatísticas: **" + statsNew.length + "**",
    "- Jogos com país/competição identificados: **" + competitionIdentified + "/" + processed + "**",
    "- Novas observações Bwin 1X2: **" + oddsNew.length + "**",
    "- Total atualizado de registos no CSV Bwin: **" + mergedOdds.length + "**",
    "- Falhas: **" + failures + "**",
    "- Interrompida por bloqueio 403/429: **" + (stoppedByUpstream ? "sim" : "não") + "**",
    "- Duração: **" + elapsedSeconds + " s**"
   ].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n", "utf8");
  console.log("[SUMMARY] " + processed + "/" + matchIds.length + " processados; " + statsNew.length + " jogos com estatísticas; país/competição=" + competitionIdentified + "/" + processed + "; " + oddsNew.length + " novas odds Bwin; total CSV Bwin=" + mergedOdds.length + "; " + failures + " falhas; " + elapsedSeconds + " s.");
  if (failures) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(async error => {
  console.error(error);
  if (progressSnapshot) await setProgress({ status: "failed", phase: "failed", current_match: "Falha na recolha", last_result: error.message });
  process.exitCode = 1;
});
