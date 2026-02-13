import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Note from '../models/Note.js';

const router = express.Router();
router.use(protect);

// Helper: get all descendant project IDs (recursive)
function getAllDescendantIds(projectId, projects) {
  const descendants = [];
  const children = projects.filter((p) => p.parentId?.toString() === projectId.toString());
  for (const child of children) {
    descendants.push(child._id);
    descendants.push(...getAllDescendantIds(child._id, projects));
  }
  return descendants;
}

router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const archivedOnly = req.query.archived === 'true';
  const parentId = req.query.parentId; // 'null' for top-level, or a project ID

  // Single query: fetch all user projects, then filter in memory
  const [allProjects, stats] = await Promise.all([
    Project.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean(),
    Task.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$projectId', total: { $sum: 1 }, completed: { $sum: { $cond: ['$completed', 1, 0] } } } },
    ]),
  ]);

  // Apply filters in memory
  let projects = allProjects;
  if (!includeArchived && !archivedOnly) projects = projects.filter((p) => !p.archived);
  if (archivedOnly) projects = projects.filter((p) => p.archived);
  if (parentId === 'null' || parentId === '') {
    projects = projects.filter((p) => !p.parentId);
  } else if (parentId) {
    projects = projects.filter((p) => p.parentId?.toString() === parentId);
  }

  if (projects.length === 0) return res.json(projects);

  const statsByProject = Object.fromEntries(
    stats.filter((s) => s._id != null).map((s) => [s._id.toString(), { totalTasks: s.total, completedTasks: s.completed }])
  );

  // Calculate stats including all descendants for each project
  const projectsWithStats = projects.map((p) => {
    const descendantIds = getAllDescendantIds(p._id, allProjects);
    const allIds = [p._id, ...descendantIds];
    
    let totalTasks = 0;
    let completedTasks = 0;
    for (const id of allIds) {
      const s = statsByProject[id.toString()];
      if (s) {
        totalTasks += s.totalTasks;
        completedTasks += s.completedTasks;
      }
    }

    // Count direct sub-projects
    const subProjectCount = allProjects.filter((sp) => sp.parentId?.toString() === p._id.toString()).length;

    return {
      ...p,
      totalTasks,
      completedTasks,
      subProjectCount,
    };
  });

  res.json(projectsWithStats);
});

// Get single project with parent chain for breadcrumbs
router.get('/:id', async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user._id }).lean();
  if (!project) return res.status(404).json({ message: 'Project not found' });

  // Build parent chain (breadcrumb)
  const parentChain = [];
  let currentParentId = project.parentId;
  while (currentParentId) {
    const parent = await Project.findOne({ _id: currentParentId, userId: req.user._id }).lean();
    if (!parent) break;
    parentChain.unshift({ _id: parent._id, name: parent.name });
    currentParentId = parent.parentId;
  }

  // Get sub-projects
  const subProjects = await Project.find({ parentId: project._id, userId: req.user._id }).lean();

  // Get task stats
  const allProjects = await Project.find({ userId: req.user._id }).lean();
  const descendantIds = getAllDescendantIds(project._id, allProjects);
  const allIds = [project._id, ...descendantIds];

  const stats = await Task.aggregate([
    { $match: { userId: req.user._id, projectId: { $in: allIds } } },
    { $group: { _id: '$projectId', total: { $sum: 1 }, completed: { $sum: { $cond: ['$completed', 1, 0] } } } },
  ]);

  const statsByProject = Object.fromEntries(
    stats.filter((s) => s._id != null).map((s) => [s._id.toString(), { totalTasks: s.total, completedTasks: s.completed }])
  );

  let totalTasks = 0;
  let completedTasks = 0;
  for (const id of allIds) {
    const s = statsByProject[id.toString()];
    if (s) {
      totalTasks += s.totalTasks;
      completedTasks += s.completedTasks;
    }
  }

  // Add stats to sub-projects
  const subProjectsWithStats = subProjects.map((sp) => {
    const spDescendantIds = getAllDescendantIds(sp._id, allProjects);
    const spAllIds = [sp._id, ...spDescendantIds];
    let spTotal = 0;
    let spCompleted = 0;
    for (const id of spAllIds) {
      const s = statsByProject[id.toString()];
      if (s) {
        spTotal += s.totalTasks;
        spCompleted += s.completedTasks;
      }
    }
    const subSubCount = allProjects.filter((p) => p.parentId?.toString() === sp._id.toString()).length;
    return { ...sp, totalTasks: spTotal, completedTasks: spCompleted, subProjectCount: subSubCount };
  });

  res.json({
    ...project,
    totalTasks,
    completedTasks,
    parentChain,
    subProjects: subProjectsWithStats,
  });
});

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('description').optional().trim(),
    body('parentId').optional().isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // Validate parentId belongs to user if provided
    if (req.body.parentId) {
      const parentProject = await Project.findOne({ _id: req.body.parentId, userId: req.user._id });
      if (!parentProject) return res.status(404).json({ message: 'Parent project not found' });
    }

    const project = await Project.create({
      userId: req.user._id,
      name: req.body.name,
      description: req.body.description || '',
      parentId: req.body.parentId || null,
    });
    res.status(201).json(project);
  }
);

