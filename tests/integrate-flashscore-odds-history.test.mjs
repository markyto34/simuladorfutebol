import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/integrate-flashscore-odds-history.mjs");
const baseHeaders = ["date_time","COUNTRY","LEAGUE","TEAM_HOME","TEAM_AWAY","odd_ft_1","odd_ft_x","odd_ft_2","score_fh_home","score_fh_away","score_sh_home","score_sh_away","score_ft_home","score_ft_away","score_final_home","score_final_away"];
const csv = (headers, rows) => [headers.join(","), ...rows.map(row => headers.map(key => {
  const value = String(row[key] ?? "");
  return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}).join(","))].join("\n") + "\n";

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "odds-history-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, "data"));
  const old = Object.fromEntries(baseHeaders.map(h => [h, ""]));
  Object.assign(old, { date_time: "2026-10-30T18:00", TEAM_HOME: "Old FC", TEAM_AWAY: "Old Town", odd_ft_1: "2.1", odd_ft_x: "3.2", odd_ft_2: "3.4", score_ft_home: "1", score_ft_away: "0" });
  await writeFile(path.join(dir, "ganhonasodds_com_20261101.csv"), csv(baseHeaders, [old]));
  const oddsHeaders = ["match_id","date_time","country","competition","home_team","away_team","bookmaker","market","odd_1","odd_x","odd_2"];
  const odds = [
    { match_id:"new-1", date_time:"2026-11-01T14:30", home_team:"Union Berlin", away_team:"FC Köln", bookmaker:"Bwin", market:"1X2", odd_1:"2.55", odd_x:"3.4", odd_2:"2.5" },
    { match_id:"old-1", date_time:"2026-10-30T18:00", home_team:"Old FC", away_team:"Old Town", bookmaker:"Bwin", market:"1X2", odd_1:"2.2", odd_x:"3.3", odd_2:"3.5" },
    { match_id:"bad-1", date_time:"2026-11-01T16:00", home_team:"Bad FC", away_team:"No Odds", bookmaker:"Bwin", market:"1X2", odd_1:"1.8", odd_x:"", odd_2:"4.2" }
  ];
  await writeFile(path.join(dir, "data/bwin-odds-flashscore.csv"), csv(oddsHeaders, odds));
  const statsHeaders = ["match_id","date_time","country","competition","home_team","away_team","score_home","score_away"];
  await writeFile(path.join(dir, "data/flashscore-statistics.csv"), csv(statsHeaders, [
    { match_id:"new-1", date_time:"2026-11-01T14:30", home_team:"Union Berlin", away_team:"FC Köln", score_home:"1", score_away:"1" },
    { match_id:"old-1", date_time:"2026-10-30T18:00", home_team:"Old FC", away_team:"Old Town", score_home:"2", score_away:"1" }
  ]));
  return dir;
}

test("integra jogos Bwin 1X2, preserva histórico, preenche FT e não duplica", async t => {
  const dir = await fixture(t);
  const run = () => spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Novos jogos acrescentados: 1/);
  assert.match(first.stdout, /jogos com resultados FT completados: 1/);
  const contents = await readFile(path.join(dir, "ganhonasodds_com_20261101.csv"), "utf8");
  const lines = contents.trim().split("\n");
  assert.equal(lines.length, 3); // cabeçalho + histórico antigo + jogo novo
  assert.match(contents, /Union Berlin,FC Köln,2.55,3.4,2.5/);
  assert.match(contents, /2026-10-30T18:00.*Old FC,Old Town,2.1,3.2,3.4/);
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Novos jogos acrescentados: 0/);
  const after = await readFile(path.join(dir, "ganhonasodds_com_20261101.csv"), "utf8");
  assert.equal(after, contents);
});

