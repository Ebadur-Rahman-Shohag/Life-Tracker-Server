import mongoose from 'mongoose';

const streakSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    milestone: { type: Number, required: true }, // 30, 50, 75, 100, 150, 200, 250, 300, 365
    achievedAt: { type: Date, required: true },
    reward: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// One milestone per user
streakSchema.index({ userId: 1, milestone: 1 }, { unique: true });

export default mongoose.model('Streak', streakSchema);
