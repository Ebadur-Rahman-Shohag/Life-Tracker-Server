import Task from '../models/Task.js';
import TaskCompletion from '../models/TaskCompletion.js';

function recurringRulesForDate(d) {
  const day = d.getDay();
  const rules = ['daily', 'weekly'];
  if (day >= 1 && day <= 5) rules.push('weekdays');
  return rules;
}

/**
 * Return today's task completion counts (one-off + recurring for a given day).
 */
export async function getTodayTaskCounts(userId, dateInput = new Date()) {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setDate(end.getDate() + 1);

  const oneOffFilter = {
    userId,
    date: { $gte: d, $lt: end },
    $or: [{ recurrenceRule: null }, { recurrenceRule: { $exists: false } }],
  };

  const recurringFilter = {
    userId,
    projectId: null,
    recurrenceRule: { $in: recurringRulesForDate(d) },
  };

  const [oneOffTasks, matchingRecurring] = await Promise.all([
    Task.find(oneOffFilter).lean(),
    Task.find(recurringFilter).lean(),
  ]);

  const recurringIds = matchingRecurring.map((t) => t._id);
  let completions = [];
  if (recurringIds.length > 0) {
    completions = await TaskCompletion.find({
      userId,
      taskId: { $in: recurringIds },
      date: { $gte: d, $lt: end },
    }).lean();
  }

  const completedSet = new Set(completions.map((c) => c.taskId.toString()));
  const oneOffCompleted = oneOffTasks.filter((t) => t.completed).length;
  const recurringCompleted = matchingRecurring.filter((t) => completedSet.has(t._id.toString())).length;

  const todayTotal = oneOffTasks.length + matchingRecurring.length;
  const todayCompleted = oneOffCompleted + recurringCompleted;

  return { todayCompleted, todayTotal };
}
