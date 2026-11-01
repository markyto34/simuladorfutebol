(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const CSV_URL = "https://raw.githubusercontent.com/markyto34/simuladorfutebol/main/ganhonasodds_com_20261101.csv";
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
    setOptions("continent", unique(allMatches.map(m=>m.continent)), "Todos os continentes");
    updateCountryOptions();
  }
  function updateCountryOptions() {
    const selectedContinent = $("continent").value;
    const countries = allMatches.filter(m => !selectedContinent || m.continent === selectedContinent).map(m => m.country);
    setOptions("country", unique(countries), "Todos os países");
    setOptions("league", unique(allMatches.map(m=>m.league)), "Todas as competições");
  }
  function getFiltered() {
    const fromValue = $("from").value, toValue = $("to").value;
    const from = fromValue ? new Date(fromValue + "T00:00:00") : null;
    const to = toValue ? new Date(toValue + "T23:59:59.999") : null;
    return CSVOdds.filterMatches(allMatches, {
      continent:$("continent").value, search:$("search").value, country:$("country").value, league:$("league").value,
      team:$("team").value, from, to, status:$("statusFilter").value
    });
  }
  function tripletRanges() {
    const ranges = {};
    [["1","min1","max1"],["X","minX","maxX"],["2","min2","max2"]].forEach(([key,minId,maxId]) => {
      ranges[key] = { min:$(minId).value, max:$(maxId).value };
    });
    return ranges;
  }
  function renderMarketGroups(targetId, analysis) {
    const target = $(targetId);
    target.replaceChildren();
    const groups = [
      ["Primeira parte", analysis.firstHalf, [
        ["Resultado 1/X/2","result"],["Mais de 0,5 golos","over05"],["Mais de 1,5 golos","over15"],
        ["Mais de 2,5 golos","over25"],["Ambas marcam","btts"],["Resultados exatos mais frequentes","exactScores"]
      ]],
      ["Segunda parte", analysis.secondHalf, [
        ["Resultado 1/X/2","result"],["Mais de 0,5 golos","over05"],["Mais de 1,5 golos","over15"],
        ["Mais de 2,5 golos","over25"],["Ambas marcam","btts"],["Comparação com a 1.ª parte","moreGoalsThanFirst"],
        ["Resultados exatos mais frequentes","exactScores"]
      ]],
      ["Resultado final", analysis.fullTime, [
        ["Resultado 1/X/2","result"],["Mais de 1,5 golos","over15"],["Mais de 2,5 golos","over25"],
        ["Mais de 3,5 golos","over35"],["Mais de 4,5 golos","over45"],["Ambas marcam","btts"],
        ["Casa +0,5 / +1,5 golos","homeGoals"],["Visitante +0,5 / +1,5 golos","awayGoals"],
        ["Casa sem sofrer","homeCleanSheet"],["Visitante sem sofrer","awayCleanSheet"],
        ["Resultados exatos mais frequentes","exactScores"]
      ]],
      ["Intervalo / final", analysis.halfFull, [["Combinações 1/X/2","outcomes"]]]
    ];
    groups.forEach(([title, group, metrics]) => {
      const card=document.createElement("article"); card.className="market-period-card";
      const heading=document.createElement("h3"); heading.textContent=title; card.append(heading);
      metrics.forEach(([label,key]) => {
        const line=document.createElement("div"); line.className="market-line";
        const name=document.createElement("span"); name.textContent=label; line.append(name);
        const value=document.createElement("strong");
        const small=document.createElement("small");
        if (key==="homeGoals") {
          value.textContent=">0,5: "+pct(group.homeOver05.frequency)+" · >1,5: "+pct(group.homeOver15.frequency);
          small.textContent="Amostras: "+group.homeOver05.count+" / "+group.homeOver15.count;
        } else if (key==="awayGoals") {
          value.textContent=">0,5: "+pct(group.awayOver05.frequency)+" · >1,5: "+pct(group.awayOver15.frequency);
          small.textContent="Amostras: "+group.awayOver05.count+" / "+group.awayOver15.count;
        } else if (key==="result") {
          value.textContent=["1","X","2"].map(k=>k+": "+pct(group.result.outcomes[k].frequency)).join(" · ");
          small.textContent=group.result.count.toLocaleString("pt-PT")+" jogos válidos";
        } else if (key==="outcomes") {
          const entries=Object.entries(group.outcomes).sort((a,b)=>b[1].count-a[1].count);
          value.textContent=entries.length?entries.map(([k,v])=>k+": "+pct(v.frequency)).join(" · "):"Sem amostra válida";
          small.textContent=group.count.toLocaleString("pt-PT")+" jogos com intervalo e FT";
        } else if (key==="moreGoalsThanFirst") {
          const n=group.moreGoalsThanFirst.count, m=group.moreGoalsThanFirst;
          value.textContent=n? "2.ª parte: "+pct(m.secondHalfMore/n*100)+" · 1.ª parte: "+pct(m.firstHalfMore/n*100)+" · Igual: "+pct(m.equal/n*100):"—";
          small.textContent=n.toLocaleString("pt-PT")+" jogos com as duas partes completas";
        } else if (key==="exactScores") {
          value.textContent=group.exactScores.top.length?group.exactScores.top.map(x=>x.score+" ("+pct(x.frequency)+")").join(" · "):"Sem resultados completos";
          small.textContent=group.exactScores.count.toLocaleString("pt-PT")+" jogos válidos";
        } else {
          value.textContent=pct(group[key].frequency);
          small.textContent=group[key].count.toLocaleString("pt-PT")+" jogos válidos";
        }
        line.append(value,small); card.append(line);
      });
      target.append(card);
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
    updateTriplet(); renderMarketGroups("periodMarkets", CSVOdds.analyzePeriodMarkets(CSVOdds.filterOddsRanges(filtered, tripletRanges()))); updateCurrentOdds(); renderTable();
  }
  function updateTriplet() {
    const a = CSVOdds.analyzeTriplet(filtered, tripletRanges());
    $("tripletN").textContent = a.count.toLocaleString("pt-PT");
    $("tripletMargin").textContent = pct(a.averageOverround);
    [["1","one"],["X","draw"],["2","two"]].forEach(([key,id]) => {
      const o = a.outcomes[key];
      $(id+"Wins").textContent = o.wins.toLocaleString("pt-PT");
      $(id+"Frequency").textContent = pct(o.frequency);
      $(id+"Roi").textContent = pct(o.roi);
      $(id+"AverageOdd").textContent = fmt(a.averageOdds[key],2);
      $(id+"Fair").textContent = pct(a.averageFairImplied[key]);
    });
    $("tripletNote").textContent = a.count
      ? "Amostra com resultado FT e as três odds válidas. Cada resultado é simulado separadamente com 1 unidade por jogo."
      : "Não existem jogos concluídos com as três odds dentro destes intervalos.";
  }
  function updateCurrentOdds() {
    const odds = {"1":Number($("current1").value),X:Number($("currentX").value),"2":Number($("current2").value)};
    if (!CSVOdds.hasCompleteOdds(odds)) {
      $("currentSample").textContent = "—";
      ["current1Prob","currentXProb","current2Prob","currentMargin","current1Freq","currentXFreq","current2Freq","marketPrediction","marketPredictionProb","exactSample","exactScores"].forEach(id=>$(id).textContent="—");
      renderMarketGroups("similarMarkets", CSVOdds.analyzePeriodMarkets([]));
      $("currentNote").textContent = "Introduz as três odds do jogo: 1, X e 2.";
      return;
    }
    try {
      const tolerance = Number($("tolerance").value || 0.15);
      const result = CSVOdds.evaluateCurrentOdds(filtered, odds, tolerance);
      $("currentSample").textContent = result.sample.toLocaleString("pt-PT");
      renderMarketGroups("similarMarkets", result.marketAnalysis);
      $("current1Prob").textContent = pct(result.market.fair["1"]);
      $("currentXProb").textContent = pct(result.market.fair.X);
      $("current2Prob").textContent = pct(result.market.fair["2"]);
      $("currentMargin").textContent = pct(result.market.overround);
      $("current1Freq").textContent = pct(result.historical["1"].frequency);
      $("currentXFreq").textContent = pct(result.historical.X.frequency);
      $("current2Freq").textContent = pct(result.historical["2"].frequency);
      const favourite = ["1","X","2"].reduce((best,key) => result.market.fair[key] > result.market.fair[best] ? key : best, "1");
      const marketNames = {"1":"Vitória da casa (1)","X":"Empate (X)","2":"Vitória visitante (2)"};
      $("marketPrediction").textContent = marketNames[favourite];
      $("marketPredictionProb").textContent = pct(result.market.fair[favourite]);
      const exact = CSVOdds.forecastExactScores(result.matches, 5);
      $("exactSample").textContent = exact.sample.toLocaleString("pt-PT");
      $("exactScores").textContent = exact.scores.length
        ? exact.scores.map(s => s.score + " (" + pct(s.frequency) + "; " + s.count + " jogos)").join(" · ")
        : "Sem resultados FT suficientes para estimar marcadores.";
      $("exactNote").textContent = exact.sample
        ? "Marcadores mais frequentes na amostra histórica semelhante às três odds. Frequências empíricas, não probabilidades de marcador exato calibradas."
        : "Não há jogos históricos semelhantes concluídos para estimar o marcador.";
      $("currentNote").textContent = result.sample
        ? "Comparação com jogos históricos em que cada uma das três odds ficou dentro da tolerância absoluta de ±" + fmt(tolerance,2) + ". É uma amostra de semelhança, não uma previsão."
        : "Não encontrámos jogos históricos dentro da tolerância escolhida. Aumentar a tolerância aumenta a amostra, mas também reduz a semelhança.";
    } catch (err) {
      renderMarketGroups("similarMarkets", CSVOdds.analyzePeriodMarkets([]));
      $("currentNote").textContent = err.message;
    }
  }
  function runBacktest() {
    const splitDate = $("splitDate").value;
    if (!splitDate) {
      $("backtestStatus").textContent = "Escolhe uma data de corte para separar treino e validação.";
      return;
    }
    const result = CSVOdds.backtestTriplet(filtered, tripletRanges(), splitDate);
    $("trainN").textContent = result.training.count.toLocaleString("pt-PT");
    $("validN").textContent = result.validation.count.toLocaleString("pt-PT");
    [["1","train1","valid1"],["X","trainX","validX"],["2","train2","valid2"]].forEach(([key,trainId,validId]) => {
      $(trainId).textContent = pct(result.training.outcomes[key].roi);
      $(validId).textContent = pct(result.validation.outcomes[key].roi);
    });
    $("backtestStatus").textContent = "Separação cronológica concluída. O período anterior à data é treino; a partir da data é validação. Não foram misturados jogos futuros no treino.";
  }
  function renderTable() {
    const start = page * PAGE_SIZE, rows = filtered.slice(start,start+PAGE_SIZE);
    $("matchesBody").replaceChildren();
    if (!rows.length) {
      const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=9;td.className="empty";td.textContent="Não existem jogos para os filtros selecionados.";tr.append(td);$("matchesBody").append(tr);
    } else rows.forEach(m=>{
      const tr=document.createElement("tr");
      const cells=[dateText(m.date),m.league,m.home+" – "+m.away,scoreText(m.ht),scoreText(m.secondHalf),scoreText(m.ft),scoreText(m.final),
        ["1","X","2"].map(k=>m.odds[k]===null?"—":fmt(m.odds[k],2)).join(" / ")];
      cells.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td);});
      const state=document.createElement("td");state.textContent=m.completed?"Concluído":"Pendente";if(!m.completed)state.className="pending";tr.append(state);$("matchesBody").append(tr);
    });
    const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
    $("tableInfo").textContent=filtered.length.toLocaleString("pt-PT")+" REGISTOS";
    $("pageLabel").textContent="Página "+(page+1)+" / "+pages;
    $("prevPage").disabled=page===0;$("nextPage").disabled=page>=pages-1;
  }
  async function loadDatabase() {
    $("status").textContent = "A ligar à base de dados histórica…";
    $("recordCount").textContent = "A carregar";
    try {
      const response = await fetch(CSV_URL, { method:"GET", mode:"cors", cache:"default" });
      if (!response.ok) throw new Error("A fonte respondeu com HTTP " + response.status + ".");
      $("status").textContent = "Base de dados recebida. A validar e a preparar os registos…";
      const csvText = await response.text();
      const raw = CSVOdds.parseCSV(csvText);
      const required = ["date_time","COUNTRY","LEAGUE","TEAM_HOME","TEAM_AWAY","odd_ft_1","odd_ft_x","odd_ft_2","score_ft_home","score_ft_away"];
      if (!raw.length || required.some(k => !(k in raw[0]))) throw new Error("A base de dados não contém todas as colunas necessárias, incluindo as três odds e o resultado FT.");
      allMatches = CSVOdds.normalizeRows(raw);
      fillFilters();
      $("workspace").hidden = false;
      $("recordCount").textContent = allMatches.length.toLocaleString("pt-PT");
      const completed = allMatches.filter(m=>m.completed).length;
      const completeOdds = allMatches.filter(m=>m.oddsComplete).length;
      const completeTriplets = allMatches.filter(m=>m.completed && m.oddsComplete).length;
      const mismatches = allMatches.filter(m=>m.completed && m.final[0]!==null && m.final[1]!==null && (m.ft[0]!==m.final[0] || m.ft[1]!==m.final[1])).length;
      $("status").textContent = "Base de dados carregada automaticamente: " + allMatches.length.toLocaleString("pt-PT") +
        " registos; " + completed.toLocaleString("pt-PT") + " com resultado FT; " +
        completeOdds.toLocaleString("pt-PT") + " com as três odds válidas; " +
        completeTriplets.toLocaleString("pt-PT") + " elegíveis para análise 1X2. Em " +
        mismatches.toLocaleString("pt-PT") + " jogos o resultado final da fonte difere do FT; o mercado 1X2 usa sempre o FT.";
      update();
    } catch (err) {
      allMatches=[]; $("workspace").hidden=true; $("recordCount").textContent="—";
      $("status").textContent = "Não foi possível carregar automaticamente a base de dados: " + err.message +
        " Confirma a ligação à internet ou se o ficheiro de origem continua disponível.";
    }
  }

  ["search","team"].forEach(id=>$(id).addEventListener("input",update));
  $("continent").addEventListener("change",()=>{updateCountryOptions();update();});
  ["country","league","from","to","statusFilter"].forEach(id=>$(id).addEventListener("change",update));
  ["min1","max1","minX","maxX","min2","max2"].forEach(id=>$(id).addEventListener("input",()=>{updateTriplet();renderMarketGroups("periodMarkets", CSVOdds.analyzePeriodMarkets(CSVOdds.filterOddsRanges(filtered, tripletRanges())));$("backtestStatus").textContent="Os intervalos foram alterados. Executa novamente o backtesting para atualizar a validação.";}));
  ["current1","currentX","current2","tolerance"].forEach(id=>$(id).addEventListener("input",updateCurrentOdds));
  $("runBacktest").addEventListener("click",runBacktest);
  $("clearFilters").addEventListener("click",()=>{
    ["search","continent","country","league","team","from","to"].forEach(id=>$(id).value="");
    $("statusFilter").value="all";
    updateCountryOptions();
    ["min1","max1","minX","maxX","min2","max2"].forEach(id=>$(id).value="");
    update();
  });
  $("prevPage").addEventListener("click",()=>{if(page>0){page--;renderTable();}});
  $("nextPage").addEventListener("click",()=>{if((page+1)*PAGE_SIZE<filtered.length){page++;renderTable();}});
  loadDatabase();
})();