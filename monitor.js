const OWNER = "markyto34";
const REPO = "simuladorfutebol";
const WORKFLOW = "recolha-diaria-flashscore.yml";
const API = "https://api.github.com/repos/" + OWNER + "/" + REPO;
const PROGRESS_URL = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/collection-progress/monitor/collection-progress.json";
const CONTROL_URL = "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev/trigger-collection";
const $ = id => document.getElementById(id);
let activeRun = null;
const labels = {
  "queued":"Na fila","in_progress":"Em execução","completed":"Concluída",
  "success":"Sucesso","failure":"Falhou","cancelled":"Cancelada","skipped":"Ignorada",
  "Set up job":"Preparar ambiente","Checkout histórico":"Carregar histórico CSV",
  "Preparar Node":"Preparar Node.js","Determinar data de recolha (Portugal)":"Determinar data dos jogos",
  "Verificar scripts":"Verificar scripts","Descobrir jogos e recolher estatísticas + odds Bwin":"Descobrir jogos e recolher dados",
  "Validar histórico CSV":"Validar ficheiros CSV","Guardar novos registos sem substituir histórico":"Guardar novos registos",
  "Assinalar falha de recolha":"Finalizar recolha"
};
function label(value){return labels[value]||value||"—"}
function dateLabel(value){if(!value)return"—";return new Intl.DateTimeFormat("pt-PT",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Lisbon"}).format(new Date(value))}
function relative(value){if(!value)return"—";const mins=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/60000));return mins<1?"há instantes":mins===1?"há 1 minuto":"há "+mins+" minutos"}
function statusClass(run){if(run.status!=="completed")return run.status==="queued"?"queued":"running";return run.conclusion==="success"?"success":"failure"}
function percent(steps){if(!steps?.length)return 0;const done=steps.filter(s=>s.status==="completed").length;const active=steps.some(s=>s.status==="in_progress")?0.5:0;return Math.round((done+active)/steps.length*100)}
function setStatus(text,kind){$("run-status").textContent=text;$("run-status").className="status-pill status-"+kind}
function phaseLabel(value){return({discovery:"A descobrir jogos",collecting:"A recolher jogos",completed:"Recolha concluída",stopped:"Recolha interrompida",failed:"Falha na recolha"})[value]||value||"A aguardar"}
async function refreshGameProgress(run){
  try{
    const response=await fetch(PROGRESS_URL+"?t="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw new Error("Ainda sem canal de progresso publicado.");
    const progress=await response.json();
    if(String(progress.run_id)!==String(run.id)){
      $("progress-updated").textContent="A aguardar dados detalhados desta execução.";
      return;
    }
    $("games-progress").textContent=(progress.processed_games||0)+" / "+(progress.total_games||0);
    $("stats-progress").textContent=progress.stats_games??0;
    $("bwin-progress").textContent=progress.bwin_odds??0;
    $("errors-progress").textContent=progress.failed_games??0;
    const current=progress.current_match?" · "+progress.current_match:"";
    $("progress-updated").textContent=phaseLabel(progress.phase)+" · Atualizado "+dateLabel(progress.updated_at)+current;
  }catch(error){
    $("progress-updated").textContent="Contadores detalhados disponíveis quando o coletor publicar o primeiro estado.";
  }
}
function renderSteps(steps){
  const list=$("steps-list");list.replaceChildren();
  if(!steps?.length){list.innerHTML='<li class="empty-state">O GitHub ainda não disponibilizou as etapas desta execução.</li>';return}
  for(const step of steps){
    const state=step.status==="completed"?(step.conclusion==="success"?"completed":"failed"):step.status==="in_progress"?"in_progress":"pending";
    const li=document.createElement("li");li.className="step "+state;
    const icon=document.createElement("span");icon.className="step-icon";icon.textContent=state==="completed"?"✓":state==="in_progress"?"↻":"·";
    const name=document.createElement("span");name.className="step-name";name.textContent=label(step.name);
    const status=document.createElement("span");status.className="step-status";status.textContent=step.status==="completed"?label(step.conclusion):label(step.status);
    li.append(icon,name,status);list.append(li);
  }
}
async function refresh(){
  $("refresh-indicator").classList.add("loading");$("refresh-label").textContent="A atualizar…";
  try{
    const headers={"Accept":"application/vnd.github+json"};
    const response=await fetch(API+"/actions/workflows/"+WORKFLOW+"/runs?per_page=1",{headers,cache:"no-store"});
    if(!response.ok)throw new Error("GitHub API respondeu HTTP "+response.status);
    const data=await response.json();const run=data.workflow_runs?.[0];
    if(!run)throw new Error("Ainda não existem execuções deste workflow.");
    const jobResponse=await fetch(API+"/actions/runs/"+run.id+"/jobs?per_page=20",{headers,cache:"no-store"});
    if(!jobResponse.ok)throw new Error("Não foi possível ler as etapas da execução.");
    const jobsData=await jobResponse.json();const jobs=jobsData.jobs||[];
    const job=jobs[0];const steps=job?.steps||[];
    const current=steps.find(s=>s.status==="in_progress")||[...steps].reverse().find(s=>s.status==="completed");
    activeRun=run;
    updateManualControl(run);
    const kind=statusClass(run);
    $("run-title").textContent="Recolha diária · "+(run.display_title||"Execução "+run.run_number);
    setStatus(label(run.status==="completed"?run.conclusion:run.status),kind);
    $("target-date").textContent=run.display_title?.match(/\d{4}-\d{2}-\d{2}/)?.[0]||(run.display_title?.includes("ontem")?"Ontem (Portugal)":"A confirmar");
    $("run-number").textContent="#"+run.run_number;
    $("run-event").textContent=run.event==="schedule"?"Agendada automaticamente":"Iniciada manualmente";
    $("current-stage").textContent=current?label(current.name):label(run.status);
    $("job-name").textContent=job?.name||"GitHub Actions";
    $("updated-at").textContent=dateLabel(run.updated_at);
    $("elapsed").textContent=relative(run.updated_at);
    $("run-id").textContent="RUN ID · "+run.id;
    $("github-run-link").href=run.html_url;
    $("job-logs-link").href=job?.html_url||run.html_url;
    $("job-logs-link").textContent=job?"Ver logs jogo a jogo ↗":"Ver execução no GitHub ↗";
    const pct=percent(steps);$("progress-fill").style.width=pct+"%";
    $("progress-label").textContent=run.status==="completed"?(run.conclusion==="success"?"Execução concluída":"Execução terminada com falhas"):"Etapas concluídas no workflow";
    $("progress-percent").textContent=pct+"%";
    $("live-dot").classList.toggle("paused",run.status==="completed");
    renderSteps(steps);
    await refreshGameProgress(run);
    $("refresh-label").textContent="Atualizado "+new Intl.DateTimeFormat("pt-PT",{timeStyle:"short",timeZone:"Europe/Lisbon"}).format(new Date());
    $("refresh-indicator").classList.remove("loading");
  }catch(error){
    $("refresh-label").textContent="Sem ligação ao estado do workflow";
    $("refresh-indicator").classList.remove("loading");
    setStatus("Sem dados","loading");
    $("steps-list").innerHTML='<li class="empty-state"></li>';$("steps-list").firstChild.textContent=error.message;
    $("current-stage").textContent="Indisponível";
  }
}
refresh();setInterval(refresh,180000);setInterval(()=>{if(activeRun)refreshGameProgress(activeRun)},30000);


function portugalToday(){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return values.year+"-"+values.month+"-"+values.day;
}
function updateManualControl(run){
  const busy=Boolean(run&&(run.status==="queued"||run.status==="in_progress"));
  const button=$("start-collection");
  const date=$("manual-date");
  if(!button||!date)return;
  button.disabled=busy;
  date.disabled=busy;
  button.textContent=busy?"Recolha em curso…":"Iniciar recolha →";
  if(busy)$("manual-feedback").textContent="Já existe uma execução na fila ou em curso. Aguarda que termine antes de iniciar outra.";
  else if(!$("manual-feedback").dataset.state)$("manual-feedback").textContent="Escolhe uma data e confirma o início da recolha.";
}
async function startManualCollection(){
  const button=$("start-collection"), date=$("manual-date"), feedback=$("manual-feedback");
  const selectedDate=date.value;
  if(!selectedDate){feedback.textContent="Seleciona primeiro a data dos jogos.";return;}
  if(selectedDate>portugalToday()){feedback.textContent="Não é possível recolher jogos de uma data futura.";return;}
  if(!window.confirm("Iniciar a recolha Flashscore + odds Bwin para "+selectedDate+"? A execução pode demorar bastante tempo."))return;
  button.disabled=true;date.disabled=true;button.textContent="A iniciar…";feedback.dataset.state="pending";
  feedback.textContent="A validar o pedido e a verificar se já existe outra recolha…";
  try{
    const response=await fetch(CONTROL_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({target_date:selectedDate})});
    const payload=await response.json().catch(()=>({}));
    if(response.status===409)throw new Error(payload.message||"Já existe uma recolha na fila ou em execução.");
    if(!response.ok)throw new Error(payload.message||payload.error||"Não foi possível iniciar a recolha (HTTP "+response.status+").");
    feedback.textContent="Pedido aceite pelo GitHub. A execução deverá aparecer no monitor dentro de alguns segundos.";
    feedback.dataset.state="accepted";
    setTimeout(refresh,5000);
  }catch(error){
    feedback.textContent=error.message+" Se o controlo ainda não estiver configurado, será necessário concluir a configuração segura no Cloudflare.";
    feedback.dataset.state="error";
    button.disabled=false;date.disabled=false;button.textContent="Tentar novamente →";
  }
}
document.addEventListener("DOMContentLoaded",()=>{
  const date=$("manual-date");
  if(date){date.value=portugalToday();date.max=portugalToday();}
  $("start-collection")?.addEventListener("click",startManualCollection);
});
