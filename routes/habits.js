import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import Habit from '../models/Habit.js';
import HabitEntry from '../models/HabitEntry.js';
import Streak from '../models/Streak.js';

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

// Helper to normalize date to start of day
function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Helper to get all dates between two dates
function getDatesBetween(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ============ HABITS CRUD ============

// GET /api/habits - List all habits for user
router.get('/', async (req, res) => {
  try {
    const filter = { userId: req.user._id };
    if (req.query.activeOnly === 'true') {
      filter.isActive = true;
    }
    const habits = await Habit.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    res.json(habits);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/habits - Create a new habit
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('icon').optional().trim(),
    body('order').optional().isInt(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { name, icon, order } = req.body;
      
      // Get max order if not provided
      let habitOrder = order;
      if (habitOrder === undefined) {
        const maxOrderHabit = await Habit.findOne({ userId: req.user._id }).sort({ order: -1 });
        habitOrder = maxOrderHabit ? maxOrderHabit.order + 1 : 0;
      }

      const habit = await Habit.create({
        userId: req.user._id,
        name: name.trim(),
        icon: icon || '✓',
        order: habitOrder,
      });
      res.status(201).json(habit);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// PUT /api/habits/reorder - Bulk reorder habits (MUST be before /:id)
router.put('/reorder', async (req, res) => {
  try {
    const { habitIds } = req.body;
    if (!Array.isArray(habitIds)) {
      return res.status(400).json({ message: 'habitIds must be an array' });
    }

    const bulkOps = habitIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, userId: req.user._id },
        update: { order: index },
      },
    }));

    await Habit.bulkWrite(bulkOps);
    const habits = await Habit.find({ userId: req.user._id }).sort({ order: 1 }).lean();
    res.json(habits);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/habits/:id - Update habit
router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('icon').optional().trim(),
    body('order').optional().isInt(),
    body('isActive').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const habit = await Habit.findOne({ _id: req.params.id, userId: req.user._id });
      if (!habit) return res.status(404).json({ message: 'Habit not found' });

      if (req.body.name !== undefined) habit.name = req.body.name;
      if (req.body.icon !== undefined) habit.icon = req.body.icon;
      if (req.body.order !== undefined) habit.order = req.body.order;
      if (req.body.isActive !== undefined) habit.isActive = req.body.isActive;

      await habit.save();
      res.json(habit);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// DELETE /api/habits/:id - Delete habit (and its entries)
router.delete('/:id', async (req, res) => {
  try {
    const habit = await Habit.findOne({ _id: req.params.id, userId: req.user._id });
    if (!habit) return res.status(404).json({ message: 'Habit not found' });

    // Delete all entries for this habit
    await HabitEntry.deleteMany({ habitId: req.params.id });
    await Habit.findByIdAndDelete(req.params.id);

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ============ HABIT ENTRIES ============

// GET /api/habits/entries - Get entries for date range
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

      const entries = await HabitEntry.find({
        userId: req.user._id,
        date: { $gte: startDate, $lte: endDate },
      }).lean();

      res.json(entries);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// POST /api/habits/entries/toggle - Toggle habit entry for a date
router.post(
  '/entries/toggle',
  [
    body('habitId').isMongoId().withMessage('Valid habitId is required'),
    body('date').isISO8601().withMessage('Valid date is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { habitId, date } = req.body;
      const normalizedDate = normalizeDate(date);

      // Verify habit belongs to user
      const habit = await Habit.findOne({ _id: habitId, userId: req.user._id });
      if (!habit) return res.status(404).json({ message: 'Habit not found' });

      // Check if entry exists
      const existingEntry = await HabitEntry.findOne({
        userId: req.user._id,
        habitId,
        date: normalizedDate,
      });

      if (existingEntry) {
        // Delete entry (toggle off)
        await HabitEntry.findByIdAndDelete(existingEntry._id);
        res.json({ completed: false, habitId, date: normalizedDate });
      } else {
        // Create entry (toggle on)
        const entry = await HabitEntry.create({
          userId: req.user._id,
          habitId,
          date: normalizedDate,
          completed: true,
        });
        res.json({ completed: true, habitId, date: normalizedDate, entry });
      }
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// ============ STATS ============

// GET /api/habits/stats/daily - Get daily stats for a date range
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

      // Get all active habits
      const habits = await Habit.find({ userId: req.user._id, isActive: true }).sort({ order: 1 }).lean();
      const totalHabits = habits.length;

      if (totalHabits === 0) {
        return res.json({ days: [], habits: [] });
      }

      // Get entries for date range
      const endDateQuery = new Date(endDate);
      endDateQuery.setHours(23, 59, 59, 999);
      
      const entries = await HabitEntry.find({
        userId: req.user._id,
        date: { $gte: startDate, $lte: endDateQuery },
      }).lean();

      // Build entry lookup map
      const entryMap = new Map();
      entries.forEach((e) => {
        const key = `${e.habitId.toString()}_${normalizeDate(e.date).toISOString()}`;
        entryMap.set(key, e);
      });

      // Calculate daily stats
      const dates = getDatesBetween(startDate, endDate);
      const days = dates.map((date) => {
        const normalizedDate = normalizeDate(date);
        let completedCount = 0;
        const habitStatuses = {};

        habits.forEach((habit) => {
          const key = `${habit._id.toString()}_${normalizedDate.toISOString()}`;
          const completed = entryMap.has(key);
          habitStatuses[habit._id.toString()] = completed;
          if (completed) completedCount++;
        });

        const percentage = Math.round((completedCount / totalHabits) * 100);
        const isSuccessDay = percentage >= 75;

        return {
          date: normalizedDate,
          completedCount,
          totalHabits,
          percentage,
          isSuccessDay,
          habitStatuses,
        };
      });

      res.json({ days, habits });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// GET /api/habits/stats/monthly - Get monthly overview
router.get(
  '/stats/monthly',
  [query('year').isInt({ min: 2000, max: 2100 }).withMessage('Valid year is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const year = parseInt(req.query.year);
      const habits = await Habit.find({ userId: req.user._id, isActive: true }).lean();
      const totalHabits = habits.length;

      if (totalHabits === 0) {
        return res.json({ months: Array(12).fill({ successDays: 0, totalDays: 0, percentage: 0 }) });
      }

      const months = [];

      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0); // Last day of month
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Don't count future days
        const effectiveEndDate = endDate > today ? today : endDate;
        
        if (startDate > today) {
          // Future month
          months.push({ month: month + 1, successDays: 0, totalDays: 0, percentage: 0 });
          continue;
        }

        const entries = await HabitEntry.find({
          userId: req.user._id,
          date: { $gte: startDate, $lte: effectiveEndDate },
        }).lean();

        // Group entries by date
        const entriesByDate = new Map();
        entries.forEach((e) => {
          const dateKey = normalizeDate(e.date).toISOString();
          if (!entriesByDate.has(dateKey)) {
            entriesByDate.set(dateKey, new Set());
          }
          entriesByDate.get(dateKey).add(e.habitId.toString());
        });

        // Count success days
        let successDays = 0;
        const dates = getDatesBetween(startDate, effectiveEndDate);
        
        dates.forEach((date) => {
          const dateKey = normalizeDate(date).toISOString();
          const completedHabits = entriesByDate.get(dateKey)?.size || 0;
          const percentage = (completedHabits / totalHabits) * 100;
          if (percentage >= 75) successDays++;
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

// GET /api/habits/stats/streak - Get current streak info
router.get('/stats/streak', async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user._id, isActive: true }).lean();
    const totalHabits = habits.length;

    if (totalHabits === 0) {
      return res.json({ currentStreak: 0, longestStreak: 0, milestones: [] });
    }

    // Get all entries (last 400 days should be enough)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 400);
    startDate.setHours(0, 0, 0, 0);

    const entries = await HabitEntry.find({
      userId: req.user._id,
      date: { $gte: startDate },
    }).lean();

    // Group entries by date
    const entriesByDate = new Map();
    entries.forEach((e) => {
      const dateKey = normalizeDate(e.date).toISOString();
      if (!entriesByDate.has(dateKey)) {
        entriesByDate.set(dateKey, new Set());
      }
      entriesByDate.get(dateKey).add(e.habitId.toString());
    });

    // Calculate streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check from today backwards
    const checkDate = new Date(today);
    let streakBroken = false;

    for (let i = 0; i < 400; i++) {
      const dateKey = normalizeDate(checkDate).toISOString();
      const completedHabits = entriesByDate.get(dateKey)?.size || 0;
      const percentage = (completedHabits / totalHabits) * 100;
      const isSuccess = percentage >= 75;

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

    // Get achieved milestones
    const milestones = await Streak.find({ userId: req.user._id }).sort({ milestone: 1 }).lean();

    res.json({
      currentStreak,
      longestStreak,
      milestones,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/habits/stats/habit-streaks - Get per-habit streak info
router.get('/stats/habit-streaks', async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user._id, isActive: true }).sort({ order: 1 }).lean();

    if (habits.length === 0) {
      return res.json({});
    }

    // Get all entries (last 400 days should be enough)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 400);
    startDate.setHours(0, 0, 0, 0);

    const entries = await HabitEntry.find({
      userId: req.user._id,
      date: { $gte: startDate },
    }).lean();

    // Group entries by habit and date
    const entriesByHabitAndDate = new Map();
    habits.forEach((habit) => {
      entriesByHabitAndDate.set(habit._id.toString(), new Set());
    });

    entries.forEach((e) => {
      const habitId = e.habitId.toString();
      const dateKey = normalizeDate(e.date).toISOString();
      if (entriesByHabitAndDate.has(habitId)) {
        entriesByHabitAndDate.get(habitId).add(dateKey);
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const habitStreaks = {};

    // Calculate streaks for each habit
    habits.forEach((habit) => {
      const habitId = habit._id.toString();
      const completedDates = entriesByHabitAndDate.get(habitId) || new Set();

      let currentStreak = 0;
      let longestStreak = 0;
      let tempStreak = 0;

      const checkDate = new Date(today);
      let streakBroken = false;

      // Check from today backwards
      for (let i = 0; i < 400; i++) {
        const dateKey = normalizeDate(checkDate).toISOString();
        const isCompleted = completedDates.has(dateKey);

        if (isCompleted) {
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

      habitStreaks[habitId] = {
        currentStreak,
        longestStreak,
      };
    });

    res.json(habitStreaks);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ============ STREAKS / MILESTONES ============

// PUT /api/habits/streaks/:milestone - Update milestone reward/notes
router.put(
  '/streaks/:milestone',
  [
    body('reward').optional().trim(),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const milestone = parseInt(req.params.milestone);
      const validMilestones = [30, 50, 75, 100, 150, 200, 250, 300, 365];
      
      if (!validMilestones.includes(milestone)) {
        return res.status(400).json({ message: 'Invalid milestone' });
      }

      const streak = await Streak.findOneAndUpdate(
        { userId: req.user._id, milestone },
        {
          userId: req.user._id,
          milestone,
          achievedAt: req.body.achievedAt || new Date(),
          reward: req.body.reward || '',
          notes: req.body.notes || '',
        },
        { upsert: true, new: true }
      );

      res.json(streak);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

export default router;
