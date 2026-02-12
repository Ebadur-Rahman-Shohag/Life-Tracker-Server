import mongoose from 'mongoose';

const noteCategorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    icon: { type: String, trim: true, default: '' },
    color: { type: String, trim: true, default: '#10b981' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

noteCategorySchema.index({ userId: 1, isActive: 1 });
// Unique index to prevent duplicate category names per user
noteCategorySchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model('NoteCategory', noteCategorySchema);
