/**
 * Shared project-tree helpers: parent chains, descendant IDs, and task stat rollups.
 */

import Project from '../models/Project.js';
import Task from '../models/Task.js';

export function buildProjectsById(projects) {
  const byId = new Map();
  for (const p of projects) {
    byId.set(p._id.toString(), p);
  }
  return byId;
}

export function buildChildrenMap(projects) {
  const childrenByParent = new Map();
  for (const p of projects) {
    const key = p.parentId ? p.parentId.toString() : '__root__';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(p);
  }
  return childrenByParent;
}

/** Iterative BFS — avoids recursive re-scans of the full project array. */
export function getDescendantIds(projectId, childrenByParent) {
  const descendants = [];
  const queue = [...(childrenByParent.get(projectId.toString()) || [])];
  while (queue.length) {
    const child = queue.shift();
    descendants.push(child._id);
    const nested = childrenByParent.get(child._id.toString());
    if (nested?.length) queue.push(...nested);
  }
  return descendants;
}

export function buildParentChain(project, projectsById) {
  const parentChain = [];
  let currentParentId = project.parentId;
  while (currentParentId) {
    const parent = projectsById.get(currentParentId.toString());
    if (!parent) break;
    parentChain.unshift({ _id: parent._id, name: parent.name });
    currentParentId = parent.parentId;
  }
  return parentChain;
}

/** Walk parentId pointers without loading the full project tree. */
export async function buildParentChainFromDb(userId, projectId) {
  const project = await Project.findOne({ _id: projectId, userId })
    .select('_id parentId')
    .lean();
  if (!project) return [];

  const parentChain = [];
  let currentParentId = project.parentId;
  const visited = new Set();

  while (currentParentId && !visited.has(currentParentId.toString())) {
    visited.add(currentParentId.toString());
    const parent = await Project.findOne({ _id: currentParentId, userId })
      .select('_id name parentId')
      .lean();
    if (!parent) break;
    parentChain.unshift({ _id: parent._id, name: parent.name });
    currentParentId = parent.parentId;
  }

  return parentChain;
}

/**
 * Memoized post-order rollup: direct task stats + all descendant project stats.
 * Returns Map<projectIdStr, { totalTasks, completedTasks, subProjectCount }>.
 */
export function buildRollupStatsMap(allProjects, statsByProject) {
  const childrenByParent = buildChildrenMap(allProjects);
  const memo = new Map();

  function rollup(projectId) {
    const idStr = projectId.toString();
    if (memo.has(idStr)) return memo.get(idStr);

    const direct = statsByProject[idStr] || { totalTasks: 0, completedTasks: 0 };
    const children = childrenByParent.get(idStr) || [];

    let totalTasks = direct.totalTasks;
    let completedTasks = direct.completedTasks;
    for (const child of children) {
      const childRollup = rollup(child._id);
      totalTasks += childRollup.totalTasks;
      completedTasks += childRollup.completedTasks;
    }

    const result = {
      totalTasks,
      completedTasks,
      subProjectCount: children.length,
    };
    memo.set(idStr, result);
    return result;
  }

  for (const p of allProjects) {
    rollup(p._id);
  }

  return memo;
}

export function attachRollupStats(projects, rollupMap) {
  return projects.map((p) => {
    const stats = rollupMap.get(p._id.toString()) || {
      totalTasks: 0,
      completedTasks: 0,
      subProjectCount: 0,
    };
    return { ...p, ...stats };
  });
}

export async function fetchTaskStatsByProject(userId) {
  const stats = await Task.aggregate([
    { $match: { userId, projectId: { $ne: null } } },
    {
      $group: {
        _id: '$projectId',
        total: { $sum: 1 },
        completed: { $sum: { $cond: ['$completed', 1, 0] } },
      },
    },
  ]);

  return Object.fromEntries(
    stats
      .filter((s) => s._id != null)
      .map((s) => [s._id.toString(), { totalTasks: s.total, completedTasks: s.completed }])
  );
}
