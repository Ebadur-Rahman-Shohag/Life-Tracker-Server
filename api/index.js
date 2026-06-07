import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';

import { assertProductionJwtConfig } from '../utils/jwtConfig.js';
import { buildCorsOptions } from '../utils/corsConfig.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import authRoutes from '../routes/auth.js';
import activityRoutes from '../routes/activities.js';
import projectRoutes from '../routes/projects.js';
import taskRoutes from '../routes/tasks.js';
import habitRoutes from '../routes/habits.js';
import prayerRoutes from '../routes/prayers.js';
import budgetRoutes from '../routes/budget.js';
import noteRoutes from '../routes/notes.js';
import referenceRoutes from '../routes/references.js';

assertProductionJwtConfig();

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions = buildCorsOptions();
app.use(cors(corsOptions));

// Handle OPTIONS requests explicitly before other middleware
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '2mb' }));
app.use('/api', apiRateLimiter);

// MongoDB connection - reuse connection if exists
let cachedDb = null;
let searchTextBackfillStarted = false;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }

  try {
    const db = await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/life-tracker',
      {
        serverSelectionTimeoutMS: 5000,
      }
    );
    cachedDb = db;
    if (!searchTextBackfillStarted) {
      searchTextBackfillStarted = true;
      if (process.env.RUN_NOTE_SEARCH_BACKFILL === 'true') {
        const { backfillNoteSearchText } = await import('../jobs/backfillNoteSearchText.js');
        backfillNoteSearchText().catch((e) => console.error('[notes] searchText backfill failed:', e));
      }
    }
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Database connection middleware - skip for OPTIONS requests
app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('Database connection failed:', error);
    res.status(500).json({ message: 'Database connection failed' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/prayers', prayerRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/references', referenceRoutes);

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Root route handler
app.get('/', (_, res) => {
  res.json({
    message: 'Life Tracker API',
    status: 'running',
    endpoints: {
      auth: '/api/auth',
      activities: '/api/activities',
      projects: '/api/projects',
      tasks: '/api/tasks',
      habits: '/api/habits',
      prayers: '/api/prayers',
      budget: '/api/budget',
      notes: '/api/notes',
      references: '/api/references',
      health: '/api/health',
    },
  });
});

app.use((err, _req, res, _next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ message: 'Server error' });
});

// Export the Express app directly for Vercel
export default app;
