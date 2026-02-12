import mongoose from 'mongoose';

const ALLOWED_CATEGORIES = [
  'work', 'learning', 'habit', 'sleep', 'breakfast', 'lunch', 'dinner',
  'exercise', 'family', 'entertainment', 'reading', 'expenses', 'water',
  'mood', 'income', 'meditation', 'social', 'notes',
  'fajr', 'zuhr', 'asr', 'maghrib', 'isha',
];

const activitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    category: { type: String, required: true, enum: ALLOWED_CATEGORIES },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    unit: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

activitySchema.index({ userId: 1, date: 1, category: 1 });

export { ALLOWED_CATEGORIES };
export default mongoose.model('Activity', activitySchema);
