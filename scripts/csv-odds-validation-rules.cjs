"use strict";

function getValidationErrors(metrics) {
  const errors = [];
  if (metrics.missingHeaders?.length) errors.push("Cabeçalhos obrigatórios em falta: " + metrics.missingHeaders.join(", "));
  if (metrics.invalidDate > 0) errors.push("Datas inválidas: " + metrics.invalidDate);
  if (metrics.noTeams > 0) errors.push("Registos sem as duas equipas: " + metrics.noTeams);
  if (metrics.duplicateRows > 0) errors.push("Jogos duplicados: " + metrics.duplicateRows);
  if (metrics.oddsOutOfRange > 0) errors.push("Odds fora do intervalo permitido: " + metrics.oddsOutOfRange);
  return errors;
}

module.exports = { getValidationErrors };
