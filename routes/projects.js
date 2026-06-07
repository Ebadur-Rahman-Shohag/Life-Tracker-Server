import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Note from '../models/Note.js';
import Reference from '../models/Reference.js';
import { sendServerError } from '../utils/apiResponse.js';
import {
  attachRollupStats,
  buildChildrenMap,
  buildParentChain,
  buildProjectsById,
  buildRollupStatsMap,
  fetchTaskStatsByProject,
  getDescendantIds,
} from '../utils/projectTree.js';

const router = express.Router();

function parseQueryBool(v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}
router.use(protect);

function filterProjectsForList(allProjects, { includeArchived, archivedOnly, parentId }) {
  let projects = allProjects;
  if (!includeArchived && !archivedOnly) projects = projects.filter((p) => !p.archived);
  if (archivedOnly) projects = projects.filter((p) => p.archived);
  if (parentId === 'null' || parentId === '') {
    projects = projects.filter((p) => !p.parentId);
  } else if (parentId) {
    projects = projects.filter((p) => p.parentId?.toString() === parentId);
  }
  return projects;
}

router.get('/', async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const archivedOnly = req.query.archived === 'true';
    const parentId = req.query.parentId;

    const [allProjects, statsByProject] = await Promise.all([
      Project.find({ userId: req.user._id }).sort({ order: 1, createdAt: 1 }).lean(),
      fetchTaskStatsByProject(req.user._id),
    ]);

    const projects = filterProjectsForList(allProjects, { includeArchived, archivedOnly, parentId });
    if (projects.length === 0) return res.json([]);

    const rollupMap = buildRollupStatsMap(allProjects, statsByProject);
    res.json(attachRollupStats(projects, rollupMap));
  } catch (err) {
    sendServerError(res, err);
  }
});

router.put(
  '/reorder',
  [body('projectIds').isArray({ min: 1 }), body('projectIds.*').isMongoId()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { projectIds } = req.body;

      const found = await Project.find({ _id: { $in: projectIds }, userId: req.user._id }).lean();
      if (found.length !== projectIds.length) {
        return res.status(400).json({ message: 'One or more projects not found' });
      }

      const parentKeys = new Set(found.map((p) => p.parentId?.toString() || '__root__'));
      if (parentKeys.size > 1) {
        return res.status(400).json({ message: 'All projects must share the same parent for reorder' });
      }

      const bulkOps = projectIds.map((id, index) => ({
        updateOne: {
          filter: { _id: id, userId: req.user._id },
          update: { order: index },
        },
      }));

      await Project.bulkWrite(bulkOps);
      res.json({ ok: true });
    } catch (err) {
      sendServerError(res, err);
    }
  }
);

