import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';

import { assertProductionJwtConfig } from './utils/jwtConfig.js';
import { buildCorsOptions } from './utils/corsConfig.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import activityRoutes from './routes/activities.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import habitRoutes from './routes/habits.js';
import prayerRoutes from './routes/prayers.js';
import budgetRoutes from './routes/budget.js';
import noteRoutes from './routes/notes.js';
import referenceRoutes from './routes/references.js';
import { backfillNoteSearchText } from './jobs/backfillNoteSearchText.js';

assertProductionJwtConfig();

const app = express();
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions = buildCorsOptions();
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use('/api', apiRateLimiter);

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

app.use((err, _req, res, _next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ message: 'Server error' });
});

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/life-tracker')
  .then(() => {
    backfillNoteSearchText().catch((e) => console.error('[notes] searchText backfill failed:', e));
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
