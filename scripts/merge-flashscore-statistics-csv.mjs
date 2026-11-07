#!/usr/bin/env node
/**
 * Combines the remote and local sides of a Flashscore statistics CSV conflict.
 * Rows are keyed by match_id; newest observations win and blank fields are
 * backfilled from the older row. Empty/unknown values never overwrite zero.
 */
import { readFile, writeFile } from "node:fs/promises";
import { mergeLatestRows } from "./csv-merge.mjs";
import { pathToFileURL } from "node:url";

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i], next = input[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error("CSV inválido: aspas por fechar.");
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some(value => value !== "")) rows.push(row);
  }
  if (!rows.length) throw new Error("CSV vazio ou sem cabeçalho.");
  const headers = rows.shift();
  if (headers.some(header => !header) || new Set(headers).size !== headers.length) {
    throw new Error("CSV inválido: cabeçalhos vazios ou duplicados.");
  }
  return {
    headers,
    records: rows.map((values, index) => {
      if (values.length > headers.length) throw new Error("CSV inválido na linha " + (index + 2) + ": colunas a mais.");
      return Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    })
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function stringifyCsv(headers, records) {
  return [headers.join(","), ...records.map(record => headers.map(header => csvCell(record[header])).join(","))].join("\n") + "\n";
}

export function mergeStatisticsCsv(remoteText, localText) {
  const remote = parseCsv(remoteText);
  const local = parseCsv(localText);
  if (remote.headers.join("\u0000") !== local.headers.join("\u0000")) {
    throw new Error("Os CSV têm esquemas diferentes; merge automático recusado.");
  }
  for (const [side, records] of [["remoto", remote.records], ["local", local.records]]) {
    if (records.some(record => !String(record.match_id || "").trim())) {
      throw new Error("Existe um registo sem match_id no CSV " + side + ".");
    }
  }
  // O timestamp mais recente prevalece; os campos vazios são preenchidos
  // pelo outro lado. A string "0" é preservada como observação confirmada.
  const merged = mergeLatestRows(remote.records, local.records, record => record.match_id, "retrieved_at");
  return stringifyCsv(remote.headers, merged);
}

async function main() {
  const [remotePath, localPath, outputPath] = process.argv.slice(2);
  if (!remotePath || !localPath || !outputPath) {
    throw new Error("Uso: node scripts/merge-flashscore-statistics-csv.mjs <remoto.csv> <local.csv> <saida.csv>");
  }
  const [remoteText, localText] = await Promise.all([
    readFile(remotePath, "utf8"),
    readFile(localPath, "utf8")
  ]);
  const merged = mergeStatisticsCsv(remoteText, localText);
  await writeFile(outputPath, merged, "utf8");
  console.log("[CSV MERGE] CSV combinado por match_id: " + (parseCsv(merged).records.length) + " jogos.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error("[CSV MERGE] " + error.message);
    process.exitCode = 1;
  });
}
