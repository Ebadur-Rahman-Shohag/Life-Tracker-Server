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
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://life-tracker-frontend-seven.vercel.app',
  ...(process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : [])
];

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } 
    // Allow all Vercel preview deployments (for development/preview branches)
    else if (origin.includes('.vercel.app')) {
      callback(null, true);
    }
    // In development, allow all origins
    else if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } 
    // In production, allow all for now (can restrict later)
    else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control', 'Pragma', 'Expires'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle OPTIONS requests explicitly before other middleware
app.options('*', cors(corsOptions));

app.use(express.json());

// MongoDB connection - reuse connection if exists
let cachedDb = null;

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
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Database connection middleware - skip for OPTIONS requests
app.use(async (req, res, next) => {
  // Skip database connection for OPTIONS requests
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

// Export the Express app directly for Vercel
export default app;
