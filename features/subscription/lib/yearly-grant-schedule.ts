export interface YearlyPercoinGrantState {
  lastPercoinGrantAt: string | null;
  nextPercoinGrantAt: string | null;
}

function addOneMonth(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const milliseconds = date.getUTCMilliseconds();
  const targetMonthIndex = month + 1;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(day, lastDayOfTargetMonth),
      hours,
      minutes,
      seconds,
      milliseconds
    )
  ).toISOString();
}

export function createYearlyPercoinGrantState(params: {
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}): YearlyPercoinGrantState {
  if (!params.currentPeriodStart) {
    return {
      lastPercoinGrantAt: null,
      nextPercoinGrantAt: null,
    };
  }

  const nextGrantAt = addOneMonth(params.currentPeriodStart);
  const isNextGrantWithinPeriod =
    !params.currentPeriodEnd ||
    new Date(nextGrantAt).getTime() < new Date(params.currentPeriodEnd).getTime();

  return {
    lastPercoinGrantAt: params.currentPeriodStart,
    nextPercoinGrantAt: isNextGrantWithinPeriod ? nextGrantAt : null,
  };
}
