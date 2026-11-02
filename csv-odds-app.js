(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const CSV_URL = "https://raw.githubusercontent.com/markyto34/simuladorfutebol/main/ganhonasodds_com_20261101.csv";
  const PAGE_SIZE = 50;
  let allMatches = [], matches = [], page = 0;
  const fmtOdd = n => Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "—";
  const dateText = d => d ? new Intl.DateTimeFormat("pt-PT").format(d) : "—";
  const scoreText = s => s && Number.isInteger(s[0]) && Number.isInteger(s[1]) ? s[0] + "–" + s[1] : "—";
  const unique = values => [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt"));

  function setCountries() {
    const select = $("country");
    unique(allMatches.map(m=>m.country)).forEach(country => select.add(new Option(country,country)));
  }
  function currentOdds() {
    return {"1":Number($("current1").value),X:Number($("currentX").value),"2":Number($("current2").value)};
  }
  function render() {
    const body = $("matchesBody");
    body.replaceChildren();
    const start = page * PAGE_SIZE;
    const rows = matches.slice(start,start+PAGE_SIZE);
    if (!rows.length) {
      const tr=document.createElement("tr"),td=document.createElement("td");
      td.colSpan=10;td.className="empty";td.textContent="Não foram encontrados jogos com as três odds exatamente iguais.";
      tr.append(td);body.append(tr);
    } else rows.forEach(match => {
      const tr=document.createElement("tr");
      const values=[
        dateText(match.date),match.continent||"Por identificar",match.country||"—",match.league||"—",
        (match.home||"—")+" – "+(match.away||"—"),
        fmtOdd(match.odds["1"]),fmtOdd(match.odds.X),fmtOdd(match.odds["2"]),
        scoreText(match.ft),match.outcome==="1"?"1 · Casa":match.outcome==="X"?"X · Empate":match.outcome==="2"?"2 · Visitante":"Pendente"
      ];
      values.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td);});
      body.append(tr);
    });
    const pages=Math.max(1,Math.ceil(matches.length/PAGE_SIZE));
    $("resultCount").textContent=matches.length.toLocaleString("pt-PT")+" jogos";
    $("pageLabel").textContent="Página "+(page+1)+" / "+pages;
    $("prevPage").disabled=page===0;
    $("nextPage").disabled=page>=pages-1;
  }
  function search() {
    const odds=currentOdds();
    if (!CSVOdds.hasCompleteOdds(odds)) {
      $("resultsPanel").hidden=true;
      $("currentNote").textContent="Introduz três odds válidas, todas superiores a 1,00.";
      return;
    }
    const country=$("country").value;
    matches=CSVOdds.evaluateCurrentOdds(allMatches,odds).matches;
    if(country) matches=matches.filter(match=>match.country===country);
    matches.sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0));
    page=0;
    $("resultsPanel").hidden=false;
    $("resultsTitle").textContent="Jogos com odds exatamente iguais";
    $("currentNote").textContent=matches.length
      ? "Pesquisa concluída. As três odds 1/X/2 coincidem exatamente"+(country?" e o país é "+country+".":".")
      : "Não existem jogos com estas três odds exatamente iguais"+(country?" em "+country+".":".");
    render();
  }
  async function loadDatabase() {
    try {
      const response=await fetch(CSV_URL,{method:"GET",mode:"cors",cache:"default"});
      if(!response.ok) throw new Error("HTTP "+response.status);
      const raw=CSVOdds.parseCSV(await response.text());
      const required=["date_time","COUNTRY","LEAGUE","TEAM_HOME","TEAM_AWAY","odd_ft_1","odd_ft_x","odd_ft_2","score_ft_home","score_ft_away"];
      if(!raw.length||required.some(key=>!(key in raw[0]))) throw new Error("Faltam colunas obrigatórias no CSV.");
      allMatches=CSVOdds.normalizeRows(raw).filter(m=>m.oddsComplete);
      setCountries();
      $("recordCount").textContent=allMatches.length.toLocaleString("pt-PT")+" jogos com odds 1X2 válidas";
      $("status").textContent="Base histórica carregada.";
      $("searchHistoricalOdds").disabled=false;
      $("currentNote").textContent="Introduz as três odds e, se quiseres, seleciona um país.";
    } catch(error) {
      $("status").textContent="Não foi possível carregar a base histórica: "+error.message;
      $("currentNote").textContent="Verifica a ligação à internet e tenta novamente.";
    }
  }
  $("searchHistoricalOdds").addEventListener("click",search);
  $("clearSearch").addEventListener("click",()=>{
    ["current1","currentX","current2"].forEach(id=>$(id).value="");
    $("country").value="";
    $("resultsPanel").hidden=true;
    $("currentNote").textContent="Pesquisa limpa. Introduz as três odds para começar.";
  });
  $("prevPage").addEventListener("click",()=>{if(page>0){page--;render();}});
  $("nextPage").addEventListener("click",()=>{if((page+1)*PAGE_SIZE<matches.length){page++;render();}});
  ["current1","currentX","current2"].forEach(id=>$(id).addEventListener("keydown",event=>{if(event.key==="Enter")search();}));
  $("country").addEventListener("change",()=>{if(!$("resultsPanel").hidden)search();});
  loadDatabase();
})();