test("preenche apenas resultados FT em falta num jogo já existente", async t => {
  const dir = await fixture(t);
  const file = path.join(dir, "ganhonasodds_com_20261101.csv");
  const original = await readFile(file, "utf8");
  const [headerLine, dataLine] = original.trim().split("\n");
  const headers = headerLine.split(",");
  const cells = dataLine.split(",");
  for (const field of ["score_ft_home","score_ft_away","score_final_home","score_final_away"]) cells[headers.indexOf(field)] = "";
  const withExistingMatch = headerLine + "\n" + cells.join(",") + "\n";
  await writeFile(file, withExistingMatch);
  const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /jogos com resultados FT completados: 1/);
  const result = await readFile(file, "utf8");
  assert.match(result, /Old FC,Old Town,2.1,3.2,3.4,,,,,2,1,2,1/);
});


test("completa apenas odds em falta e preserva odds históricas existentes", async t => {
  const dir = await fixture(t);
  const file = path.join(dir, "ganhonasodds_com_20261101.csv");
  const original = await readFile(file, "utf8");
  const [headerLine, dataLine] = original.trim().split("\n");
  const headers = headerLine.split(",");
  const cells = dataLine.split(",");
  cells[headers.indexOf("odd_ft_x")] = "";
  await writeFile(file, headerLine + "\n" + cells.join(",") + "\n");
  const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /campos de odds preenchidos: 1/);
  const result = await readFile(file, "utf8");
  assert.match(result, /Old FC,Old Town,2.1,3.3,3.4/);
});


test("não escolhe arbitrariamente entre jogos da mesma data e equipas em competições diferentes", async t => {
  const dir = await fixture(t);
  const file = path.join(dir, "ganhonasodds_com_20261101.csv");
  const original = await readFile(file, "utf8");
  const [headerLine, dataLine] = original.trim().split("\n");
  const headers = headerLine.split(",");
  const cells = dataLine.split(",");
  const duplicate = [...cells];
  duplicate[headers.indexOf("COUNTRY")] = "Portugal";
  duplicate[headers.indexOf("LEAGUE")] = "Taça";
  await writeFile(file, headerLine + "\n" + dataLine + "\n" + duplicate.join(",") + "\n");
  const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /correspondências ambíguas: 1/);
  assert.match(run.stdout, /Novos jogos acrescentados: 1/);
  const result = await readFile(file, "utf8");
  const lines = result.trim().split("\n");
  assert.equal(lines.length, 4); // cabeçalho + duas linhas históricas + apenas o jogo novo
  assert.equal(lines.filter(line => line.includes("Old FC,Old Town")).length, 2);
});


test("completa país e competição em falta sem substituir metadados existentes", async t => {
  const dir = await fixture(t);
  const file = path.join(dir, "ganhonasodds_com_20261101.csv");
  const original = await readFile(file, "utf8");
  const [headerLine, dataLine] = original.trim().split("\n");
  const headers = headerLine.split(",");
  const cells = dataLine.split(",");
  cells[headers.indexOf("COUNTRY")] = "";
  cells[headers.indexOf("LEAGUE")] = "";
  await writeFile(file, headerLine + "\n" + cells.join(",") + "\n");
  const oddsFile = path.join(dir, "data/bwin-odds-flashscore.csv");
  const oddsText = await readFile(oddsFile, "utf8");
  const oddsLines = oddsText.trim().split("\n");
  // Remove a observação Bwin do jogo antigo: o metadado deve ser recuperado
  // diretamente das estatísticas Flashscore, mesmo sem odds para esse jogo.
  oddsLines.splice(2, 1);
  await writeFile(oddsFile, oddsLines.join("\n") + "\n");
  const statsFile = path.join(dir, "data/flashscore-statistics.csv");
  const statsText = await readFile(statsFile, "utf8");
  const statsLines = statsText.trim().split("\n");
  const statsHeaders = statsLines[0].split(",");
  const statCells = statsLines[2].split(",");
  statCells[statsHeaders.indexOf("country")] = "Portugal";
  statCells[statsHeaders.indexOf("competition")] = "Primeira Liga";
  statsLines[2] = statCells.join(",");
  await writeFile(statsFile, statsLines.join("\n") + "\n");
  const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /campos de país\/competição preenchidos: 2/);
  const result = await readFile(file, "utf8");
  assert.match(result, /2026-10-30T18:00,Portugal,Primeira Liga,Old FC,Old Town/);
});
