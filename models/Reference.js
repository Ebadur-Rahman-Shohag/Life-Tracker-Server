import mongoose from 'mongoose';

const referenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    url: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    tags: [{ type: String, trim: true }],
    isFavorite: { type: Boolean, default: false },
    projectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  },
  { timestamps: true }
);

referenceSchema.index({ userId: 1, updatedAt: -1 });
referenceSchema.index({ userId: 1, isFavorite: 1, updatedAt: -1 });
referenceSchema.index({ userId: 1, projectIds: 1 });

export default mongoose.model('Reference', referenceSchema);
