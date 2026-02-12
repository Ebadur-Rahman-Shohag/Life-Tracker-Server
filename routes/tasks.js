import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import Task from '../models/Task.js';
import Project from '../models/Project.js';
import TaskCompletion from '../models/TaskCompletion.js';

const router = express.Router();
router.use(protect);

function recurrenceMatchesDate(rule, d) {
  const day = d.getDay();
  if (rule === 'daily') return true;
  if (rule === 'weekdays') return day >= 1 && day <= 5;
  if (rule === 'weekly') return true;
  return false;
}

router.get(
  '/',
  [
    query('date').optional().isISO8601(),
    query('projectId').optional().isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const filter = { userId: req.user._id };
    if (req.query.projectId) {
      const project = await Project.findOne({ _id: req.query.projectId, userId: req.user._id });
      if (!project) return res.status(404).json({ message: 'Project not found' });
      filter.projectId = req.query.projectId;
      const tasks = await Task.find(filter).sort({ order: 1, createdAt: 1 }).lean();
      return res.json(tasks);
    }

    if (req.query.date) {
      const d = new Date(req.query.date);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      const oneOffFilter = { ...filter, date: { $gte: d, $lt: end }, $or: [{ recurrenceRule: null }, { recurrenceRule: { $exists: false } }] };
      const oneOffTasks = await Task.find(oneOffFilter).sort({ order: 1, createdAt: 1 }).lean();
      const recurringFilter = { userId: req.user._id, projectId: null, recurrenceRule: { $exists: true, $ne: null } };
      const recurringTasks = await Task.find(recurringFilter).sort({ order: 1, createdAt: 1 }).lean();
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const matchingRecurring = recurringTasks.filter((t) => recurrenceMatchesDate(t.recurrenceRule, d));
      const recurringIds = matchingRecurring.map((t) => t._id);
      const completions = await TaskCompletion.find({
        userId: req.user._id,
        taskId: { $in: recurringIds },
        date: { $gte: dayStart, $lt: dayEnd },
      }).lean();
      const completedSet = new Set(completions.map((c) => c.taskId.toString()));
      const recurringWithCompleted = matchingRecurring.map((t) => ({
        ...t,
        completed: completedSet.has(t._id.toString()),
        completedForToday: completedSet.has(t._id.toString()),
      }));
      const result = [...oneOffTasks, ...recurringWithCompleted].sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(a.createdAt) - new Date(b.createdAt));
      return res.json(result);
    }

    const tasks = await Task.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    res.json(tasks);
  }
);

router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('completed').optional().isBoolean(),
    body('date').optional().isISO8601(),
    body('projectId').optional().isMongoId(),
    body('dueDate').optional().isISO8601(),
    body('order').optional().isInt(),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('notes').optional().trim(),
    body('recurrenceRule').optional().isIn(['daily', 'weekly', 'weekdays']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, completed, date, projectId, dueDate, order, priority, notes, recurrenceRule } = req.body;
    if (projectId) {
      const project = await Project.findOne({ _id: projectId, userId: req.user._id });
      if (!project) return res.status(404).json({ message: 'Project not found' });
    }
    if (date && projectId) return res.status(400).json({ message: 'Task cannot have both date and projectId' });
    if (!date && !projectId && !recurrenceRule) return res.status(400).json({ message: 'Task must have date (daily), projectId (project), or recurrenceRule (recurring)' });
    if (recurrenceRule && projectId) return res.status(400).json({ message: 'Recurring tasks cannot belong to a project' });

    let dayStart = undefined;
    if (date) {
      dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
    }
    const task = await Task.create({
      userId: req.user._id,
      title: title.trim(),
      completed: recurrenceRule ? false : (completed ?? false),
      date: dayStart,
      projectId: projectId || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      order: order != null ? Number(order) : 0,
      priority: priority || 'medium',
      notes: notes || '',
      recurrenceRule: recurrenceRule || undefined,
    });
    res.status(201).json(task);
  }
);

router.put(
  '/:id',
  [
    body('title').optional().trim().notEmpty(),
    body('completed').optional().isBoolean(),
    body('dueDate').optional().isISO8601(),
    body('order').optional().isInt(),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('notes').optional().trim(),
    body('date').optional().isISO8601(),
  ],
  async (req, res) => {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.recurrenceRule && req.body.completed !== undefined && req.body.date) {
      const dayStart = new Date(req.body.date);
      dayStart.setHours(0, 0, 0, 0);
      if (req.body.completed) {
        await TaskCompletion.findOneAndUpdate(
          { userId: req.user._id, taskId: task._id, date: dayStart },
          { userId: req.user._id, taskId: task._id, date: dayStart },
          { upsert: true, new: true }
        );
      } else {
        await TaskCompletion.deleteOne({ userId: req.user._id, taskId: task._id, date: dayStart });
      }
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const completed = await TaskCompletion.exists({ userId: req.user._id, taskId: task._id, date: { $gte: dayStart, $lt: dayEnd } });
      return res.json({ ...task.toObject(), completed: !!completed, completedForToday: !!completed });
    }
    if (req.body.title !== undefined) task.title = req.body.title;
    if (req.body.completed !== undefined) task.completed = req.body.completed;
    if (req.body.dueDate !== undefined) task.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : undefined;
    if (req.body.order !== undefined) task.order = Number(req.body.order);
    if (req.body.priority !== undefined) task.priority = req.body.priority;
    if (req.body.notes !== undefined) task.notes = req.body.notes;
    await task.save();
    res.json(task);
  }
);

router.delete('/:id', async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
  if (!task) return res.status(404).json({ message: 'Task not found' });
  await Task.findByIdAndDelete(req.params.id);
  res.status(204).send();
});

export default router;
