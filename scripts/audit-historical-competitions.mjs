#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv, normalize } from "./audit-flashscore-odds-matches.mjs";

const BASE = "ganhonasodds_com_20261101.csv";
const COUNTRY_ALIASES = {
  "inglaterra":"england","espanha":"spain","alemanha":"germany","italia":"italy",
  "franca":"france","paises baixos":"netherlands","holanda":"netherlands",
  "belgica":"belgium","escocia":"scotland","portugal":"portugal","brasil":"brazil",
  "estados unidos":"united states","eua":"united states","turquia":"turkey",
  "dinamarca":"denmark","noruega":"norway","suecia":"sweden","suica":"switzerland",
  "polonia":"poland","chequia":"czech republic","eslovaquia":"slovakia",
  "russia":"russia","romenia":"romania","servia":"serbia","eslovenia":"slovenia",
  "ucrania":"ukraine","irlanda":"ireland","pais de gales":"wales","mexico":"mexico",
  "argentina":"argentina","japao":"japan","australia":"australia","china":"china","eua":"united states","estados unidos":"united states","coreia do sul":"south korea","arabia saudita":"saudi arabia","africa do sul":"south africa","israel":"israel","bulgaria":"bulgaria","marrocos":"morocco","argelia":"algeria","tailandia":"thailand","egipto":"egypt","nova zelandia":"new zealand","mocambique":"mozambique","peru":"peru","uruguai":"uruguay","venezuela":"venezuela","vietname":"vietnam","letonia":"latvia","ruanda":"rwanda","uzbequistao":"uzbekistan","trindade e tobago":"trinidad and tobago",
  "finlandia":"finland","cazaquistao":"kazakhstan","grecia":"greece","austria":"austria",
  "chipre":"cyprus","croacia":"croatia"
};
const COMP_ALIASES = {
  "liga portugal":"primeira liga","primeira liga":"primeira liga","liga portugal bwin":"primeira liga",
  "la liga":"la liga","laliga":"la liga","primera division":"la liga",
  "championship":"championship","efl championship":"championship",
  "league one":"league one","efl league one":"league one",
  "league two":"league two","efl league two":"league two",
  "serie a":"serie a","brasileirao serie a":"serie a","serie b":"serie b",
  "bundesliga":"bundesliga","2 bundesliga":"2 bundesliga","2 bundesliga":"2 bundesliga",
  "ligue 1":"ligue 1","ligue 2":"ligue 2","eredivisie":"eredivisie",
  "eerste divisie":"eerste divisie","premier league":"premier league",
  "premiership":"premiership","scottish premiership":"premiership","scottish championship":"championship",
  "super lig":"super lig","superliga":"superliga","danish superliga":"superliga",
  "first division a":"first division a","pro league":"first division a","belgian pro league":"first division a",
  "champions league":"champions league","uefa champions league":"champions league",
  "europa league":"europa league","conference league":"conference league"
};
const PAIR_ALIASES = {
  "argentina|primeira liga nacional":"argentina|primera nacional",
  "england|liga 1":"england|league one",
  "united states|mls":"united states|major league soccer",
  "spain|laliga2":"spain|segunda division",
  "spain|liga 2":"spain|segunda division",
  "netherlands|primeira divisao":"netherlands|eredivisie",
  "japan|liga j1":"japan|j1 league",
  "japan|liga j2":"japan|j2 league",
  "france|liga 1":"france|ligue 1",
  "france|liga2":"france|ligue 2",
  "poland|primeira liga":"poland|ekstraklasa",
  "poland|liga 1":"poland|i liga",
  "norway|liga de elite":"norway|eliteserien",
  "england|campeonato":"england|championship",
  "brazil|serie a betano":"brazil|serie a",
  "norway|segunda liga":"norway|1 division",
  "belgium|primeira liga":"belgium|first division a"
};
const key = (country, competition) => {
  const c = normalize(country), l = normalize(competition);
  const countryKey = COUNTRY_ALIASES[c] || c;
  return PAIR_ALIASES[countryKey + "|" + l] || countryKey + "|" + (COMP_ALIASES[l] || l);
};
const base = parseCsv(await readFile(BASE, "utf8"));
if (!base.length) throw new Error("CSV histórico vazio.");
const indexHtml = await readFile("index.html", "utf8");
const appJs = await readFile("app.js", "utf8");
const catalog = JSON.parse(await readFile("data/windrawwin-leagues.json", "utf8"));
const options = [...indexHtml.matchAll(/<option\s+value="([^"]+)"[^>]*>([^<]+)<\/option>/g)]
  .map(m => ({id:m[1], label:m[2].trim()}));
