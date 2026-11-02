(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const CSV_URL = "https://raw.githubusercontent.com/markyto34/simuladorfutebol/main/ganhonasodds_com_20261101.csv";
  const PAGE_SIZE = 50;
  let allMatches = [], matches = [], page = 0;
  const fmtOdd = n => Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "—";
  const fmtPct = n => Number.isFinite(n) ? n.toFixed(1).replace(".", ",")+"%" : "—";
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
  function metric(label,value,detail) {
    const div=document.createElement("div");div.className="metric";
    const name=document.createElement("span");name.textContent=label;
    const val=document.createElement("strong");val.textContent=value;
    div.append(name,val);
    if(detail){const small=document.createElement("small");small.textContent=detail;div.append(small);}
    return div;
  }
  function fillMetrics(id,items) {
    const target=$(id);target.replaceChildren();
    items.forEach(item=>target.append(metric(item[0],item[1],item[2])));
  }
  function marketMetric(market,label) {
    return market ? [label,fmtPct(market.frequency),market.count+" jogos válidos"] : [label,"—","Sem dados"];
  }
  function renderStatistics(result) {
    const summary=CSVOdds.summarize(result.matches);
    $("statsSample").textContent=summary.completed.toLocaleString("pt-PT")+" resultados FT completos";
    fillMetrics("summaryStats",[
      ["Vitória casa (1)",fmtPct(summary.percentages["1"]),summary.counts["1"]+" jogos"],
      ["Empate (X)",fmtPct(summary.percentages.X),summary.counts.X+" jogos"],
      ["Vitória fora (2)",fmtPct(summary.percentages["2"]),summary.counts["2"]+" jogos"]
    ]);
    const m=result.marketAnalysis;
    fillMetrics("firstHalfStats",[
      marketMetric(m.firstHalf.result.outcomes["1"],"Casa vence 1.ª parte"),
      marketMetric(m.firstHalf.result.outcomes.X,"Empate ao intervalo"),
      marketMetric(m.firstHalf.result.outcomes["2"],"Visitante vence 1.ª parte"),
      marketMetric(m.firstHalf.over05,"Mais de 0,5 golos"),
      marketMetric(m.firstHalf.over15,"Mais de 1,5 golos"),
      marketMetric(m.firstHalf.btts,"Ambas marcam")
    ]);
    fillMetrics("secondHalfStats",[
      marketMetric(m.secondHalf.result.outcomes["1"],"Casa vence 2.ª parte"),
      marketMetric(m.secondHalf.result.outcomes.X,"Empate na 2.ª parte"),
      marketMetric(m.secondHalf.result.outcomes["2"],"Visitante vence 2.ª parte"),
      marketMetric(m.secondHalf.over05,"Mais de 0,5 golos"),
      marketMetric(m.secondHalf.over15,"Mais de 1,5 golos"),
      marketMetric(m.secondHalf.btts,"Ambas marcam")
    ]);
    fillMetrics("fullTimeStats",[
      marketMetric(m.fullTime.over15,"Mais de 1,5 golos"),
      marketMetric(m.fullTime.over25,"Mais de 2,5 golos"),
      marketMetric(m.fullTime.over35,"Mais de 3,5 golos"),
      marketMetric(m.fullTime.btts,"Ambas marcam"),
      marketMetric(m.fullTime.homeOver05,"Casa marca"),
      marketMetric(m.fullTime.awayOver05,"Visitante marca")
    ]);
    const scores=$("topScores");scores.replaceChildren();
    const top=m.fullTime.exactScores.top;
    if(!top.length){scores.textContent="Sem resultados completos para calcular.";}
    else top.forEach((item,index)=>scores.append(metric((index+1)+". "+item.score,fmtPct(item.frequency),item.count+" ocorrências")));
    const p=result.market;
    fillMetrics("impliedStats",[
      ["Probabilidade implícita 1",fmtPct(p.raw["1"]),""],
      ["Probabilidade implícita X",fmtPct(p.raw.X),""],
      ["Probabilidade implícita 2",fmtPct(p.raw["2"]),""],
      ["Margem teórica do mercado",fmtPct(p.overround),"Calculada a partir das odds introduzidas"]
    ]);
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
    const scopedMatches=country?allMatches.filter(match=>match.country===country):allMatches;
    const result=CSVOdds.evaluateCurrentOdds(scopedMatches,odds);
    matches=result.matches.slice().sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0));
    page=0;
    $("resultsPanel").hidden=false;
    $("resultsTitle").textContent="Jogos com odds exatamente iguais";
    $("currentNote").textContent=matches.length
      ? "Pesquisa concluída. As três odds 1/X/2 coincidem exatamente"+(country?" e o país é "+country+".":".")
      : "Não existem jogos com estas três odds exatamente iguais"+(country?" em "+country+".":".");
    renderStatistics(result);
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