router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('description').optional().trim(),
    body('archived').optional().isBoolean(),
    body('parentId').optional(),
  ],
  async (req, res) => {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Validate parentId if provided and not null
    if (req.body.parentId !== undefined && req.body.parentId !== null) {
      // Cannot set self as parent
      if (req.body.parentId === req.params.id) {
        return res.status(400).json({ message: 'Project cannot be its own parent' });
      }
      const parentProject = await Project.findOne({ _id: req.body.parentId, userId: req.user._id });
      if (!parentProject) return res.status(404).json({ message: 'Parent project not found' });
      
      // Prevent circular reference - check if new parent is a descendant
      const allProjects = await Project.find({ userId: req.user._id }).lean();
      const descendants = [];
      const getDescendants = (id) => {
        const children = allProjects.filter((p) => p.parentId?.toString() === id.toString());
        for (const child of children) {
          descendants.push(child._id.toString());
          getDescendants(child._id);
        }
      };
      getDescendants(req.params.id);
      if (descendants.includes(req.body.parentId)) {
        return res.status(400).json({ message: 'Cannot set a descendant as parent (circular reference)' });
      }
    }

    if (req.body.name !== undefined) project.name = req.body.name;
    if (req.body.description !== undefined) project.description = req.body.description;
    if (req.body.archived !== undefined) project.archived = req.body.archived;
    if (req.body.parentId !== undefined) project.parentId = req.body.parentId || null;
    await project.save();
    res.json(project);
  }
);

router.delete('/:id', async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found' });

  // Get all descendant projects to delete (cascade)
  const allProjects = await Project.find({ userId: req.user._id }).lean();
  const descendantIds = getAllDescendantIds(req.params.id, allProjects);
  const allIdsToDelete = [project._id, ...descendantIds];

  // Delete all tasks belonging to these projects
  await Task.deleteMany({ projectId: { $in: allIdsToDelete } });

  // Remove project references from notes (don't delete notes, just disconnect them)
  await Note.updateMany(
    { projectIds: { $in: allIdsToDelete } },
    { $pull: { projectIds: { $in: allIdsToDelete } } }
  );

  // Delete all projects (parent and descendants)
  await Project.deleteMany({ _id: { $in: allIdsToDelete } });

  res.status(204).send();
});

// GET /api/projects/:id/notes - get notes connected to a project
router.get('/:id/notes', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Get all descendant project IDs if includeSubProjects is true
    const includeSubProjects = req.query.includeSubProjects === 'true';
    let projectIds = [req.params.id];
    
    if (includeSubProjects) {
      const allProjects = await Project.find({ userId: req.user._id }).lean();
      const descendantIds = getAllDescendantIds(req.params.id, allProjects);
      projectIds = [req.params.id, ...descendantIds];
    }

    const filter = {
      userId: req.user._id,
      projectIds: { $in: projectIds },
    };

    const archived = req.query.archived === 'true';
    if (archived !== undefined) filter.archived = archived;
    else filter.archived = false; // default: hide archived

    const notes = await Note.find(filter).sort({ updatedAt: -1, createdAt: -1 }).lean();
    res.json(notes);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;
