#!/usr/bin/env node
import fs from "node:fs";
export function splitSeasonManifest(manifest, chunkSize = 10) {
  const size = Number(chunkSize);
  if (!Number.isInteger(size) || size < 1 || size > 50) throw new Error("O tamanho do bloco deve estar entre 1 e 50 jogos.");
  if (!Array.isArray(manifest?.fixtures)) throw new Error("Manifesto de época inválido: fixtures em falta.");
  const pending = manifest.fixtures.filter(f => f?.stats_status !== "already_complete" && /^[A-Za-z0-9]{6,16}$/.test(String(f?.match_id || "")));
  const chunks = [];
  for (let i = 0; i < pending.length; i += size) chunks.push({...manifest, fixtures:pending.slice(i,i+size),chunk_index:chunks.length+1,chunk_total:Math.ceil(pending.length/size)});
  return chunks;
}
function main() {
  const manifestPath=process.argv.find(a=>a.startsWith("--manifest="))?.slice(11);
  const outDir=process.argv.find(a=>a.startsWith("--out-dir="))?.slice(10)||"/tmp/flashscore-season-chunks";
  const size=process.argv.find(a=>a.startsWith("--chunk-size="))?.slice(13)||"10";
  if(!manifestPath) throw new Error("Indica --manifest=ficheiro.json.");
  const chunks=splitSeasonManifest(JSON.parse(fs.readFileSync(manifestPath,"utf8")),size);
  fs.mkdirSync(outDir,{recursive:true});
  chunks.forEach((chunk,index)=>fs.writeFileSync(outDir+"/chunk-"+String(index+1).padStart(4,"0")+".json",JSON.stringify(chunk,null,2)+"\n"));
  console.log("[SEASON CHUNKS] "+chunks.length+" blocos de até "+size+" jogos; "+chunks.reduce((n,c)=>n+c.fixtures.length,0)+" jogos pendentes; diretório="+outDir);
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],"file:").href){try{main();}catch(error){console.error("[SEASON CHUNKS ERROR] "+error.message);process.exitCode=1;}}
