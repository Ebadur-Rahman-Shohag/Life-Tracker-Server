import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import Task from '../models/Task.js';
import Project from '../models/Project.js';
import TaskCompletion from '../models/TaskCompletion.js';

const router = express.Router();
router.use(protect);

function recurringRulesForDate(d) {
  const day = d.getDay();
  const rules = ['daily', 'weekly'];
  if (day >= 1 && day <= 5) rules.push('weekdays');
  return rules;
}

function getTaskScopeKey(task) {
  if (task.projectId) return `project:${task.projectId.toString()}`;
  if (task.recurrenceRule) return 'recurring';
  if (task.date) {
    const day = new Date(task.date);
    day.setHours(0, 0, 0, 0);
    return `date:${day.toISOString()}`;
  }
  return 'unknown';
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
      const exists = await Project.exists({ _id: req.query.projectId, userId: req.user._id });
      if (!exists) return res.status(404).json({ message: 'Project not found' });
      filter.projectId = req.query.projectId;
      const tasks = await Task.find(filter).sort({ order: 1, createdAt: 1 }).lean();
      return res.json(tasks);
    }

    if (req.query.date) {
      const d = new Date(req.query.date);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setDate(end.getDate() + 1);

      const oneOffFilter = {
        ...filter,
        date: { $gte: d, $lt: end },
        $or: [{ recurrenceRule: null }, { recurrenceRule: { $exists: false } }],
      };

      const recurringFilter = {
        userId: req.user._id,
        projectId: null,
        recurrenceRule: { $in: recurringRulesForDate(d) },
      };

      const [oneOffTasks, matchingRecurring] = await Promise.all([
        Task.find(oneOffFilter).sort({ order: 1, createdAt: 1 }).lean(),
        Task.find(recurringFilter).sort({ order: 1, createdAt: 1 }).lean(),
      ]);

      const recurringIds = matchingRecurring.map((t) => t._id);
      let completions = [];
      if (recurringIds.length > 0) {
        completions = await TaskCompletion.find({
          userId: req.user._id,
          taskId: { $in: recurringIds },
          date: { $gte: d, $lt: end },
        }).lean();
      }

      const completedSet = new Set(completions.map((c) => c.taskId.toString()));
      const recurringWithCompleted = matchingRecurring.map((t) => ({
        ...t,
        completed: completedSet.has(t._id.toString()),
        completedForToday: completedSet.has(t._id.toString()),
      }));

      const result = [...oneOffTasks, ...recurringWithCompleted].sort(
        (a, b) => (a.order || 0) - (b.order || 0) || new Date(a.createdAt) - new Date(b.createdAt)
      );
      return res.json(result);
    }

    const tasks = await Task.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    res.json(tasks);
  }
);

router.put('/reorder', async (req, res) => {
  try {
    const { taskIds } = req.body;
    if (!Array.isArray(taskIds)) {
      return res.status(400).json({ message: 'taskIds must be an array' });
    }
    if (taskIds.length === 0) {
      return res.json({ ok: true });
    }

    const tasks = await Task.find({ _id: { $in: taskIds }, userId: req.user._id }).lean();
    if (tasks.length !== taskIds.length) {
      return res.status(400).json({ message: 'One or more tasks not found' });
    }

    const scopeKeys = new Set(tasks.map(getTaskScopeKey));
    if (scopeKeys.size > 1) {
      return res.status(400).json({ message: 'All tasks must belong to the same ordering scope' });
    }

    const bulkOps = taskIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, userId: req.user._id },
        update: { order: index },
      },
    }));

    await Task.bulkWrite(bulkOps);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('completed').optional().isBoolean(),
    body('date').optional().isISO8601(),
    body('projectId').optional().isMongoId(),
    body('dueDate').optional().isISO8601(),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('notes').optional().trim(),
    body('recurrenceRule').optional().isIn(['daily', 'weekly', 'weekdays']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, completed, date, projectId, dueDate, priority, notes, recurrenceRule } = req.body;
    if (projectId) {
      const project = await Project.findOne({ _id: projectId, userId: req.user._id });
      if (!project) return res.status(404).json({ message: 'Project not found' });
    }
    if (date && projectId) return res.status(400).json({ message: 'Task cannot have both date and projectId' });
    if (!date && !projectId && !recurrenceRule) {
      return res.status(400).json({ message: 'Task must have date (daily), projectId (project), or recurrenceRule (recurring)' });
    }
    if (recurrenceRule && projectId) return res.status(400).json({ message: 'Recurring tasks cannot belong to a project' });

    let dayStart = undefined;
    if (date) {
      dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
    }

    const orderFilter = { userId: req.user._id };
    if (projectId) {
      orderFilter.projectId = projectId;
    } else if (recurrenceRule) {
      orderFilter.projectId = null;
      orderFilter.recurrenceRule = { $exists: true, $ne: null };
    } else if (dayStart) {
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      orderFilter.projectId = null;
      orderFilter.date = { $gte: dayStart, $lt: dayEnd };
    }
    const maxOrderTask = await Task.findOne(orderFilter).sort({ order: -1 }).lean();
    const nextOrder = maxOrderTask ? (maxOrderTask.order ?? 0) + 1 : 0;

    const task = await Task.create({
      userId: req.user._id,
      title: title.trim(),
      completed: recurrenceRule ? false : (completed ?? false),
      date: dayStart,
      projectId: projectId || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      order: nextOrder,
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
      const completed = await TaskCompletion.exists({
        userId: req.user._id,
        taskId: task._id,
        date: { $gte: dayStart, $lt: dayEnd },
      });
      return res.json({ ...task.toObject(), completed: !!completed, completedForToday: !!completed });
    }
    if (req.body.title !== undefined) task.title = req.body.title;
    if (req.body.completed !== undefined) task.completed = req.body.completed;
    if (req.body.dueDate !== undefined) task.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : undefined;
    if (req.body.priority !== undefined) task.priority = req.body.priority;
    if (req.body.notes !== undefined) task.notes = req.body.notes;
    await task.save();
    res.json(task);
  }
);

router.delete('/:id', async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
  if (!task) return res.status(404).json({ message: 'Task not found' });
  await Promise.all([
    Task.findByIdAndDelete(req.params.id),
    TaskCompletion.deleteMany({ userId: req.user._id, taskId: task._id }),
  ]);
  res.status(204).send();
});

export default router;
