import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import Activity, { ALLOWED_CATEGORIES } from '../models/Activity.js';

const router = express.Router();
router.use(protect);

router.get(
  '/',
  [
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { from, to } = req.query;
    const filter = { userId: req.user._id };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const activities = await Activity.find(filter).sort({ date: 1 }).lean();
    res.json(activities);
  }
);

router.post(
  '/',
  [
    body('date').isISO8601().withMessage('Valid date required'),
    body('category').isIn(ALLOWED_CATEGORIES).withMessage('Invalid category'),
    body('value').notEmpty().withMessage('Value is required'),
    body('unit').optional().trim(),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { date, category, value, unit, notes } = req.body;
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const existing = await Activity.findOne({
      userId: req.user._id,
      date: { $gte: dayStart, $lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) },
      category,
    });

    const payload = {
      userId: req.user._id,
      date: dayStart,
      category,
      value: typeof value === 'string' ? value : Number(value),
      unit: unit || '',
      notes: notes || '',
    };

    let doc;
    if (existing) {
      doc = await Activity.findByIdAndUpdate(existing._id, payload, { new: true });
    } else {
      doc = await Activity.create(payload);
    }
    res.status(existing ? 200 : 201).json(doc);
  }
);

router.put(
  '/:id',
  [
    body('date').optional().isISO8601(),
    body('category').optional().isIn(ALLOWED_CATEGORIES),
    body('value').optional().notEmpty(),
    body('unit').optional().trim(),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const activity = await Activity.findOne({ _id: req.params.id, userId: req.user._id });
    if (!activity) return res.status(404).json({ message: 'Activity not found' });

    const updates = {};
    if (req.body.date !== undefined) updates.date = new Date(req.body.date);
    if (req.body.category !== undefined) updates.category = req.body.category;
    if (req.body.value !== undefined) updates.value = req.body.value;
    if (req.body.unit !== undefined) updates.unit = req.body.unit;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;

    const updated = await Activity.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(updated);
  }
);

router.delete('/:id', async (req, res) => {
  const activity = await Activity.findOne({ _id: req.params.id, userId: req.user._id });
  if (!activity) return res.status(404).json({ message: 'Activity not found' });
  await Activity.findByIdAndDelete(req.params.id);
  res.status(204).send();
});

export default router;
