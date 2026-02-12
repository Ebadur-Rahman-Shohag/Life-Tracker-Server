import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import BudgetCategory from '../models/BudgetCategory.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();
router.use(protect);

// Helper to normalize date to start of day
function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Helper to get start and end dates for period
function getPeriodDates(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let startDate, endDate;

  switch (period) {
    case 'week':
      const dayOfWeek = today.getDay();
      startDate = new Date(today);
      startDate.setDate(today.getDate() - dayOfWeek);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'year':
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31);
      endDate.setHours(23, 59, 59, 999);
      break;
    default:
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
}

// ============ BUDGET CATEGORIES ============

// GET /api/budget/categories - Get all categories for user
router.get('/categories', async (req, res) => {
  try {
    const filter = { userId: req.user._id };
    if (req.query.type) {
      filter.type = req.query.type;
    }
    if (req.query.activeOnly === 'true') {
      filter.isActive = true;
    }
    const categories = await BudgetCategory.find(filter).sort({ type: 1, name: 1 }).lean();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/budget/categories - Create new category
router.post(
  '/categories',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('type').isIn(['expense', 'income']).withMessage('Type must be expense or income'),
    body('icon').optional().trim(),
    body('color').optional().trim(),
    body('budgetLimit').optional().isFloat({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { name, type, icon, color, budgetLimit } = req.body;
      const trimmedName = name.trim();

      // Check if category with same name and type already exists for this user
      const existing = await BudgetCategory.findOne({
        userId: req.user._id,
        name: trimmedName,
        type,
      });

      if (existing) {
        return res.status(400).json({ 
          message: `A ${type} category with the name "${trimmedName}" already exists` 
        });
      }

      const category = await BudgetCategory.create({
        userId: req.user._id,
        name: trimmedName,
        type,
        icon: icon || '',
        color: color || '#10b981',
        budgetLimit: type === 'expense' ? budgetLimit || null : null,
      });
      res.status(201).json(category);
    } catch (err) {
      // Handle unique index violation
      if (err.code === 11000) {
        return res.status(400).json({ 
          message: 'A category with this name and type already exists' 
        });
      }
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// PUT /api/budget/categories/:id - Update category
router.put(
  '/categories/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('icon').optional().trim(),
    body('color').optional().trim(),
    body('budgetLimit').optional().isFloat({ min: 0 }),
    body('isActive').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const category = await BudgetCategory.findOne({ _id: req.params.id, userId: req.user._id });
      if (!category) return res.status(404).json({ message: 'Category not found' });

      if (req.body.name !== undefined) category.name = req.body.name.trim();
      if (req.body.icon !== undefined) category.icon = req.body.icon;
      if (req.body.color !== undefined) category.color = req.body.color;
      if (req.body.budgetLimit !== undefined) {
        category.budgetLimit = category.type === 'expense' ? req.body.budgetLimit : null;
      }
      if (req.body.isActive !== undefined) category.isActive = req.body.isActive;

      await category.save();
      res.json(category);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// DELETE /api/budget/categories/:id - Delete category (soft delete)
router.delete('/categories/:id', async (req, res) => {
  try {
    const category = await BudgetCategory.findOne({ _id: req.params.id, userId: req.user._id });
    if (!category) return res.status(404).json({ message: 'Category not found' });

    // Soft delete by setting isActive to false
    category.isActive = false;
    await category.save();

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ============ TRANSACTIONS ============

// GET /api/budget/transactions - Get transactions with filters
router.get(
  '/transactions',
  [
    query('type').optional().isIn(['expense', 'income']),
    query('categoryId').optional().isMongoId(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('skip').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const filter = { userId: req.user._id };
      
      if (req.query.type) filter.type = req.query.type;
      if (req.query.categoryId) filter.categoryId = req.query.categoryId;
      
      if (req.query.from || req.query.to) {
        filter.date = {};
        if (req.query.from) {
          const fromDate = normalizeDate(req.query.from);
          filter.date.$gte = fromDate;
        }
        if (req.query.to) {
          const toDate = normalizeDate(req.query.to);
          toDate.setHours(23, 59, 59, 999);
          filter.date.$lte = toDate;
        }
      }

      const limit = parseInt(req.query.limit) || 100;
      const skip = parseInt(req.query.skip) || 0;

      const transactions = await Transaction.find(filter)
        .populate('categoryId', 'name icon color type')
        .sort({ date: -1, createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      res.json(transactions);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// POST /api/budget/transactions - Create transaction
router.post(
  '/transactions',
  [
    body('date').isISO8601().withMessage('Valid date is required'),
    body('type').isIn(['expense', 'income']).withMessage('Type must be expense or income'),
    body('categoryId').isMongoId().withMessage('Valid categoryId is required'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('description').optional().trim(),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { date, type, categoryId, amount, description, notes } = req.body;

      // Verify category belongs to user and matches type
      const category = await BudgetCategory.findOne({ _id: categoryId, userId: req.user._id });
      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }
      if (category.type !== type) {
        return res.status(400).json({ message: 'Category type does not match transaction type' });
      }

      const transaction = await Transaction.create({
        userId: req.user._id,
        date: normalizeDate(date),
        type,
        categoryId,
        amount: parseFloat(amount),
        description: description || '',
        notes: notes || '',
      });

      const populated = await Transaction.findById(transaction._id)
        .populate('categoryId', 'name icon color type')
        .lean();

      res.status(201).json(populated);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// PUT /api/budget/transactions/:id - Update transaction
router.put(
  '/transactions/:id',
  [
    body('date').optional().isISO8601(),
    body('categoryId').optional().isMongoId(),
    body('amount').optional().isFloat({ min: 0 }),
    body('description').optional().trim(),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    try {
      const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user._id });
      if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

      if (req.body.date !== undefined) transaction.date = normalizeDate(req.body.date);
      if (req.body.amount !== undefined) transaction.amount = parseFloat(req.body.amount);
      if (req.body.description !== undefined) transaction.description = req.body.description.trim();
      if (req.body.notes !== undefined) transaction.notes = req.body.notes.trim();

      if (req.body.categoryId !== undefined) {
        const category = await BudgetCategory.findOne({ _id: req.body.categoryId, userId: req.user._id });
        if (!category) {
          return res.status(404).json({ message: 'Category not found' });
        }
        if (category.type !== transaction.type) {
          return res.status(400).json({ message: 'Category type does not match transaction type' });
        }
        transaction.categoryId = req.body.categoryId;
      }

      await transaction.save();

      const populated = await Transaction.findById(transaction._id)
        .populate('categoryId', 'name icon color type')
        .lean();

      res.json(populated);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// DELETE /api/budget/transactions/:id - Delete transaction
router.delete('/transactions/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user._id });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

    await Transaction.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ============ SUMMARY & AGGREGATIONS ============

// GET /api/budget/summary - Get financial summary
router.get(
  '/summary',
  [
    query('period').optional().isIn(['week', 'month', 'year', 'custom']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      let startDate, endDate;

      if (req.query.period === 'custom' && req.query.from && req.query.to) {
        startDate = normalizeDate(req.query.from);
        endDate = normalizeDate(req.query.to);
        endDate.setHours(23, 59, 59, 999);
      } else {
        const period = req.query.period || 'month';
        const dates = getPeriodDates(period);
        startDate = dates.startDate;
        endDate = dates.endDate;
      }

      // Get all transactions in date range
      const transactions = await Transaction.find({
        userId: req.user._id,
        date: { $gte: startDate, $lte: endDate },
      })
        .populate('categoryId', 'name icon color type budgetLimit')
        .lean();

      // Calculate totals
      let totalIncome = 0;
      let totalExpenses = 0;
      const byCategory = {};
      const byCategoryIncome = {};

      transactions.forEach((t) => {
        // Skip transactions with deleted/missing categories
        if (!t.categoryId) return;

        if (t.type === 'income') {
          totalIncome += t.amount;
          const catId = t.categoryId._id.toString();
          if (!byCategoryIncome[catId]) {
            byCategoryIncome[catId] = {
              categoryId: catId,
              categoryName: t.categoryId.name,
              categoryIcon: t.categoryId.icon,
              categoryColor: t.categoryId.color,
              total: 0,
            };
          }
          byCategoryIncome[catId].total += t.amount;
        } else {
          totalExpenses += t.amount;
          const catId = t.categoryId._id.toString();
          if (!byCategory[catId]) {
            byCategory[catId] = {
              categoryId: catId,
              categoryName: t.categoryId.name,
              categoryIcon: t.categoryId.icon,
              categoryColor: t.categoryId.color,
              budgetLimit: t.categoryId.budgetLimit,
              total: 0,
            };
          }
          byCategory[catId].total += t.amount;
        }
      });

      // Calculate percentages for expenses
      Object.values(byCategory).forEach((cat) => {
        if (cat.budgetLimit && cat.budgetLimit > 0) {
          cat.percentage = Math.round((cat.total / cat.budgetLimit) * 100);
        } else {
          cat.percentage = 0;
        }
      });

      const net = totalIncome - totalExpenses;

      res.json({
        period: req.query.period || 'month',
        startDate,
        endDate,
        totalIncome,
        totalExpenses,
        net,
        byCategory: Object.values(byCategory),
        byCategoryIncome: Object.values(byCategoryIncome),
      });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// GET /api/budget/monthly - Get monthly breakdown for a year
router.get(
  '/monthly',
  [query('year').optional().isInt({ min: 2000, max: 2100 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const months = [];

      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);
        endDate.setHours(23, 59, 59, 999);

        const transactions = await Transaction.find({
          userId: req.user._id,
          date: { $gte: startDate, $lte: endDate },
        }).lean();

        let totalIncome = 0;
        let totalExpenses = 0;

        transactions.forEach((t) => {
          if (t.type === 'income') {
            totalIncome += t.amount;
          } else {
            totalExpenses += t.amount;
          }
        });

        months.push({
          month: month + 1,
          monthName: new Date(year, month, 1).toLocaleString('default', { month: 'long' }),
          totalIncome,
          totalExpenses,
          net: totalIncome - totalExpenses,
        });
      }

      res.json({ year, months });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

export default router;
