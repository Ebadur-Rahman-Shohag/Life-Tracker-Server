import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import authRoutes from '../routes/auth.js';
import activityRoutes from '../routes/activities.js';
import projectRoutes from '../routes/projects.js';
import taskRoutes from '../routes/tasks.js';
import habitRoutes from '../routes/habits.js';
import prayerRoutes from '../routes/prayers.js';
import budgetRoutes from '../routes/budget.js';
import noteRoutes from '../routes/notes.js';

const app = express();

// CORS configuration - allow your frontend domain
app.use(cors({ 
  origin: process.env.CLIENT_ORIGIN || '*',
  credentials: true 
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/prayers', prayerRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/notes', noteRoutes);

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
      health: '/api/health'
    }
  });
});

// MongoDB connection - reuse connection if exists
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
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
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Vercel serverless function handler
export default async function handler(req, res) {
  // Connect to database
  await connectToDatabase();
  
  // Handle the request with Express
  app(req, res);
}
