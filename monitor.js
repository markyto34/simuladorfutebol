const API = "https://simuladorfutebol-flashscore-proxy.marcolourenco2024.workers.dev";
const byId = id => document.getElementById(id);
const fmt = value => Number(value || 0).toLocaleString("pt-PT");
function pill(id, label, kind="neutral"){const el=byId(id);el.textContent=label;el.className="pill "+kind;}
function render(snapshot){
  const total=Number(snapshot.total||0),processed=Number(snapshot.processed||0);
  const pct=total?Math.min(100,Math.round(processed/total*100)):0;
  byId("status").textContent=({idle:"À espera de uma recolha",running:"O bot está a recolher dados",completed:"Recolha concluída",partial:"Recolha terminada com ocorrências",failed:"Recolha falhou"})[snapshot.status]||"Estado desconhecido";
  const stateKind=snapshot.status==="running"?"warn":snapshot.status==="completed"?"good":snapshot.status==="partial"||snapshot.status==="failed"?"bad":"neutral";
  pill("status-pill",snapshot.status==="running"?"Em execução":snapshot.status==="completed"?"Concluída":snapshot.status==="partial"?"Com ocorrências":snapshot.status==="failed"?"Falhou":"A aguardar",stateKind);
  byId("progress-count").textContent=fmt(processed)+" / "+fmt(total);
  byId("progress-percent").textContent=pct+"%";
  byId("progress-bar").style.width=pct+"%";
  byId("collection-date").textContent="Data: "+(snapshot.date||"—");
  byId("last-updated").textContent="Atualizado: "+(snapshot.updated_at?new Date(snapshot.updated_at).toLocaleString("pt-PT"):"—");
  const current=snapshot.current_match;
  byId("current-match").textContent=current?(current.label||current.match_id)+" · jogo "+(current.index||"?")+"/"+(current.total||total):"Nenhum jogo neste momento";
  byId("processed").textContent=fmt(processed);
  byId("stats-complete").textContent=fmt(snapshot.stats_complete);
  byId("bwin-found").textContent=fmt(snapshot.bwin_found);
  byId("errors").textContent=fmt(snapshot.errors);
  const csv=snapshot.csv_written;
  pill("stats-file",csv?"CSV preparado":"Pendente",csv?"good":"neutral");
  pill("odds-file",csv?"CSV preparado":"Pendente",csv?"good":"neutral");
  byId("stats-rows").textContent=snapshot.stats_rows==null?"—":fmt(snapshot.stats_rows);
  byId("odds-rows").textContent=snapshot.odds_rows==null?"—":fmt(snapshot.odds_rows);
  pill("commit-pill",snapshot.repository_committed?"Gravado no GitHub":csv?"A aguardar gravação":"A aguardar",snapshot.repository_committed?"good":"neutral");
  if(snapshot.run_id&&/^\d+$/.test(String(snapshot.run_id)))byId("run-link").href="https://github.com/markyto34/simuladorfutebol/actions/runs/"+snapshot.run_id;
  const events=(snapshot.events||[]).slice().reverse();
  byId("event-count").textContent=events.length+" eventos";
  byId("events").innerHTML=events.length?events.map(e=>'<li><time>'+new Date(e.at).toLocaleTimeString("pt-PT")+'</time>'+escapeHtml(e.message||e.type)+'</li>').join(""):'<li class="empty">Ainda não existem eventos de recolha.</li>';
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function refresh(){
  byId("refresh").disabled=true;
  try{
    const response=await fetch(API+"/monitor/status",{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    if(!data.ok)throw new Error(data.error||"Monitor indisponível");
    render(data.snapshot||{});
  }catch(error){
    byId("status").textContent="Não foi possível ligar ao monitor";
    pill("status-pill","Sem ligação","bad");
    byId("current-match").textContent=error.message;
  }finally{byId("refresh").disabled=false;}
}
byId("refresh").addEventListener("click",refresh);
refresh();
setInterval(refresh,4000);