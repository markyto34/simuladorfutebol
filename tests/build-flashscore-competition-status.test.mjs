import test from "node:test";
import assert from "node:assert/strict";
import { buildCompetitionStatus } from "../scripts/build-flashscore-competition-status.mjs";

const item = { country_name:"Portugal", competition_name:"Liga Portugal", url:"https://www.flashscore.pt/futebol/portugal/liga-portugal/" };
const fullRow = Object.fromEntries([
  ["country","Portugal"],["competition","Liga Portugal"],
  ...["score_home","score_away","ht_home","ht_away","sh_home","sh_away",
    "xg_home","xg_away","possession_home","possession_away","shots_home","shots_away",
    "shots_on_target_home","shots_on_target_away","big_chances_home","big_chances_away",
    "corners_home","corners_away","corners_ht_home","corners_ht_away","corners_st_home","corners_st_away",
    "yellow_cards_home","yellow_cards_away","red_cards_home","red_cards_away","shots_off_target_home","shots_off_target_away",
    "blocked_shots_home","blocked_shots_away","shots_inside_box_home","shots_inside_box_away",
    "shots_outside_box_home","shots_outside_box_away","offsides_home","offsides_away","fouls_home","fouls_away"
  ].map(key=>[key,"1"])
]);

test("classifica como completa apenas quando todos os indicadores estão preenchidos",()=>{
  const result=buildCompetitionStatus({catalog:{competitions:[item]},stats:[fullRow],checkpoint:{completed_paths:[]}});
  assert.equal(result.status_by_path["/futebol/portugal/liga-portugal/"].status,"complete");
});
test("classifica estatísticas parciais e mantém a informação do checkpoint",()=>{
  const row={...fullRow,red_cards_home:""};
  const result=buildCompetitionStatus({catalog:{competitions:[item]},stats:[row],checkpoint:{completed_paths:["/futebol/portugal/liga-portugal/"]}});
  const status=result.status_by_path["/futebol/portugal/liga-portugal/"];
  assert.equal(status.status,"partial");
  assert.equal(status.checkpoint_completed,true);
  assert.equal(status.metric_coverage.red_cards_home.pct,0);
});
test("competições sem registos ficam como novas",()=>{
  const result=buildCompetitionStatus({catalog:{competitions:[item]},stats:[],checkpoint:{completed_paths:[]}});
  assert.equal(result.status_by_path["/futebol/portugal/liga-portugal/"].status,"new");
});
