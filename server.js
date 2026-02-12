import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.js';
import activityRoutes from './routes/activities.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import habitRoutes from './routes/habits.js';
import prayerRoutes from './routes/prayers.js';
import budgetRoutes from './routes/budget.js';
import noteRoutes from './routes/notes.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/prayers', prayerRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/notes', noteRoutes);

app.get('/api/health', (_, res) => res.json({ ok: true }));

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/life-tracker')
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
