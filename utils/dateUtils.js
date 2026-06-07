export function normalizeDate(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function getDayStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function getDayEnd(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function getDatesBetween(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/** Monday of the current week (local time). */
export function getWeekStart(d = new Date()) {
  const today = getDayStart(d);
  const dayOfWeek = today.getDay();
  const weekStart = new Date(today);
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(today.getDate() + diff);
  return weekStart;
}

export function getMonthStart(d = new Date()) {
  const today = getDayStart(d);
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

export function getMonthEnd(d = new Date()) {
  const today = getDayStart(d);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function toDateKey(date) {
  return normalizeDate(date).toISOString();
}
