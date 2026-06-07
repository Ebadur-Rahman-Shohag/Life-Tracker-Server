import { getDayStart, toDateKey } from './dateUtils.js';

const STREAK_LOOKBACK_DAYS = 400;

/**
 * Count consecutive success days backward from today (inclusive).
 * @param {(date: Date) => boolean} isSuccessDay
 */
export function computeCurrentStreak(isSuccessDay, today = new Date(), maxDays = STREAK_LOOKBACK_DAYS) {
  let currentStreak = 0;
  const checkDate = getDayStart(today);

  for (let i = 0; i < maxDays; i++) {
    if (isSuccessDay(checkDate)) {
      currentStreak++;
    } else {
      break;
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return currentStreak;
}

/** Build Map<dateKey, Set<id>> from entries with date + id fields. */
export function buildEntriesByDate(entries, getId) {
  const map = new Map();
  for (const entry of entries) {
    const dateKey = toDateKey(entry.date);
    if (!map.has(dateKey)) map.set(dateKey, new Set());
    map.get(dateKey).add(getId(entry));
  }
  return map;
}

export { STREAK_LOOKBACK_DAYS };
