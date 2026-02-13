import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import PrayerEntry, { PRAYER_TYPES } from '../models/PrayerEntry.js';

const router = express.Router();
router.use(protect);

// Middleware to prevent caching for GET requests
router.use((req, res, next) => {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Helper to normalize date to start of day (UTC)
function normalizeDate(date) {
  const d = new Date(date);
  // Use UTC methods to avoid timezone issues
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function getDatesBetween(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// GET /api/prayers/entries - Get prayer entries for date range
router.get(
  '/entries',
  [
    query('startDate').isISO8601().withMessage('startDate is required'),
    query('endDate').isISO8601().withMessage('endDate is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const startDate = normalizeDate(req.query.startDate);
      const endDate = normalizeDate(req.query.endDate);
      endDate.setHours(23, 59, 59, 999);

      const entries = await PrayerEntry.find({
        userId: req.user._id,
        date: { $gte: startDate, $lte: endDate },
        prayed: true,
      }).lean();

      res.json(entries);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// POST /api/prayers/toggle - Toggle prayer for a date
router.post(
  '/toggle',
  [
    body('prayerType').isIn(PRAYER_TYPES).withMessage('Valid prayerType is required'),
    body('date').isISO8601().withMessage('Valid date is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { prayerType, date } = req.body;
      const normalizedDate = normalizeDate(date);

      const existing = await PrayerEntry.findOne({
        userId: req.user._id,
        date: normalizedDate,
        prayerType,
      });

      if (existing) {
        if (existing.prayed) {
          await PrayerEntry.findByIdAndDelete(existing._id);
          res.json({ prayed: false, prayerType, date: normalizedDate });
        } else {
          existing.prayed = true;
          await existing.save();
          res.json({ prayed: true, prayerType, date: normalizedDate, entry: existing });
        }
      } else {
        const entry = await PrayerEntry.create({
          userId: req.user._id,
          date: normalizedDate,
          prayerType,
          prayed: true,
        });
        res.json({ prayed: true, prayerType, date: normalizedDate, entry });
      }
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// GET /api/prayers/stats/daily - Get daily stats for date range
router.get(
  '/stats/daily',
  [
    query('startDate').isISO8601().withMessage('startDate is required'),
    query('endDate').isISO8601().withMessage('endDate is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const startDate = normalizeDate(req.query.startDate);
      const endDate = normalizeDate(req.query.endDate);
      const endDateQuery = new Date(endDate);
      endDateQuery.setHours(23, 59, 59, 999);

      const entries = await PrayerEntry.find({
        userId: req.user._id,
        date: { $gte: startDate, $lte: endDateQuery },
        prayed: true,
      }).lean();

      const entriesByDate = new Map();
      entries.forEach((e) => {
        const dateKey = normalizeDate(e.date).toISOString();
        if (!entriesByDate.has(dateKey)) {
          entriesByDate.set(dateKey, new Set());
        }
        entriesByDate.get(dateKey).add(e.prayerType);
      });

      const dates = getDatesBetween(startDate, endDate);
      const days = dates.map((date) => {
        const dateKey = normalizeDate(date).toISOString();
        const prayed = entriesByDate.get(dateKey) || new Set();
        const prayerStatuses = {};
        PRAYER_TYPES.forEach((p) => {
          prayerStatuses[p] = prayed.has(p);
        });
        const completedCount = prayed.size;

        return {
          date: new Date(dateKey),
          completedCount,
          totalPrayers: 5,
          percentage: Math.round((completedCount / 5) * 100),
          isSuccessDay: completedCount === 5,
          prayerStatuses,
        };
      });

      res.json({ days });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// GET /api/prayers/stats/streak - Get streak info
router.get('/stats/streak', async (req, res) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 400);
    startDate.setHours(0, 0, 0, 0);

    const entries = await PrayerEntry.find({
      userId: req.user._id,
      date: { $gte: startDate },
      prayed: true,
    }).lean();

    const entriesByDate = new Map();
    entries.forEach((e) => {
      const dateKey = normalizeDate(e.date).toISOString();
      if (!entriesByDate.has(dateKey)) {
        entriesByDate.set(dateKey, new Set());
      }
      entriesByDate.get(dateKey).add(e.prayerType);
    });

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkDate = new Date(today);
    let streakBroken = false;

    for (let i = 0; i < 400; i++) {
      const dateKey = normalizeDate(checkDate).toISOString();
      const prayed = entriesByDate.get(dateKey)?.size || 0;
      const isSuccess = prayed === 5;

      if (isSuccess) {
        tempStreak++;
        if (!streakBroken) {
          currentStreak++;
        }
      } else {
        streakBroken = true;
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
        tempStreak = 0;
      }

      checkDate.setDate(checkDate.getDate() - 1);
    }

    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }

    const MILESTONES = [7, 30, 50, 75, 100, 150, 200, 365];
    const milestones = MILESTONES.map((m) => ({
      days: m,
      achieved: longestStreak >= m,
    }));

    res.json({ currentStreak, longestStreak, milestones });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/prayers/stats/monthly - Get monthly overview for a year
router.get(
  '/stats/monthly',
  [query('year').isInt({ min: 2000, max: 2100 }).withMessage('Valid year is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const year = parseInt(req.query.year);
      const months = [];

      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const effectiveEndDate = endDate > today ? today : endDate;

        if (startDate > today) {
          months.push({ month: month + 1, successDays: 0, totalDays: 0, percentage: 0 });
          continue;
        }

        const entries = await PrayerEntry.find({
          userId: req.user._id,
          date: { $gte: startDate, $lte: effectiveEndDate },
          prayed: true,
        }).lean();

        const entriesByDate = new Map();
        entries.forEach((e) => {
          const dateKey = normalizeDate(e.date).toISOString();
          if (!entriesByDate.has(dateKey)) {
            entriesByDate.set(dateKey, new Set());
          }
          entriesByDate.get(dateKey).add(e.prayerType);
        });

        let successDays = 0;
        const dates = getDatesBetween(startDate, effectiveEndDate);

        dates.forEach((date) => {
          const dateKey = normalizeDate(date).toISOString();
          const prayed = entriesByDate.get(dateKey)?.size || 0;
          if (prayed === 5) successDays++;
        });

        const totalDays = dates.length;
        const percentage = totalDays > 0 ? Math.round((successDays / totalDays) * 100) : 0;

        months.push({
          month: month + 1,
          successDays,
          totalDays,
          percentage,
        });
      }

      res.json({ year, months });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

export default router;
