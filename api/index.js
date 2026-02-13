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

app.use(cors({ 
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
    // In production, only allow listed origins or Vercel domains
    else {
      callback(null, true); // Temporarily allow all for debugging - restrict later if needed
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
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

// Helper function to set CORS headers
function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://life-tracker-frontend-seven.vercel.app',
    ...(process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : [])
  ];
  
  // Determine if origin should be allowed
  let allowOrigin = null;
  
  if (!origin) {
    // No origin header (e.g., Postman, curl) - allow but don't set credentials
    allowOrigin = '*';
  } else if (allowedOrigins.indexOf(origin) !== -1) {
    // Origin is in explicit allowed list
    allowOrigin = origin;
  } else if (origin.includes('.vercel.app')) {
    // Allow all Vercel preview deployments
    allowOrigin = origin;
  } else if (process.env.NODE_ENV !== 'production') {
    // In development, allow all origins
    allowOrigin = origin;
  }
  
  // Always set CORS headers if we have an origin or are allowing all
  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    if (allowOrigin !== '*') {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
  } else {
    // Fallback: allow the origin anyway (for debugging - remove in production if needed)
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    if (origin) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

// Vercel serverless function handler
export default async function handler(req, res) {
  // Handle OPTIONS preflight requests explicitly (required for Vercel serverless)
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    return res.status(200).end();
  }
  
  // For other requests, CORS middleware will handle headers
  // Connect to database
  await connectToDatabase();
  
  // Handle the request with Express
  app(req, res);
}
