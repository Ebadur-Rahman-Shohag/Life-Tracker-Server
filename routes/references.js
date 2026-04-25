import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import Reference from '../models/Reference.js';
import Project from '../models/Project.js';
import { sendServerError } from '../utils/apiResponse.js';

const router = express.Router();
router.use(protect);

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

function normalizeTags(input) {
  if (!Array.isArray(input)) return [];
  return input.map((t) => String(t).trim()).filter(Boolean);
}

// GET / — list
router.get(
  '/',
  [
    query('q').optional().trim().isLength({ max: 200 }),
    query('tag').optional().trim().isLength({ max: 64 }),
    query('favorite').optional().isIn(['true', 'false']),
    query('sort').optional().isIn(['updatedAt', 'createdAt']),
    query('projectId').optional().isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const filter = { userId: req.user._id };
      const projectId = req.query.projectId;
      if (projectId) {
        const project = await Project.findOne({ _id: projectId, userId: req.user._id });
        if (!project) {
          return res.status(404).json({ message: 'Project not found' });
        }
        filter.projectIds = projectId;
      }
      const q = req.query.q?.trim();
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ title: rx }, { description: rx }];
      }
      const tag = req.query.tag?.trim();
      if (tag) {
        filter.tags = tag;
      }
      const fav = parseBool(req.query.favorite);
      if (fav === true) filter.isFavorite = true;
      if (fav === false) filter.isFavorite = false;

      const sortField = req.query.sort === 'createdAt' ? 'createdAt' : 'updatedAt';
      const sort = { [sortField]: -1 };

      const list = await Reference.find(filter).sort(sort).lean();
      res.json(list);
    } catch (err) {
      sendServerError(res, err);
    }
  }
);

// GET /stats — counts (must be before /:id)
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user._id;
    const [total, favorites, withProjects] = await Promise.all([
      Reference.countDocuments({ userId }),
      Reference.countDocuments({ userId, isFavorite: true }),
      Reference.countDocuments({ userId, 'projectIds.0': { $exists: true } }),
    ]);
    res.json({ total, favorites, withProjects });
  } catch (err) {
    sendServerError(res, err);
  }
});

// GET /:id
router.get(
  '/:id',
  [param('id').isMongoId()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const doc = await Reference.findOne({ _id: req.params.id, userId: req.user._id }).lean();
      if (!doc) return res.status(404).json({ message: 'Reference not found' });
      res.json(doc);
    } catch (err) {
      sendServerError(res, err);
    }
  }
);

// POST /
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 500 }),
    body('url')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 2048 })
      .custom((v) => {
        if (v === '' || v == null) return true;
        try {
          const u = new URL(v);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            throw new Error('URL must be http or https');
          }
          return true;
        } catch {
          throw new Error('Invalid URL');
        }
      }),
    body('description').optional().isString().isLength({ max: 20000 }),
    body('tags').optional().isArray(),
    body('tags.*').optional().trim().isLength({ max: 64 }),
    body('isFavorite').optional().isBoolean(),
    body('projectIds').optional().isArray(),
    body('projectIds.*').optional().isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { title, url, description, isFavorite } = req.body;
      let projectIds = [];
      if (req.body.projectIds && Array.isArray(req.body.projectIds)) {
        projectIds = req.body.projectIds.filter(Boolean);
        if (projectIds.length > 0) {
          const projects = await Project.find({ _id: { $in: projectIds }, userId: req.user._id });
          if (projects.length !== projectIds.length) {
            return res.status(400).json({ message: 'One or more projects are invalid' });
          }
        }
      }
      const doc = await Reference.create({
        userId: req.user._id,
        title: title.trim(),
        url: url?.trim() || '',
        description: description != null ? String(description) : '',
        tags: normalizeTags(req.body.tags),
        isFavorite: Boolean(isFavorite),
        projectIds,
      });
      res.status(201).json(doc);
    } catch (err) {
      sendServerError(res, err);
    }
  }
);

// PUT /:id
router.put(
  '/:id',
  [
    param('id').isMongoId(),
    body('title').optional().trim().notEmpty().isLength({ max: 500 }),
    body('url')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 2048 })
      .custom((v) => {
        if (v === '' || v == null) return true;
        try {
          const u = new URL(v);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            throw new Error('URL must be http or https');
          }
          return true;
        } catch {
          throw new Error('Invalid URL');
        }
      }),
    body('description').optional().isString().isLength({ max: 20000 }),
    body('tags').optional().isArray(),
    body('tags.*').optional().trim().isLength({ max: 64 }),
    body('isFavorite').optional().isBoolean(),
    body('projectIds').optional().isArray(),
    body('projectIds.*').optional().isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const ref = await Reference.findOne({ _id: req.params.id, userId: req.user._id });
      if (!ref) return res.status(404).json({ message: 'Reference not found' });

      if (req.body.title !== undefined) ref.title = req.body.title.trim();
      if (req.body.url !== undefined) ref.url = (req.body.url && String(req.body.url).trim()) || '';
      if (req.body.description !== undefined) ref.description = String(req.body.description);
      if (req.body.tags !== undefined) ref.tags = normalizeTags(req.body.tags);
      if (req.body.isFavorite !== undefined) ref.isFavorite = Boolean(req.body.isFavorite);
      if (req.body.projectIds !== undefined) {
        let projectIds = [];
        if (Array.isArray(req.body.projectIds)) {
          projectIds = req.body.projectIds.filter(Boolean);
          if (projectIds.length > 0) {
            const projects = await Project.find({ _id: { $in: projectIds }, userId: req.user._id });
            if (projects.length !== projectIds.length) {
              return res.status(400).json({ message: 'One or more projects are invalid' });
            }
          }
        }
        ref.projectIds = projectIds;
      }

      await ref.save();
      res.json(ref);
    } catch (err) {
      sendServerError(res, err);
    }
  }
);

// DELETE /:id
router.delete(
  '/:id',
  [param('id').isMongoId()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const ref = await Reference.findOne({ _id: req.params.id, userId: req.user._id });
      if (!ref) return res.status(404).json({ message: 'Reference not found' });
      await Reference.findByIdAndDelete(req.params.id);
      res.status(204).send();
    } catch (err) {
      sendServerError(res, err);
    }
  }
);

export default router;
