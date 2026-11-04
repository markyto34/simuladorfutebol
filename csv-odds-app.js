(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const CSV_URL = "https://raw.githubusercontent.com/markyto34/simuladorfutebol/main/ganhonasodds_com_20261101.csv";
  const PAGE_SIZE = 50;
  let allMatches = [], matches = [], page = 0, databaseLoaded = false, databasePromise = null;
  const fmtOdd = n => Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "—";
  const fmtPct = n => Number.isFinite(n) ? n.toFixed(1).replace(".", ",")+"%" : "—";
  const dateText = d => d ? new Intl.DateTimeFormat("pt-PT").format(d) : "—";
  const scoreText = s => s && Number.isInteger(s[0]) && Number.isInteger(s[1]) ? s[0] + "–" + s[1] : "—";
  const unique = values => [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt"));

  function setCountries() {
    const select = $("country");
    unique(allMatches.map(m=>m.country)).forEach(country => select.add(new Option(country,country)));
    setLeagues();
  }
  function setLeagues() {
    const select=$("league");
    const previous=select.value;
    const country=$("country").value;
    const leagues=unique(allMatches.filter(m=>!country||m.country===country).map(m=>m.league));
    select.replaceChildren(new Option("Todas as divisões",""));
    leagues.forEach(league=>select.add(new Option(league,league)));
    select.value=leagues.includes(previous)?previous:"";
  }
  function currentRanges() {
    const ranges = {};
    let active = false;
    for (const key of ["1", "X", "2"]) {
      const minRaw = $("range" + key + "Min").value.trim();
      const maxRaw = $("range" + key + "Max").value.trim();
      active = active || Boolean(minRaw || maxRaw);
      const min = minRaw ? Number(minRaw) : null;
      const max = maxRaw ? Number(maxRaw) : null;
      if (minRaw && (!Number.isFinite(min) || min <= 1 || min > 1000)) throw new Error("Confirma os limites mínimos: devem ser odds superiores a 1,00.");
      if (maxRaw && (!Number.isFinite(max) || max <= 1 || max > 1000)) throw new Error("Confirma os limites máximos: devem ser odds superiores a 1,00.");
      if (min !== null && max !== null && min > max) throw new Error("Em cada odd, o limite mínimo não pode ser superior ao máximo.");
      ranges[key] = { min, max };
    }
    return { ranges, active };
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
      ["Probabilidade implícita 1",p?fmtPct(p.raw["1"]):"—",p?"":"Sem amostra para calcular"],
      ["Probabilidade implícita X",p?fmtPct(p.raw.X):"—",p?"":"Sem amostra para calcular"],
      ["Probabilidade implícita 2",p?fmtPct(p.raw["2"]):"—",p?"":"Sem amostra para calcular"],
      ["Margem teórica do mercado",p?fmtPct(p.overround):"—",p?"Odds introduzidas ou odds médias da amostra":"Sem amostra para calcular"]
    ]);  }
  function makeText(tag,className,value){
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=value;
    return node;
  }
  function render() {
    const list=$("matchesList");
    list.replaceChildren();
    const start=page*PAGE_SIZE;
    const rows=matches.slice(start,start+PAGE_SIZE);
    if(!rows.length){
      list.append(makeText("p","empty-card","Não foram encontrados jogos com as três odds exatamente iguais."));
    }else rows.forEach(match=>{
      const card=makeText("article","match-card","");
      const head=makeText("div","match-card-head","");
      const meta=makeText("div","match-meta","");
      meta.append(makeText("span","match-date",dateText(match.date)));
      meta.append(makeText("span","match-competition",[match.country,match.league].filter(Boolean).join(" · ")||"Competição por identificar"));
      head.append(meta);
      const resultLabel=match.outcome==="1"?"Vitória casa":match.outcome==="X"?"Empate":match.outcome==="2"?"Vitória visitante":"Resultado pendente";
      head.append(makeText("span","outcome "+(match.outcome||"pending"),resultLabel));
      card.append(head);
      const teams=makeText("div","match-teams","");
      teams.append(makeText("strong","team-home",match.home||"Casa"));
      teams.append(makeText("span","versus","—"));
      teams.append(makeText("strong","team-away",match.away||"Visitante"));
      card.append(teams);
      const periods=makeText("div","score-periods","");
      [["HT · Intervalo",match.ht],["ST · 2.ª parte",match.secondHalf],["FT · Final",match.ft]].forEach(([label,score])=>{
        const period=makeText("div","score-period","");
        period.append(makeText("span","period-label",label));
        period.append(makeText("strong","period-score",scoreText(score)));
        periods.append(period);
      });
      card.append(periods);
      const odds=makeText("div","match-odds","");
      odds.append(makeText("span","odds-heading","ODDS 1X2"));
      [["1",match.odds["1"]],["X",match.odds.X],["2",match.odds["2"]]].forEach(([label,value])=>{
        const item=makeText("div","odd-item","");
        item.append(makeText("span","odd-label",label));
        item.append(makeText("strong","odd-value",fmtOdd(value)));
        odds.append(item);
      });
      card.append(odds);
      list.append(card);
    });
    const pages=Math.max(1,Math.ceil(matches.length/PAGE_SIZE));
    $("resultCount").textContent=matches.length.toLocaleString("pt-PT")+" jogos";
    $("pageLabel").textContent="Página "+(page+1)+" / "+pages;
    $("prevPage").disabled=page===0;
    $("nextPage").disabled=page>=pages-1;
  }
  async function search() {
    const odds=currentOdds();
    let rangeConfig;
    try { rangeConfig = currentRanges(); }
    catch (error) {
      $("resultsPanel").hidden = true;
      $("currentNote").textContent = error.message;
      return;
    }
    const rangeMode = rangeConfig.active;
    if (!rangeMode && !CSVOdds.hasCompleteOdds(odds)) {
      $("resultsPanel").hidden=true;
      $("currentNote").textContent="Introduz as três odds exatas ou define pelo menos um limite nos intervalos.";
      return;
    }
    if (!databaseLoaded) {
      $("searchHistoricalOdds").disabled = true;
      $("currentNote").textContent = "A carregar a base histórica pela primeira vez…";
      const loaded = await loadDatabase();
      $("searchHistoricalOdds").disabled = false;
      if (!loaded) return;
    }
    const country=$("country").value;
    const league=$("league").value;
    const scopedMatches=allMatches.filter(match=>
      (!country||match.country===country)&&(!league||match.league===league));
    const result=rangeMode?CSVOdds.evaluateOddsRanges(scopedMatches,rangeConfig.ranges):CSVOdds.evaluateCurrentOdds(scopedMatches,odds);
    matches=CSVOdds.sortMatchesChronologically(result.matches);
    page=0;
    $("resultsPanel").hidden=false;
    $("resultsTitle").textContent=rangeMode?"Jogos dentro dos intervalos de odds":"Jogos com odds exatamente iguais";
    const scopeText=(country?" no país "+country:"")+(league?" · divisão "+league:"");
    $("currentNote").textContent=matches.length
      ? (rangeMode?"Pesquisa concluída. As odds 1/X/2 estão dentro dos intervalos definidos":"Pesquisa concluída. As três odds 1/X/2 coincidem exatamente")+scopeText+"."
      : (rangeMode?"Não existem jogos dentro dos intervalos definidos":"Não existem jogos com estas três odds exatamente iguais")+scopeText+".";
    $("resultsTitle").textContent=league?"Jogos — "+league+(rangeMode?" · intervalos":" · odds exatas"):(rangeMode?"Jogos dentro dos intervalos de odds":"Jogos com odds exatamente iguais");
    renderStatistics(result);
    render();
  }
  async function loadDatabase() {
    if (databaseLoaded) return true;
    if (databasePromise) return databasePromise;
    databasePromise = (async () => {
      try {
        const response = await fetch(CSV_URL, { method: "GET", mode: "cors", cache: "default" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const required = ["date_time","COUNTRY","LEAGUE","TEAM_HOME","TEAM_AWAY","odd_ft_1","odd_ft_x","odd_ft_2","score_ft_home","score_ft_away"];
        let headers = null;
        const consumeRow = values => {
          if (!headers) {
            headers = values.map(value => value.trim());
            if (required.some(key => !headers.includes(key))) throw new Error("Faltam colunas obrigatórias no CSV.");
            return;
          }
          const raw = {};
          headers.forEach((header, index) => { raw[header] = (values[index] || "").trim(); });
          const match = CSVOdds.normalizeRows([raw])[0];
          if (match.oddsComplete) allMatches.push(match);
        };
        if (response.body && typeof response.body.getReader === "function" && typeof TextDecoder !== "undefined") {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          const parser = CSVOdds.createCSVParser(consumeRow);
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            parser.feed(decoder.decode(part.value, { stream: true }), false);
          }
          parser.feed(decoder.decode(), true);
        } else {
          const rawRows = CSVOdds.parseCSV(await response.text());
          if (!rawRows.length || required.some(key => !(key in rawRows[0]))) throw new Error("Faltam colunas obrigatórias no CSV.");
          rawRows.forEach(raw => {
            const match = CSVOdds.normalizeRows([raw])[0];
            if (match.oddsComplete) allMatches.push(match);
          });
        }
        if (!headers && !allMatches.length) throw new Error("O CSV não contém registos.");
        setCountries();
        $("recordCount").textContent = allMatches.length.toLocaleString("pt-PT") + " jogos com odds 1X2 válidas";
        $("status").textContent = "Base histórica carregada.";
        $("searchHistoricalOdds").disabled = false;
        $("currentNote").textContent = "Base pronta. Confirma as três odds para pesquisar.";
        databaseLoaded = true;
        return true;
      } catch (error) {
        allMatches = [];
        $("status").textContent = "Não foi possível carregar a base histórica: " + error.message;
        $("currentNote").textContent = "Verifica a ligação à internet e tenta novamente.";
        return false;
      } finally {
        if (!databaseLoaded) databasePromise = null;
      }
    })();
    return databasePromise;
  }
  $("searchHistoricalOdds").addEventListener("click",search);
  $("clearSearch").addEventListener("click",()=>{
    ["current1","currentX","current2","range1Min","range1Max","rangeXMin","rangeXMax","range2Min","range2Max"].forEach(id=>$(id).value="");
    $("country").value="";
    setLeagues();
    $("league").value="";
    $("resultsPanel").hidden=true;
    $("currentNote").textContent="Pesquisa limpa. Introduz as três odds para começar.";
  });
  $("prevPage").addEventListener("click",()=>{if(page>0){page--;render();}});
  $("nextPage").addEventListener("click",()=>{if((page+1)*PAGE_SIZE<matches.length){page++;render();}});
  ["current1","currentX","current2"].forEach(id=>$(id).addEventListener("keydown",event=>{if(event.key==="Enter")search();}));
  $("country").addEventListener("change",()=>{
    setLeagues();
    if(!$("resultsPanel").hidden)search();
  });
  $("league").addEventListener("change",()=>{if(!$("resultsPanel").hidden)search();});
})();