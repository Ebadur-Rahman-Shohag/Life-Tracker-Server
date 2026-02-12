import mongoose from 'mongoose';

const PRAYER_TYPES = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];

const prayerEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    prayerType: { type: String, required: true, enum: PRAYER_TYPES, index: true },
    prayed: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Ensure one entry per user per prayer per day
prayerEntrySchema.index({ userId: 1, date: 1, prayerType: 1 }, { unique: true });

export { PRAYER_TYPES };
export default mongoose.model('PrayerEntry', prayerEntrySchema);
