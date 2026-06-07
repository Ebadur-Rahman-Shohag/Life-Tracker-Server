import Project from '../models/Project.js';
import Habit from '../models/Habit.js';
import HabitEntry from '../models/HabitEntry.js';
import PrayerEntry, { PRAYER_TYPES } from '../models/PrayerEntry.js';
import Note from '../models/Note.js';
import NoteCategory from '../models/NoteCategory.js';
import Reference from '../models/Reference.js';
import { getBudgetDashboardTotals } from '../utils/budgetTotals.js';
import { getTodayTaskCounts } from '../utils/todayTasks.js';
import {
  getDayEnd,
  getDayStart,
  getDatesBetween,
  getMonthEnd,
  getMonthStart,
  getWeekStart,
  normalizeDate,
  toDateKey,
} from '../utils/dateUtils.js';
import { buildEntriesByDate, computeCurrentStreak } from '../utils/streakUtils.js';

const HABIT_SUCCESS_THRESHOLD = 75;
const TOTAL_DAILY_PRAYERS = 5;
/** Dashboard-only streak cap — full tracker pages use 400-day lookback. */
const DASHBOARD_STREAK_LOOKBACK_DAYS = 90;

function getStreakStartDate(today, weekStart, lookbackDays = DASHBOARD_STREAK_LOOKBACK_DAYS) {
  const streakStart = getDayStart(today);
  streakStart.setDate(streakStart.getDate() - lookbackDays);
  return streakStart < weekStart ? streakStart : weekStart;
}

async function getHabitsSummary(userId, weekStart, weekEnd, today) {
  const habits = await Habit.find({ userId, isActive: true }).sort({ order: 1 }).lean();
  const activeCount = habits.length;

  if (activeCount === 0) {
    return {
      activeCount: 0,
      todayPercentage: 0,
      currentStreak: 0,
      weekTrend: [],
    };
  }

  const queryStart = getStreakStartDate(today, weekStart);
  const endDateQuery = getDayEnd(weekEnd);

  const entries = await HabitEntry.find({
    userId,
    date: { $gte: queryStart, $lte: endDateQuery },
  }).lean();

  const entriesByDate = buildEntriesByDate(entries, (e) => e.habitId.toString());

  const todayKey = toDateKey(today);
  const todayCompleted = entriesByDate.get(todayKey)?.size || 0;
  const todayPercentage = Math.round((todayCompleted / activeCount) * 100);

  const weekDates = getDatesBetween(weekStart, weekEnd);
  const weekTrend = weekDates.map((date) => {
    const dateKey = toDateKey(date);
    const completedCount = entriesByDate.get(dateKey)?.size || 0;
    return {
      date: normalizeDate(date),
      percentage: Math.round((completedCount / activeCount) * 100),
    };
  });

  const isSuccessDay = (date) => {
    const completedCount = entriesByDate.get(toDateKey(date))?.size || 0;
    return (completedCount / activeCount) * 100 >= HABIT_SUCCESS_THRESHOLD;
  };

  const currentStreak = computeCurrentStreak(isSuccessDay, today);

  return { activeCount, todayPercentage, currentStreak, weekTrend };
}

async function getPrayersSummary(userId, weekStart, weekEnd, today) {
  const queryStart = getStreakStartDate(today, weekStart);
  const endDateQuery = getDayEnd(weekEnd);

  const entries = await PrayerEntry.find({
    userId,
    date: { $gte: queryStart, $lte: endDateQuery },
    prayed: true,
  }).lean();

  const entriesByDate = buildEntriesByDate(entries, (e) => e.prayerType);

  const todayKey = toDateKey(today);
  const todayPrayed = entriesByDate.get(todayKey) || new Set();
  const todayPrayers = {};
  for (const prayerType of PRAYER_TYPES) {
    todayPrayers[prayerType] = todayPrayed.has(prayerType);
  }

  const weekDates = getDatesBetween(weekStart, weekEnd);
  const weekTrend = weekDates.map((date) => {
    const prayed = entriesByDate.get(toDateKey(date))?.size || 0;
    return {
      date: normalizeDate(date),
      percentage: Math.round((prayed / TOTAL_DAILY_PRAYERS) * 100),
    };
  });

  const isSuccessDay = (date) => (entriesByDate.get(toDateKey(date))?.size || 0) === TOTAL_DAILY_PRAYERS;
  const currentStreak = computeCurrentStreak(isSuccessDay, today);

  return { todayPrayers, currentStreak, weekTrend };
}

async function getNotesSummary(userId) {
  const [favorites, archived, totalActive, activeCategories, noteCategoryGroups] = await Promise.all([
    Note.countDocuments({ userId, archived: false, isFavorite: true }),
    Note.countDocuments({ userId, archived: true }),
    Note.countDocuments({ userId, archived: false }),
    NoteCategory.find({ userId, isActive: true }).select('name').lean(),
    Note.aggregate([
      { $match: { userId, archived: false } },
      { $group: { _id: '$category' } },
    ]),
  ]);

  const managedNames = new Set(activeCategories.map((c) => c.name));
  const distinctNoteCategories = noteCategoryGroups.map((c) => c._id || 'Uncategorized');
  const unmanagedCount = distinctNoteCategories.filter(
    (name) => !managedNames.has(name) && name !== 'Uncategorized'
  ).length;

  return {
    totalActive,
    favorites,
    archived,
    categoryCount: activeCategories.length + unmanagedCount,
  };
}

async function getReferencesSummary(userId) {
  const [total, favorites, withProjects] = await Promise.all([
    Reference.countDocuments({ userId }),
    Reference.countDocuments({ userId, isFavorite: true }),
    Reference.countDocuments({ userId, 'projectIds.0': { $exists: true } }),
  ]);

  return { total, favorites, withProjects };
}

export async function getDashboardSummary(userId) {
  const today = getDayStart();
  const weekStart = getWeekStart(today);
  const weekEnd = getDayEnd(today);
  const monthStart = getMonthStart(today);
  const monthEnd = getMonthEnd(today);

  const [tasks, projectsCount, habits, prayers, budget, notes, references] = await Promise.all([
    getTodayTaskCounts(userId, today),
    Project.countDocuments({ userId, archived: false, parentId: null }),
    getHabitsSummary(userId, weekStart, weekEnd, today),
    getPrayersSummary(userId, weekStart, weekEnd, today),
    getBudgetDashboardTotals(userId, monthStart, monthEnd),
    getNotesSummary(userId),
    getReferencesSummary(userId),
  ]);

  return {
    tasks: {
      todayCompleted: tasks.todayCompleted,
      todayTotal: tasks.todayTotal,
      projectsCount,
    },
    habits,
    prayers,
    budget,
    notes,
    references,
  };
}