router.get('/:id', async (req, res) => {
  try {
    const [project, directSubProjects, tasks, allProjects, statsByProject] = await Promise.all([
      Project.findOne({ _id: req.params.id, userId: req.user._id }).lean(),
      Project.find({ parentId: req.params.id, userId: req.user._id })
        .sort({ order: 1, createdAt: 1 })
        .lean(),
      Task.find({ userId: req.user._id, projectId: req.params.id })
        .sort({ order: 1, createdAt: 1 })
        .lean(),
      Project.find({ userId: req.user._id }).lean(),
      fetchTaskStatsByProject(req.user._id),
    ]);

    if (!project) return res.status(404).json({ message: 'Project not found' });

    const projectsById = buildProjectsById(allProjects);
    const parentChain = buildParentChain(project, projectsById);
    const rollupMap = buildRollupStatsMap(allProjects, statsByProject);
    const projectStats = rollupMap.get(project._id.toString()) || {
      totalTasks: 0,
      completedTasks: 0,
      subProjectCount: directSubProjects.length,
    };

    const subProjectsWithStats = attachRollupStats(directSubProjects, rollupMap);

    res.json({
      ...project,
      totalTasks: projectStats.totalTasks,
      completedTasks: projectStats.completedTasks,
      subProjectCount: projectStats.subProjectCount,
      parentChain,
      subProjects: subProjectsWithStats,
      tasks,
    });
  } catch (err) {
    sendServerError(res, err);
  }
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

    if (req.body.parentId) {
      const parentProject = await Project.findOne({ _id: req.body.parentId, userId: req.user._id });
      if (!parentProject) return res.status(404).json({ message: 'Parent project not found' });
    }

    const orderFilter = { userId: req.user._id };
    if (req.body.parentId) {
      orderFilter.parentId = req.body.parentId;
    } else {
      orderFilter.parentId = null;
    }
    const maxOrderProject = await Project.findOne(orderFilter).sort({ order: -1 }).lean();
    const nextOrder = maxOrderProject ? (maxOrderProject.order ?? 0) + 1 : 0;

    const project = await Project.create({
      userId: req.user._id,
      name: req.body.name,
      description: req.body.description || '',
      parentId: req.body.parentId || null,
      order: nextOrder,
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

    if (req.body.parentId !== undefined && req.body.parentId !== null) {
      if (req.body.parentId === req.params.id) {
        return res.status(400).json({ message: 'Project cannot be its own parent' });
      }
      const parentProject = await Project.findOne({ _id: req.body.parentId, userId: req.user._id });
      if (!parentProject) return res.status(404).json({ message: 'Parent project not found' });

      const allProjects = await Project.find({ userId: req.user._id }).lean();
      const childrenByParent = buildChildrenMap(allProjects);
      const descendants = getDescendantIds(req.params.id, childrenByParent);
      if (descendants.some((id) => id.toString() === req.body.parentId)) {
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
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const allProjects = await Project.find({ userId: req.user._id }).lean();
    const childrenByParent = buildChildrenMap(allProjects);
    const descendantIds = getDescendantIds(req.params.id, childrenByParent);
    const allIdsToDelete = [project._id, ...descendantIds];

    await Task.deleteMany({ projectId: { $in: allIdsToDelete } });

    await Note.updateMany(
      { userId: req.user._id, projectIds: { $in: allIdsToDelete } },
      { $pull: { projectIds: { $in: allIdsToDelete } } }
    );

    await Reference.updateMany(
      { userId: req.user._id, projectIds: { $in: allIdsToDelete } },
      { $pull: { projectIds: { $in: allIdsToDelete } } }
    );

    await Project.deleteMany({ _id: { $in: allIdsToDelete } });

    res.status(204).send();
  } catch (err) {
    sendServerError(res, err);
  }
});

router.get('/:id/notes', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const includeSubProjects = req.query.includeSubProjects === 'true';
    let projectIds = [req.params.id];

    if (includeSubProjects) {
      const allProjects = await Project.find({ userId: req.user._id }).lean();
      const childrenByParent = buildChildrenMap(allProjects);
      const descendantIds = getDescendantIds(req.params.id, childrenByParent);
      projectIds = [req.params.id, ...descendantIds];
    }

    const filter = {
      userId: req.user._id,
      projectIds: { $in: projectIds },
    };

    const archivedQ = parseQueryBool(req.query.archived);
    if (archivedQ === true) filter.archived = true;
    else filter.archived = false;

    const notes = await Note.find(filter).sort({ updatedAt: -1, createdAt: -1 }).lean();
    res.json(notes);
  } catch (err) {
    sendServerError(res, err);
  }
});

router.get('/:id/references', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const includeSubProjects = req.query.includeSubProjects === 'true';
    let projectIds = [req.params.id];

    if (includeSubProjects) {
      const allProjects = await Project.find({ userId: req.user._id }).lean();
      const childrenByParent = buildChildrenMap(allProjects);
      const descendantIds = getDescendantIds(req.params.id, childrenByParent);
      projectIds = [req.params.id, ...descendantIds];
    }

    const filter = {
      userId: req.user._id,
      projectIds: { $in: projectIds },
    };

    const references = await Reference.find(filter).sort({ updatedAt: -1, createdAt: -1 }).lean();
    res.json(references);
  } catch (err) {
    sendServerError(res, err);
  }
});

export default router;
