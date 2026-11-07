import test from "node:test";
import assert from "node:assert/strict";
import { REQUIRED_PAIRS, REQUIRED_SCORE_FIELDS, selectRowsNeedingSelectedIndicators } from "../scripts/backfill-flashscore-selected-indicators.mjs";

const selected = new Set(["portugal|primeira liga"]);
const row = (match_id, extra = {}) => ({
  match_id, date_time: "2026-11-01T15:00:00", country: "Portugal", competition: "Primeira Liga", status: "Terminado",
  score_home: "2", score_away: "1", ht_home: "1", ht_away: "0", sh_home: "1", sh_away: "1",
  ...Object.fromEntries(REQUIRED_PAIRS.flatMap(key => [[key + "_home", "3"], [key + "_away", "2"]])),
  ...extra
});

test("seleciona apenas jogos das competições escolhidas com um dos campos escolhidos em falta", () => {
  const rows = [
    row("match01", { shots_home: "" }),
    row("match02", { red_cards_away: "" }),
    row("match03", { xg_home: "" }),
    row("match04", { country: "Espanha", competition: "LaLiga", fouls_home: "" }),
    row("match05", { ht_home: "" }),
    row("match06", { score_home: "", score_away: "", status: "Terminado" }),
    row("match07"),
    row("match08", { score_home: "0", score_away: "0", shots_home: "" })
  ];
  assert.deepEqual(
    selectRowsNeedingSelectedIndicators(rows, "2026-11-01", "2026-11-01", selected).map(item => item.match_id),
    ["match01", "match02", "match05", "match08"]
  );
});

test("não seleciona jogos sem resultado final, fora do intervalo ou já tentados", () => {
  const rows = [
    row("match01", { score_home: "" }),
    row("match02", { shots_home: "" }),
    row("match03", { shots_home: "" })
  ];
  assert.deepEqual(
    selectRowsNeedingSelectedIndicators(rows, "2026-11-02", "2026-11-03", selected, ["match03"]).map(item => item.match_id),
    []
  );
});

test("a lista de campos de resultado inclui FT, HT e ST", () => {
  assert.deepEqual(REQUIRED_SCORE_FIELDS, ["score_home", "score_away", "ht_home", "ht_away", "sh_home", "sh_away"]);
});
