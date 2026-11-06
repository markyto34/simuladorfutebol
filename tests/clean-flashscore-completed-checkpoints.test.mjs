import test from "node:test";
import assert from "node:assert/strict";
import { resetCompletedCheckpoints } from "../scripts/clean-flashscore-completed-checkpoints.mjs";

test("invalida globalmente todos os checkpoints antigos sem tocar nos restantes dados", () => {
  const checkpoint = {
    version:1,
    source_run_id:"legacy-run",
    completed_paths:["/futebol/asia/afc-liga-dos-campeoes/","/futebol/portugal/liga-portugal/"]
  };
  const result = resetCompletedCheckpoints({ checkpoint });
  assert.deepEqual(result.removed, [
    "/futebol/asia/afc-liga-dos-campeoes/",
    "/futebol/portugal/liga-portugal/"
  ]);
  assert.deepEqual(result.checkpoint.completed_paths, []);
  assert.equal(result.checkpoint.source_run_id, "legacy-run");
});
