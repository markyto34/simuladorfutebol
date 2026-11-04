import test from "node:test";
import assert from "node:assert/strict";
import { validateHistory } from "../scripts/validate-flashscore-history.mjs";

const categories = ["xg","possession","shots","shots_on_target","big_chances","corners","yellow_cards","shots_off_target","blocked_shots","shots_inside_box","shots_outside_box","offsides","fouls"];
function statsRow(overrides = {}) {
  const row = {
    match_id:"abc123",date_time:"2026-11-01T12:00",country:"PORTUGAL",competition:"Primeira Liga",
    home_team:"A",away_team:"B",status:"Terminado",score_home:"2",score_away:"1",
    source:"Flashscore",source_url:"https://m.flashscore.pt/jogo/abc123/",retrieved_at:"2026-11-04T07:00:00Z"
  };
  for (const key of categories) { row[key+"_home"]="1"; row[key+"_away"]="2"; }
  return { ...row, ...overrides };
}
function oddsRow(overrides = {}) {
  return {
    match_id:"abc123",date_time:"2026-11-01T12:00",country:"PORTUGAL",competition:"Primeira Liga",
    home_team:"A",away_team:"B",bookmaker:"Bwin",market:"1X2",odd_1:"2.1",odd_x:"3.2",odd_2:"3.5",
    odds_timestamp_type:"observed_at_collection",retrieved_at:"2026-11-04T07:00:00Z",
    source:"Flashscore",source_url:"https://m.flashscore.pt/jogo/abc123/",...overrides
  };
}

test("valida CSV completo e devolve cobertura real sem exigir todas as estatísticas", () => {
  const stats = statsRow({ xg_home:"",xg_away:"", blocked_shots_home:"",blocked_shots_away:"" });
  const summary = validateHistory([stats], [oddsRow()]);
  assert.equal(summary.statisticsRows,1);
  assert.equal(summary.withScore,1);
  assert.equal(summary.withXg,0);
  assert.equal(summary.withCorners,1);
  assert.equal(summary.all13,0);
});

test("rejeita país ou competição em falta", () => {
  assert.throws(() => validateHistory([statsRow({ country:"" })],[oddsRow()]),/País\/competição em falta/);
  assert.throws(() => validateHistory([statsRow()],[oddsRow({ competition:"" })]),/País\/competição em falta/);
});

test("rejeita finalizados sem resultado e pares de resultado incompletos", () => {
  assert.throws(() => validateHistory([statsRow({ score_home:"",score_away:"" })],[oddsRow()]),/finalizado sem resultado/);
  assert.throws(() => validateHistory([statsRow({ score_home:"2",score_away:"" })],[oddsRow()]),/Resultado parcial/);
});

test("aceita zeros reais e rejeita estatísticas não numéricas, negativas ou posse acima de 100", () => {
  assert.doesNotThrow(() => validateHistory([statsRow({ corners_home:"0",corners_away:"0",xg_home:"0",xg_away:"0" })],[oddsRow()]));
  assert.throws(() => validateHistory([statsRow({ shots_home:"N/D" })],[oddsRow()]),/Valor estatístico inválido/);
  assert.throws(() => validateHistory([statsRow({ fouls_away:"-1" })],[oddsRow()]),/Valor estatístico inválido/);
  assert.throws(() => validateHistory([statsRow({ possession_home:"101" })],[oddsRow()]),/Valor estatístico inválido/);
});

test("rejeita odds fora da Bwin 1X2 e odds duplicadas", () => {
  assert.throws(() => validateHistory([statsRow()],[oddsRow({bookmaker:"Betano"})]),/fora do âmbito/);
  assert.throws(() => validateHistory([statsRow()],[oddsRow(),oddsRow()]),/duplicado de odds/);
});

test("identifica competições com cinco ou mais jogos sem qualquer xG", () => {
  const rows = Array.from({ length: 5 }, (_, i) => statsRow({
    match_id: "missxg" + i,
    xg_home: "",
    xg_away: ""
  }));
  const summary = validateHistory(rows, [oddsRow()]);
  assert.deepEqual(summary.xgMissingCompetitions, [
    { competition: "PORTUGAL | Primeira Liga", matches: 5, withXg: 0 }
  ]);
});


test("valida cartões vermelhos e resultados HT/ST quando as novas colunas existem", () => {
  const row = statsRow({
    ht_home:"1", ht_away:"0", sh_home:"1", sh_away:"1",
    red_cards_home:"0", red_cards_away:"1"
  });
  assert.doesNotThrow(() => validateHistory([row],[oddsRow()]));
  assert.throws(() => validateHistory([{
    ...row, sh_home:"0", sh_away:""
  }],[oddsRow()]), /Resultado por partes incompleto/);
  assert.throws(() => validateHistory([{
    ...row, sh_home:"0", sh_away:"1"
  }],[oddsRow()]), /não corresponde ao resultado FT/);
  assert.throws(() => validateHistory([{
    ...row, red_cards_home:"-1"
  }],[oddsRow()]), /Valor estatístico inválido/);
});
