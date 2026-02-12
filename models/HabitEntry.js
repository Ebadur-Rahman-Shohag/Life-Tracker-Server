import mongoose from 'mongoose';

const habitEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    habitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Habit', required: true, index: true },
    date: { type: Date, required: true, index: true },
    completed: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Ensure one entry per user per habit per day
habitEntrySchema.index({ userId: 1, habitId: 1, date: 1 }, { unique: true });

export default mongoose.model('HabitEntry', habitEntrySchema);
