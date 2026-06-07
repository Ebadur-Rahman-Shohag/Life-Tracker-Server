import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    // Support both old plain text and new block-based content
    content: { type: String, default: '' }, // Legacy: plain text (for backward compatibility)
    blocks: { type: mongoose.Schema.Types.Mixed, default: null }, // TipTap JSON: { type: 'doc', ... }
    /** Denormalized plain text for search (from blocks or legacy content). */
    searchText: { type: String, default: '' },
    category: { type: String, default: 'Uncategorized', trim: true },
    isFavorite: { type: Boolean, default: false },
    tags: [{ type: String, trim: true }],
    color: { type: String, default: '' },
    archived: { type: Boolean, default: false },
    projectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  },
  { timestamps: true }
);

noteSchema.index({ userId: 1, archived: 1, updatedAt: -1 });
noteSchema.index({ userId: 1, category: 1, archived: 1, updatedAt: -1 });
noteSchema.index({ userId: 1, projectIds: 1 });

export default mongoose.model('Note', noteSchema);
