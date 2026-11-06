import test from "node:test";
import assert from "node:assert/strict";
import { selectBackfillPaths } from "../scripts/select-flashscore-backfill-paths.mjs";
const paths = ["/futebol/portugal/liga-portugal-betclic/","/futebol/portugal/liga-portugal-2/","/futebol/brasil/serie-a/","/futebol/brasil/serie-b/","/futebol/africa/caf-liga-dos-campeoes/"];
const catalog = {competitions: paths.map(path => ({url:"https://www.flashscore.pt"+path}))};
const selection = {selected_paths:paths};
const statusReport = {status_by_path:{
 [paths[0]]:{status:"complete"},[paths[1]]:{status:"partial"},[paths[2]]:{status:"new"},[paths[3]]:{status:"partial"},[paths[4]]:{status:"new"}
}};
test("filtra por país e limita lote",()=>{
 const r=selectBackfillPaths({catalog,selection,statusReport,countrySlug:"brasil",limit:1});
 assert.deepEqual(r.paths,[paths[2]]); assert.equal(r.summary.morePending,true);
});
test("cursor exclusivo mantém retoma estável",()=>{
 const r=selectBackfillPaths({catalog,selection,statusReport,resumeAfterPath:paths[2],limit:10});
 assert.deepEqual(r.paths,[paths[3],paths[4]]);
});
test("ignora completas e impõe máximo de 25",()=>{
 const r=selectBackfillPaths({catalog,selection,statusReport,limit:25});
 assert.equal(r.paths.includes(paths[0]),false); assert.equal(r.paths.length,4);
 assert.throws(()=>selectBackfillPaths({catalog,selection,statusReport,limit:26}),/entre 1 e 25/);
});
test("deteta seleção que já não existe no catálogo",()=>{
 assert.throws(()=>selectBackfillPaths({catalog:{competitions:[]},selection,statusReport,limit:10}),/já não constam do catálogo/);
});
test("rejeita caminho inválido",()=>{
 assert.throws(()=>selectBackfillPaths({catalog,selection,statusReport,resumeAfterPath:"/football/lithuania/i-lyga/",limit:10}),/Caminho inválido/);
});
