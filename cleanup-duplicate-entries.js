/**
 * Cleanup script for duplicate habit and prayer entries caused by timezone bug
 * 
 * The bug: normalizeDate was using local timezone, causing the same date to be
 * stored with different timestamps (e.g., 2026-02-12T00:00:00 local vs UTC)
 * 
 * This script:
 * 1. Finds duplicate entries for the same user/habit/date or user/prayer/date
 * 2. Keeps only the most recent entry
 * 3. Deletes older duplicates
 * 
 * Run with: node cleanup-duplicate-entries.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import HabitEntry from './models/HabitEntry.js';
import PrayerEntry from './models/PrayerEntry.js';

dotenv.config();

// Helper to normalize date to start of day (UTC) - matches the fixed version
function normalizeDate(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

async function cleanupHabitEntries() {
  console.log('\n=== Cleaning up Habit Entries ===');
  
  const entries = await HabitEntry.find({}).sort({ date: 1 }).lean();
  console.log(`Found ${entries.length} total habit entries`);
  
  // Group by user + habit + normalized date
  const groups = new Map();
  
  entries.forEach(entry => {
    const normalizedDate = normalizeDate(entry.date);
    const key = `${entry.userId}_${entry.habitId}_${normalizedDate.toISOString()}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  });
  
  // Find duplicates
  let duplicateCount = 0;
  let deletedCount = 0;
  
  for (const [key, groupEntries] of groups.entries()) {
    if (groupEntries.length > 1) {
      duplicateCount++;
      console.log(`\nFound ${groupEntries.length} duplicates for key: ${key}`);
      
      // Sort by createdAt (or _id if no createdAt), keep the most recent
      groupEntries.sort((a, b) => {
        const aTime = a.createdAt || a._id.getTimestamp();
        const bTime = b.createdAt || b._id.getTimestamp();
        return bTime - aTime; // Descending (newest first)
      });
      
      const toKeep = groupEntries[0];
      const toDelete = groupEntries.slice(1);
      
      console.log(`  Keeping: ${toKeep._id} (date: ${toKeep.date})`);
      
      for (const entry of toDelete) {
        console.log(`  Deleting: ${entry._id} (date: ${entry.date})`);
        await HabitEntry.findByIdAndDelete(entry._id);
        deletedCount++;
      }
    }
  }
  
  console.log(`\nHabit Entries Summary:`);
  console.log(`  Total entries: ${entries.length}`);
  console.log(`  Duplicate groups: ${duplicateCount}`);
  console.log(`  Entries deleted: ${deletedCount}`);
  console.log(`  Entries remaining: ${entries.length - deletedCount}`);
}

async function cleanupPrayerEntries() {
  console.log('\n=== Cleaning up Prayer Entries ===');
  
  const entries = await PrayerEntry.find({}).sort({ date: 1 }).lean();
  console.log(`Found ${entries.length} total prayer entries`);
  
  // Group by user + prayerType + normalized date
  const groups = new Map();
  
  entries.forEach(entry => {
    const normalizedDate = normalizeDate(entry.date);
    const key = `${entry.userId}_${entry.prayerType}_${normalizedDate.toISOString()}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  });
  
  // Find duplicates
  let duplicateCount = 0;
  let deletedCount = 0;
  
  for (const [key, groupEntries] of groups.entries()) {
    if (groupEntries.length > 1) {
      duplicateCount++;
      console.log(`\nFound ${groupEntries.length} duplicates for key: ${key}`);
      
      // Sort by createdAt (or _id if no createdAt), keep the most recent
      groupEntries.sort((a, b) => {
        const aTime = a.createdAt || a._id.getTimestamp();
        const bTime = b.createdAt || b._id.getTimestamp();
        return bTime - aTime; // Descending (newest first)
      });
      
      const toKeep = groupEntries[0];
      const toDelete = groupEntries.slice(1);
      
      console.log(`  Keeping: ${toKeep._id} (date: ${toKeep.date}, prayed: ${toKeep.prayed})`);
      
      for (const entry of toDelete) {
        console.log(`  Deleting: ${entry._id} (date: ${entry.date}, prayed: ${entry.prayed})`);
        await PrayerEntry.findByIdAndDelete(entry._id);
        deletedCount++;
      }
    }
  }
  
  console.log(`\nPrayer Entries Summary:`);
  console.log(`  Total entries: ${entries.length}`);
  console.log(`  Duplicate groups: ${duplicateCount}`);
  console.log(`  Entries deleted: ${deletedCount}`);
  console.log(`  Entries remaining: ${entries.length - deletedCount}`);
}

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    await cleanupHabitEntries();
    await cleanupPrayerEntries();
    
    console.log('\n=== Cleanup Complete ===');
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

main();
