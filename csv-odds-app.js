(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let allMatches = [], filtered = [], page = 0;
  const PAGE_SIZE = 50;
  const fmt = (n, digits=1) => Number.isFinite(n) ? n.toFixed(digits).replace(".", ",") : "—";
  const pct = n => Number.isFinite(n) ? fmt(n, 1) + "%" : "—";
  const unique = values => [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt"));
  const dateText = d => d ? new Intl.DateTimeFormat("pt-PT").format(d) : "—";
  const scoreText = s => s[0] === null || s[1] === null ? "—" : s[0] + "–" + s[1];
  function setOptions(id, values, first) {
    const el = $(id), previous = el.value;
    el.replaceChildren(new Option(first, ""));
    values.forEach(v => el.add(new Option(v, v)));
    if (values.includes(previous)) el.value = previous;
  }
  function fillFilters() {
    setOptions("country", unique(allMatches.map(m=>m.country)), "Todos os países");
    setOptions("league", unique(allMatches.map(m=>m.league)), "Todas as competições");
    setOptions("team", unique(allMatches.flatMap(m=>[m.home,m.away])), "Todas as equipas");
  }
  function getFiltered() {
    const fromValue = $("from").value, toValue = $("to").value;
    const from = fromValue ? new Date(fromValue + "T00:00:00") : null;
    const to = toValue ? new Date(toValue + "T23:59:59.999") : null;
    return CSVOdds.filterMatches(allMatches, {
      search:$("search").value, country:$("country").value, league:$("league").value,
      team:$("team").value, from, to, status:$("statusFilter").value
    });
  }
  function update() {
    filtered = getFiltered();
    page = 0;
    const s = CSVOdds.summarize(filtered);
    $("kpiTotal").textContent = s.total.toLocaleString("pt-PT");
    $("kpiCompleted").textContent = s.completed.toLocaleString("pt-PT");
    $("kpiPending").textContent = s.pending.toLocaleString("pt-PT");
    $("kpiLeagues").textContent = unique(filtered.map(m=>m.league)).length.toLocaleString("pt-PT");
    $("homePct").textContent = pct(s.percentages["1"]); $("drawPct").textContent = pct(s.percentages.X); $("awayPct").textContent = pct(s.percentages["2"]);
    $("homeCount").textContent = s.counts["1"].toLocaleString("pt-PT") + " jogos";
    $("drawCount").textContent = s.counts.X.toLocaleString("pt-PT") + " jogos";
    $("awayCount").textContent = s.counts["2"].toLocaleString("pt-PT") + " jogos";
    $("homeBar").style.width = s.percentages["1"] + "%"; $("drawBar").style.width = s.percentages.X + "%"; $("awayBar").style.width = s.percentages["2"] + "%";
    updateOdds(); renderTable();
  }
  function updateOdds() {
    const min = Number($("minOdd").value), max = Number($("maxOdd").value);
    const valid = Number.isFinite(min) && Number.isFinite(max) && min > 1 && max >= min;
    const a = valid ? CSVOdds.analyzeOdds(filtered, $("market").value, min, max) : {count:0,wins:0,hitRate:null,avgOdds:null,implied:null,roi:null};
    $("oddsN").textContent = a.count.toLocaleString("pt-PT");
    $("oddsWins").textContent = a.count ? a.wins.toLocaleString("pt-PT") : "—";
    $("oddsHit").textContent = pct(a.hitRate);
    $("oddsImplied").textContent = pct(a.implied);
    $("oddsAverage").textContent = fmt(a.avgOdds,2);
    $("oddsRoi").textContent = pct(a.roi);
  }
  function renderTable() {
    const start = page * PAGE_SIZE, rows = filtered.slice(start,start+PAGE_SIZE);
    $("matchesBody").replaceChildren();
    if (!rows.length) {
      const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=8;td.className="empty";td.textContent="Não existem jogos para os filtros selecionados.";tr.append(td);$("matchesBody").append(tr);
    } else rows.forEach(m=>{
      const tr=document.createElement("tr");
      const cells=[dateText(m.date),m.league,m.home+" – "+m.away,scoreText(m.ht),scoreText(m.ft),scoreText(m.final),
        ["1","X","2"].map(k=>m.odds[k]===null?"—":fmt(m.odds[k],2)).join(" / ")];
      cells.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td);});
      const state=document.createElement("td");state.textContent=m.completed?"Concluído":"Pendente";if(!m.completed)state.className="pending";tr.append(state);$("matchesBody").append(tr);
    });
    const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
    $("tableInfo").textContent=filtered.length.toLocaleString("pt-PT")+" REGISTOS";
    $("pageLabel").textContent="Página "+(page+1)+" / "+pages;
    $("prevPage").disabled=page===0;$("nextPage").disabled=page>=pages-1;
  }
  $("csvFile").addEventListener("change", async e=>{
    const file=e.target.files && e.target.files[0];if(!file)return;
    $("status").textContent="A ler "+file.name+" ("+(file.size/1024/1024).toFixed(1)+" MB)…";
    try {
      const text=await file.text();
      const raw=CSVOdds.parseCSV(text);
      const required=["date_time","COUNTRY","LEAGUE","TEAM_HOME","TEAM_AWAY","odd_ft_1","odd_ft_x","odd_ft_2","score_final_home","score_final_away"];
      if(!raw.length || required.some(k=>!(k in raw[0]))) throw new Error("O ficheiro não contém todas as colunas obrigatórias do formato esperado.");
      allMatches=CSVOdds.normalizeRows(raw);
      fillFilters();$("workspace").hidden=false;
      $("recordCount").textContent=allMatches.length.toLocaleString("pt-PT");
      const completed=allMatches.filter(m=>m.completed).length;
      $("status").textContent="Importação concluída: "+allMatches.length.toLocaleString("pt-PT")+" linhas, "+completed.toLocaleString("pt-PT")+" jogos com resultado final e "+(allMatches.length-completed).toLocaleString("pt-PT")+" sem resultado final. O conteúdo permanece neste navegador.";
      update();
    } catch(err) {
      allMatches=[];$("workspace").hidden=true;
      $("status").textContent="Não foi possível importar o CSV: "+err.message;
      $("recordCount").textContent="—";
    }
  });
  ["search","country","league","team","from","to","statusFilter"].forEach(id=>$(id).addEventListener(id==="search"?"input":"change",update));
  ["market","minOdd","maxOdd"].forEach(id=>$(id).addEventListener("input",updateOdds));
  $("clearFilters").addEventListener("click",()=>{
    ["search","country","league","team","from","to"].forEach(id=>$(id).value="");
    $("statusFilter").value="all";$("market").value="1";$("minOdd").value="1.30";$("maxOdd").value="1.60";update();
  });
  $("prevPage").addEventListener("click",()=>{if(page>0){page--;renderTable();}});
  $("nextPage").addEventListener("click",()=>{if((page+1)*PAGE_SIZE<filtered.length){page++;renderTable();}});
})();