const selectorKeys = new Set(options.map(o => key(o.label.split("—")[0].trim(), o.label.split("—").slice(1).join("—").trim())));
const wdwKeys = new Set(catalog.competitions.map(c => key(c.country,c.name)));
const wdwIds = new Set([...appJs.matchAll(/"([A-Z0-9_]+)"\s*:/g)].map(m=>m[1]));
const comps = new Map(), fixtureSet = new Set();
for (const row of base) {
  const date = String(row.date_time||"").slice(0,10);
  const country = String(row.COUNTRY||"").trim();
  const competition = String(row.LEAGUE||"").trim();
  const home = normalize(row.TEAM_HOME), away = normalize(row.TEAM_AWAY);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!country||!competition||!home||!away) continue;
  const compKey = key(country,competition);
  const fixture = [date,normalize(country),normalize(competition),home,away].join("|");
  const item = comps.get(compKey)||{country,competition,observations:0,unique_games:0,teams:new Set(),variants:new Set()};
  item.observations++;
  item.teams.add(String(row.TEAM_HOME).trim()); item.teams.add(String(row.TEAM_AWAY).trim());
  item.variants.add(competition);
  if(!fixtureSet.has(fixture)){fixtureSet.add(fixture);item.unique_games++;}
  comps.set(compKey,item);
}
const rows=[...comps.entries()].map(([compKey,x])=>{
  const inSelector=selectorKeys.has(compKey);
  const inCatalog=wdwKeys.has(compKey);
  return {country:x.country,competition:x.competition,unique_games:x.unique_games,observations:x.observations,teams:x.teams.size,
    selector_status:inSelector?"already_in_selector":inCatalog?"catalogued_not_in_selector":"not_catalogued",
    catalog_status:inCatalog?"catalogued":"not_catalogued",normalized_key:compKey};
}).sort((a,b)=>b.unique_games-a.unique_games||a.country.localeCompare(b.country)||a.competition.localeCompare(b.competition));
const summary={
 generated_at:new Date().toISOString(),source_file:BASE,source_records:base.length,
 unique_competitions:rows.length,unique_fixtures:fixtureSet.size,
 already_in_selector:rows.filter(x=>x.selector_status==="already_in_selector").length,
 catalogued_not_in_selector:rows.filter(x=>x.selector_status==="catalogued_not_in_selector").length,
 not_catalogued:rows.filter(x=>x.selector_status==="not_catalogued").length,
 competitions:rows
};
await writeFile("historical-competition-audit.json",JSON.stringify(summary,null,2)+"\n");
const csv=["country,competition,unique_games,observations,teams,selector_status,catalog_status",
 ...rows.map(x=>[x.country,x.competition,x.unique_games,x.observations,x.teams,x.selector_status,x.catalog_status].map(v=>/[",\r\n]/.test(String(v))?'"'+String(v).replace(/"/g,'""')+'"':String(v)).join(","))].join("\n")+"\n";
await writeFile("historical-competition-audit.csv",csv);
console.log(JSON.stringify({source_records:summary.source_records,unique_fixtures:summary.unique_fixtures,unique_competitions:summary.unique_competitions,already_in_selector:summary.already_in_selector,catalogued_not_in_selector:summary.catalogued_not_in_selector,not_catalogued:summary.not_catalogued,top_missing:rows.filter(x=>x.selector_status!=="already_in_selector").slice(0,35)},null,2));
