import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import Note from '../models/Note.js';
import NoteCategory from '../models/NoteCategory.js';
import Project from '../models/Project.js';

const router = express.Router();
router.use(protect);

// Prevent caching for GET requests
router.use((req, res, next) => {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

function parseBool(v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}

// ============ NOTE CATEGORIES ============

// GET /api/notes/categories - Get all categories for user
router.get('/categories', async (req, res) => {
  try {
    const filter = { userId: req.user._id };
    if (req.query.activeOnly === 'true') {
      filter.isActive = true;
    }
    const categories = await NoteCategory.find(filter).sort({ order: 1, name: 1 }).lean();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/notes/categories - Create new category
router.post(
  '/categories',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }),
    body('icon').optional().trim().isLength({ max: 10 }),
    body('color').optional().trim().isLength({ max: 30 }),
    body('order').optional().isInt(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { name, icon, color, order } = req.body;
      const trimmedName = name.trim();

      // Check if category with same name already exists for this user
      const existing = await NoteCategory.findOne({
        userId: req.user._id,
        name: trimmedName,
      });

      if (existing) {
        return res.status(400).json({
          message: `A category with the name "${trimmedName}" already exists`,
        });
      }

      // Get max order if not provided
      let categoryOrder = order;
      if (categoryOrder === undefined) {
        const maxOrderCategory = await NoteCategory.findOne({ userId: req.user._id }).sort({ order: -1 });
        categoryOrder = maxOrderCategory ? maxOrderCategory.order + 1 : 0;
      }

      const category = await NoteCategory.create({
        userId: req.user._id,
        name: trimmedName,
        icon: icon || '',
        color: color || '#10b981',
        order: categoryOrder,
      });
      res.status(201).json(category);
    } catch (err) {
      // Handle unique index violation
      if (err.code === 11000) {
        return res.status(400).json({
          message: 'A category with this name already exists',
        });
      }
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// PUT /api/notes/categories/:id - Update category
router.put(
  '/categories/:id',
  [
    param('id').isMongoId(),
    body('name').optional().trim().notEmpty().isLength({ max: 60 }),
    body('icon').optional().trim().isLength({ max: 10 }),
    body('color').optional().trim().isLength({ max: 30 }),
    body('order').optional().isInt(),
    body('isActive').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const category = await NoteCategory.findOne({ _id: req.params.id, userId: req.user._id });
      if (!category) return res.status(404).json({ message: 'Category not found' });

      if (req.body.name !== undefined) {
        const trimmedName = req.body.name.trim();
        // Check if another category with same name exists
        const existing = await NoteCategory.findOne({
          userId: req.user._id,
          name: trimmedName,
          _id: { $ne: req.params.id },
        });
        if (existing) {
          return res.status(400).json({
            message: `A category with the name "${trimmedName}" already exists`,
          });
        }
        category.name = trimmedName;
      }
      if (req.body.icon !== undefined) category.icon = req.body.icon;
      if (req.body.color !== undefined) category.color = req.body.color;
      if (req.body.order !== undefined) category.order = req.body.order;
      if (req.body.isActive !== undefined) category.isActive = req.body.isActive;

      await category.save();
      res.json(category);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({
          message: 'A category with this name already exists',
        });
      }
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// PUT /api/notes/categories/reorder - Bulk reorder categories
router.put('/categories/reorder', async (req, res) => {
  try {
    const { categoryIds } = req.body;
    if (!Array.isArray(categoryIds)) {
      return res.status(400).json({ message: 'categoryIds must be an array' });
    }

    const bulkOps = categoryIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, userId: req.user._id },
        update: { order: index },
      },
    }));

    await NoteCategory.bulkWrite(bulkOps);
    const categories = await NoteCategory.find({ userId: req.user._id }).sort({ order: 1 }).lean();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/notes/categories/:id - Delete category (soft delete)
router.delete('/categories/:id', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const category = await NoteCategory.findOne({ _id: req.params.id, userId: req.user._id });
    if (!category) return res.status(404).json({ message: 'Category not found' });

    // Soft delete by setting isActive to false
    category.isActive = false;
    await category.save();

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ============ NOTES ============

// GET /api/notes - list notes (filters + search)
router.get(
  '/',
  [
    query('category').optional().trim(),
    query('archived').optional().isIn(['true', 'false']),
    query('favoriteOnly').optional().isIn(['true', 'false']),
    query('search').optional().trim(),
    query('projectId').optional().isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const filter = { userId: req.user._id };

      const archived = parseBool(req.query.archived);
      if (archived !== undefined) filter.archived = archived;
      else filter.archived = false; // default: hide archived

      const category = req.query.category?.trim();
      if (category && category !== 'All') filter.category = category;

      const favoriteOnly = parseBool(req.query.favoriteOnly);
      if (favoriteOnly === true) filter.isFavorite = true;

      const projectId = req.query.projectId;
      if (projectId) {
        // Validate project belongs to user
        const project = await Project.findOne({ _id: projectId, userId: req.user._id });
        if (!project) {
          return res.status(404).json({ message: 'Project not found' });
        }
        filter.projectIds = projectId;
      }

      const search = req.query.search?.trim();
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } },
          { tags: { $elemMatch: { $regex: search, $options: 'i' } } },
        ];
      }

      const notes = await Note.find(filter).sort({ updatedAt: -1, createdAt: -1 }).lean();
      res.json(notes);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// GET /api/notes/stats - basic counts for sidebar
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user._id;

    // Get active categories from NoteCategory model
    const activeCategories = await NoteCategory.find({ userId, isActive: true })
      .sort({ order: 1, name: 1 })
      .lean();

    // Get note counts by category
    const noteCountsByCategory = await Note.aggregate([
      { $match: { userId, archived: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    const countMap = new Map(noteCountsByCategory.map((c) => [c._id || 'Uncategorized', c.count]));

    // Build categories array with counts from managed categories
    const categoriesWithCounts = activeCategories.map((cat) => ({
      _id: cat._id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      count: countMap.get(cat.name) || 0,
    }));

    // Also include any categories from notes that aren't in managed categories
    const managedCategoryNames = new Set(activeCategories.map((c) => c.name));
    const unmanagedCategories = noteCountsByCategory
      .filter((c) => {
        const catName = c._id || 'Uncategorized';
        return !managedCategoryNames.has(catName) && catName !== 'Uncategorized';
      })
      .map((c) => ({
        name: c._id || 'Uncategorized',
        count: c.count,
      }));

    const [favoritesCount, archivedCount, totalActiveCount] = await Promise.all([
      Note.countDocuments({ userId, archived: false, isFavorite: true }),
      Note.countDocuments({ userId, archived: true }),
      Note.countDocuments({ userId, archived: false }),
    ]);

    res.json({
      totalActive: totalActiveCount,
      favorites: favoritesCount,
      archived: archivedCount,
      categories: [...categoriesWithCounts, ...unmanagedCategories],
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/notes - create note
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('content').optional().isString(), // Legacy: plain text
    body('blocks').optional(), // New: block-based content (TipTap JSON object)
    body('category').optional().trim().isLength({ max: 60 }),
    body('isFavorite').optional().isBoolean(),
    body('tags').optional().isArray(),
    body('tags.*').optional().isString().trim().isLength({ max: 30 }),
    body('color').optional().isString().trim().isLength({ max: 30 }),
    body('archived').optional().isBoolean(),
    body('projectIds').optional().isArray(),
    body('projectIds.*').optional().isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // Validate projectIds belong to user
      let projectIds = [];
      if (req.body.projectIds && Array.isArray(req.body.projectIds)) {
        projectIds = req.body.projectIds.filter(Boolean);
        if (projectIds.length > 0) {
          const projects = await Project.find({ _id: { $in: projectIds }, userId: req.user._id });
          if (projects.length !== projectIds.length) {
            return res.status(400).json({ message: 'One or more projects not found or do not belong to you' });
          }
        }
      }

      const noteData = {
        userId: req.user._id,
        title: req.body.title,
        category: req.body.category?.trim() || 'Uncategorized',
        isFavorite: !!req.body.isFavorite,
        tags: Array.isArray(req.body.tags) ? req.body.tags.filter(Boolean) : [],
        color: req.body.color || '',
        archived: !!req.body.archived,
        projectIds: projectIds,
      };

      // Support both legacy plain text and new block-based content
      // TipTap returns a JSON object: { type: 'doc', content: [...] }
      if (req.body.blocks && typeof req.body.blocks === 'object' && req.body.blocks.type === 'doc') {
        noteData.blocks = req.body.blocks;
        noteData.content = ''; // Clear legacy content when using blocks
      } else {
        noteData.content = req.body.content || '';
        noteData.blocks = null; // No blocks for legacy content
      }

      const note = await Note.create(noteData);
      res.status(201).json(note);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// GET /api/notes/:id - get single note
router.get('/:id', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/notes/:id - update note
router.put(
  '/:id',
  [
    param('id').isMongoId(),
    body('title').optional().trim().notEmpty().isLength({ max: 200 }),
    body('content').optional().isString(), // Legacy: plain text
    body('blocks').optional(), // New: block-based content (TipTap JSON object)
    body('category').optional().trim().isLength({ max: 60 }),
    body('isFavorite').optional().isBoolean(),
    body('tags').optional().isArray(),
    body('tags.*').optional().isString().trim().isLength({ max: 30 }),
    body('color').optional().isString().trim().isLength({ max: 30 }),
    body('archived').optional().isBoolean(),
    body('projectIds').optional().isArray(),
    body('projectIds.*').optional().isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const note = await Note.findOne({ _id: req.params.id, userId: req.user._id });
      if (!note) return res.status(404).json({ message: 'Note not found' });

      // Validate projectIds belong to user if provided
      if (req.body.projectIds !== undefined) {
        let projectIds = [];
        if (Array.isArray(req.body.projectIds)) {
          projectIds = req.body.projectIds.filter(Boolean);
          if (projectIds.length > 0) {
            const projects = await Project.find({ _id: { $in: projectIds }, userId: req.user._id });
            if (projects.length !== projectIds.length) {
              return res.status(400).json({ message: 'One or more projects not found or do not belong to you' });
            }
          }
        }
        note.projectIds = projectIds;
      }

      if (req.body.title !== undefined) note.title = req.body.title;
      if (req.body.category !== undefined) note.category = req.body.category?.trim() || 'Uncategorized';
      if (req.body.isFavorite !== undefined) note.isFavorite = req.body.isFavorite;
      if (req.body.tags !== undefined) note.tags = Array.isArray(req.body.tags) ? req.body.tags.filter(Boolean) : [];
      if (req.body.color !== undefined) note.color = req.body.color || '';
      if (req.body.archived !== undefined) note.archived = req.body.archived;

      // Handle content: prefer blocks over legacy content
      // TipTap returns a JSON object: { type: 'doc', content: [...] }
      if (req.body.blocks && typeof req.body.blocks === 'object' && req.body.blocks.type === 'doc') {
        note.blocks = req.body.blocks;
        // Clear legacy content when updating with blocks
        note.content = '';
      } else if (req.body.content !== undefined) {
        note.content = req.body.content;
        // Clear blocks when updating with legacy content
        if (req.body.content) {
          note.blocks = null;
        }
      }

      await note.save();
      res.json(note);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// DELETE /api/notes/:id - delete note
router.delete('/:id', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.user._id });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    await Note.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/notes/:id/favorite - toggle favorite
router.put('/:id/favorite', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.user._id });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    note.isFavorite = !note.isFavorite;
    await note.save();
    res.json({ _id: note._id, isFavorite: note.isFavorite });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/notes/:id/archive - toggle archive
router.put('/:id/archive', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.user._id });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    note.archived = !note.archived;
    await note.save();
    res.json({ _id: note._id, archived: note.archived });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/notes/by-project/:projectId - get notes for a specific project
router.get('/by-project/:projectId', [param('projectId').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Get all descendant project IDs if includeSubProjects is true
    const includeSubProjects = req.query.includeSubProjects === 'true';
    let projectIds = [req.params.projectId];
    
    if (includeSubProjects) {
      const allProjects = await Project.find({ userId: req.user._id }).lean();
      const getAllDescendantIds = (projectId, projects) => {
        const descendants = [];
        const children = projects.filter((p) => p.parentId?.toString() === projectId.toString());
        for (const child of children) {
          descendants.push(child._id);
          descendants.push(...getAllDescendantIds(child._id, projects));
        }
        return descendants;
      };
      const descendantIds = getAllDescendantIds(req.params.projectId, allProjects);
      projectIds = [req.params.projectId, ...descendantIds];
    }

    const filter = {
      userId: req.user._id,
      projectIds: { $in: projectIds },
    };

    const archived = parseBool(req.query.archived);
    if (archived !== undefined) filter.archived = archived;
    else filter.archived = false; // default: hide archived

    const notes = await Note.find(filter).sort({ updatedAt: -1, createdAt: -1 }).lean();
    res.json(notes);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;

