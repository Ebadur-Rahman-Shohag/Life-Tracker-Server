import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCurrentStreak } from '../utils/streakUtils.js';
import { getDayStart, toDateKey } from '../utils/dateUtils.js';

function daysAgo(from, n) {
  const d = getDayStart(from);
  d.setDate(d.getDate() - n);
  return d;
}

test('computeCurrentStreak counts consecutive success days from today', () => {
  const today = getDayStart(new Date(2026, 5, 7));
  const successDateKeys = new Set([
    toDateKey(today),
    toDateKey(daysAgo(today, 1)),
    toDateKey(daysAgo(today, 2)),
  ]);

  const streak = computeCurrentStreak(
    (date) => successDateKeys.has(toDateKey(date)),
    today
  );

  assert.equal(streak, 3);
});

test('computeCurrentStreak stops at first missed day', () => {
  const today = getDayStart(new Date(2026, 5, 7));
  const successDateKeys = new Set([
    toDateKey(today),
    toDateKey(daysAgo(today, 2)),
  ]);

  const streak = computeCurrentStreak(
    (date) => successDateKeys.has(toDateKey(date)),
    today
  );

  assert.equal(streak, 1);
});

test('computeCurrentStreak returns zero when today is not a success day', () => {
  const today = getDayStart(new Date(2026, 5, 7));
  const successDateKeys = new Set([
    toDateKey(daysAgo(today, 1)),
    toDateKey(daysAgo(today, 2)),
  ]);

  const streak = computeCurrentStreak(
    (date) => successDateKeys.has(toDateKey(date)),
    today
  );

  assert.equal(streak, 0);
});
