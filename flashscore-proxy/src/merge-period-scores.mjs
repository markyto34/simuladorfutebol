export function mergeValidatedPeriodScores(record, summaryRecord) {
  const summaryScore = summaryRecord?.score;
  const statsFullTime = record?.score?.full_time;
  const summaryFullTime = summaryScore?.full_time;

  if (!summaryScore?.half_time || !summaryScore?.second_half || !summaryFullTime) return false;

  const sameFullTime = !statsFullTime || (
    statsFullTime.home === summaryFullTime.home &&
    statsFullTime.away === summaryFullTime.away
  );
  if (!sameFullTime) return false;

  record.score = {
    ...(record.score || {}),
    half_time: summaryScore.half_time,
    second_half: summaryScore.second_half,
    ...(summaryScore.extra_time ? { extra_time: summaryScore.extra_time } : {}),
    full_time: statsFullTime || summaryFullTime
  };
  record.missing_fields = (record.missing_fields || []).filter(field => field !== "score_full_time");
  return true;
}
