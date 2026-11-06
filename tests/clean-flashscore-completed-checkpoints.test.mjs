import test from "node:test";
import assert from "node:assert/strict";
import { cleanCompletedCheckpoints } from "../scripts/clean-flashscore-completed-checkpoints.mjs";

const catalog = { competitions: [
  { country_name:"Asia", competition_name:"AFC Champions League", url:"https://www.flashscore.pt/futebol/asia/afc-liga-dos-campeoes/" },
  { country_name:"Portugal", competition_name:"Liga Portugal", url:"https://www.flashscore.pt/futebol/portugal/liga-portugal/" }
] };

test("remove globalmente checkpoints sem qualquer registo estatístico", () => {
  const result = cleanCompletedCheckpoints({
    catalog,
    stats: [{ country:"Portugal", competition:"Liga Portugal", score_home:"1" }],
    checkpoint: { completed_paths:["/futebol/asia/afc-liga-dos-campeoes/","/futebol/portugal/liga-portugal/"] }
  });
  assert.deepEqual(result.removed, ["/futebol/asia/afc-liga-dos-campeoes/"]);
  assert.deepEqual(result.checkpoint.completed_paths, ["/futebol/portugal/liga-portugal/"]);
});

test("não remove checkpoints com registos existentes e não duplica caminhos", () => {
  const result = cleanCompletedCheckpoints({
    catalog,
    stats: [{ country:"Portugal", competition:"Liga Portugal" }],
    checkpoint: { completed_paths:["/futebol/portugal/liga-portugal/","/futebol/portugal/liga-portugal/"] }
  });
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.checkpoint.completed_paths, ["/futebol/portugal/liga-portugal/"]);
});
