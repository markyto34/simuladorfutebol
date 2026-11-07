const OWNER="markyto34";
const REPO="simuladorfutebol";
const API="https://api.github.com/repos/"+OWNER+"/"+REPO;
const WORKFLOW="backfill-flashscore-season.yml";
const PROGRESS_URL="https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/collection-progress/monitor/season-backfill-progress.json";
const CHECKPOINT_URL="https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/main/data/flashscore-season-backfill-checkpoint.json";
const $=id=>document.getElementById(id);
let latestRun=null;
const labels={queued:"Na fila",in_progress:"Em execução",completed:"Concluída",success:"Sucesso",failure:"Falhou",cancelled:"Cancelada",skipped:"Ignorada",discovery:"A descobrir jogos",collecting:"A recolher jogos",saving:"A validar e publicar",completed_with_errors:"Concluída com erros",blocked:"Interrompida por proteção Flashscore",failed:"Falhou"};
const nice=value=>labels[value]||value||"—";
const dateLabel=value=>value?new Intl.DateTimeFormat("pt-PT",{dateStyle:"short",timeStyle:"medium",timeZone:"Europe/Lisbon"}).format(new Date(value)):"—";
function setStatus(value,kind){$("run-status").textContent=nice(value);$("run-status").className="status-pill status-"+kind}
function slugLabel(path){if(!path)return"—";const parts=path.split("/").filter(Boolean);return parts.slice(-2).map(part=>part.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase())).join(" · ")}
function statusKind(run){if(run.status==="queued"||run.status==="waiting")return"queued";if(run.status!=="completed")return"running";return run.conclusion==="success"?"success":"failure"}
function renderCompetitions(progress,checkpoint){
 const list=$("competitions-list");list.replaceChildren();
 const selected=Array.isArray(progress?.selected_competitions)?progress.selected_competitions:[];
 if(!selected.length){const li=document.createElement("li");li.className="empty-state";li.textContent="A lista das competições aparece assim que o workflow iniciar a seleção.";list.append(li);return}
 const done=new Set(Array.isArray(checkpoint?.completed_paths)?checkpoint.completed_paths:[]);
 const current=progress.current_competition_path||"";
 const failed=new Set(Array.isArray(progress.failed_competitions)?progress.failed_competitions:[]);
 selected.forEach((path,index)=>{
  const li=document.createElement("li");li.className="competition-item";
  const number=document.createElement("span");number.className="competition-number";number.textContent=String(index+1).padStart(2,"0");
  const nameWrap=document.createElement("div");const name=document.createElement("span");name.className="competition-name";name.textContent=slugLabel(path);
  const raw=document.createElement("small");raw.className="competition-path";raw.textContent=path;nameWrap.append(name,raw);
  const state=document.createElement("span");state.className="competition-state";
  if(done.has(path)){li.classList.add("done");state.textContent="✓ Concluída e guardada"}
  else if(failed.has(path)){li.classList.add("failed");state.textContent="Falhou · continua pendente"}
  else if(path===current){li.classList.add("active");state.textContent=nice(progress.phase)}
  else{state.textContent=index+1>(Number(progress.competition_index)||0)?"Por iniciar":"Pendente"}
  li.append(number,nameWrap,state);list.append(li);
 });
}
async function fetchJson(url){const r=await fetch(url+"?t="+Date.now(),{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}
let cachedProgress=null,cachedCheckpoint=null,cachedRun=null;
let nextApiPollAt=0,lastApiMessage="",lastRawSuccess=0;
const API_POLL_MS=120000;
const API_RETRY_LIMIT_MS=300000;
async function refresh(){
 $("refresh-indicator").classList.add("loading");
 try{
  const rawResults=await Promise.allSettled([fetchJson(PROGRESS_URL),fetchJson(CHECKPOINT_URL)]);
  if(rawResults[0].status==="fulfilled"){cachedProgress=rawResults[0].value;lastRawSuccess=Date.now();}
  if(rawResults[1].status==="fulfilled")cachedCheckpoint=rawResults[1].value;

  if(Date.now()>=nextApiPollAt){
   try{
    const response=await fetch(API+"/actions/workflows/"+WORKFLOW+"/runs?per_page=1",{headers:{Accept:"application/vnd.github+json"},cache:"no-store"});
    if(!response.ok){
     const err=new Error("HTTP "+response.status);
     err.status=response.status;
     throw err;
    }
    const data=await response.json();
    cachedRun=data.workflow_runs?.[0]||null;
    lastApiMessage="";
    nextApiPollAt=Date.now()+API_POLL_MS;
   }catch(error){
    const limited=error.status===403||error.status===429;
    lastApiMessage=limited
      ?"API do GitHub temporariamente limitada ("+error.message+"); a manter último estado."
      :"Não foi possível atualizar o estado do GitHub ("+(error.message||"erro de ligação")+"); a manter último estado.";
    nextApiPollAt=Date.now()+(limited?API_RETRY_LIMIT_MS:API_POLL_MS);
   }
  }

  const progress=cachedProgress,checkpoint=cachedCheckpoint,run=cachedRun;
  if(run){
   $("run-title").textContent="Backfill da época · Execução #"+run.run_number;
   setStatus(run.status==="completed"?run.conclusion:run.status,statusKind(run));
   $("github-run-link").href=run.html_url;
   $("run-id").textContent="RUN ID · "+run.id+" · Atualizado "+dateLabel(run.updated_at);
   $("live-dot").classList.toggle("paused",run.status==="completed");
  }else if(progress?.run_number){
   $("run-title").textContent="Backfill da época · Execução #"+progress.run_number;
   if(progress.status==="running")setStatus("in_progress","running");
   $("run-id").textContent="RUN ID · "+(progress.run_id||"—");
  }

  const matching=Boolean(progress&&progress.collection_type==="season_backfill"&&(!run||String(progress.run_id)===String(run.id)));
  if(matching){
   const total=Number(progress.total_competitions)||0;
   const completed=Number(progress.competitions_completed)||0;
   const failed=Number(progress.competitions_failed)||0;
   const idx=Number(progress.competition_index)||0;
   $("completed-count").textContent=completed+" / "+(total||"—");
   $("batch-count").textContent=failed+" falhas · "+(progress.blocked?"bloqueio detetado":"sem bloqueio reportado");
   $("current-competition").textContent=slugLabel(progress.current_competition_path);
   $("competition-position").textContent=idx&&total?"Competição "+idx+" de "+total:nice(progress.phase);
   const processed=Number(progress.processed_games)||0,totalGames=Number(progress.total_games)||0;
   $("games-progress").textContent=processed+" / "+(totalGames||"—");
   $("games-detail").textContent="Nesta competição";
   $("errors-progress").textContent=failed+" / "+(Number(progress.failed_games)||0)+" jogos";
   $("last-update").textContent="Atualizado "+dateLabel(progress.updated_at);
   $("stats-progress").textContent=String(progress.stats_games??0);
   $("bwin-progress").textContent=String(progress.bwin_odds??0);
   $("current-match").textContent=progress.current_match||"—";
   $("last-result").textContent=progress.last_result||"—";
   const pct=totalGames?Math.min(100,Math.round(processed/totalGames*100)):0;
   $("progress-fill").style.width=pct+"%";
   $("progress-label").textContent=nice(progress.phase)+" · progresso da competição atual";
   $("progress-percent").textContent=totalGames?pct+"%":"—";
   renderCompetitions(progress,checkpoint);
  }else{
   $("completed-count").textContent=String(checkpoint?.completed_paths?.length??"—");
   $("batch-count").textContent="A aguardar progresso detalhado";
   $("current-competition").textContent="A aguardar";
   $("competition-position").textContent="Estado básico do GitHub";
   $("games-progress").textContent="—";$("games-detail").textContent="Contador detalhado indisponível";
   $("errors-progress").textContent="—";
   $("stats-progress").textContent="—";$("bwin-progress").textContent="—";
   $("current-match").textContent="Ainda não foi publicado progresso detalhado desta execução.";
   $("last-result").textContent="—";$("progress-fill").style.width="0%";
   $("progress-label").textContent="A aguardar publicação do coletor";$("progress-percent").textContent="—";
   renderCompetitions(null,checkpoint);
  }
  $("checkpoint-label").textContent="Checkpoint: "+(checkpoint?.completed_paths?.length??"—")+" competições concluídas no histórico";
  if(lastApiMessage){
   $("refresh-label").textContent=lastApiMessage;
  }else if(rawResults.every(x=>x.status==="fulfilled")){
   $("refresh-label").textContent="Atualizado "+new Intl.DateTimeFormat("pt-PT",{timeStyle:"medium",timeZone:"Europe/Lisbon"}).format(new Date());
  }else{
   $("refresh-label").textContent="GitHub acessível; progresso temporariamente indisponível. A manter último estado.";
  }
 }catch(error){
  $("refresh-label").textContent="Falha ao atualizar o monitor: "+(error.message||"erro desconhecido")+". A manter último estado.";
 }
 $("refresh-indicator").classList.remove("loading");
}
refresh();setInterval(refresh,10000);
