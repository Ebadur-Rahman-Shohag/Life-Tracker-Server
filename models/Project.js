import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    archived: { type: Boolean, default: false },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true, default: null },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

projectSchema.index({ userId: 1, order: 1 });
projectSchema.index({ userId: 1, parentId: 1, order: 1 });

export default mongoose.model('Project', projectSchema);
