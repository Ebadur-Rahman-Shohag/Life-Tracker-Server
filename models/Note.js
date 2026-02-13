import mongoose from 'mongoose';

// Block schema for structured content
const blockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['paragraph', 'heading', 'heading1', 'heading2', 'heading3', 'code', 'checklist', 'table', 'bulletedList', 'numberedList', 'quote'],
    },
    content: { type: mongoose.Schema.Types.Mixed, default: null }, // Can be string, array, or object depending on block type
    attrs: { type: mongoose.Schema.Types.Mixed, default: {} }, // Additional attributes (language for code, checked for checklist, etc.)
  },
  { _id: false }
);

const noteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    // Support both old plain text and new block-based content
    content: { type: String, default: '' }, // Legacy: plain text (for backward compatibility)
    blocks: { type: mongoose.Schema.Types.Mixed, default: null }, // New: block-based content (TipTap JSON object)
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

