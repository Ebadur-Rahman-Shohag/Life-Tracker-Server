import mongoose from 'mongoose';

const budgetCategorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['expense', 'income'] },
    icon: { type: String, trim: true, default: '' },
    color: { type: String, trim: true, default: '#10b981' },
    budgetLimit: { type: Number, default: null }, // Monthly budget limit (only for expenses)
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

budgetCategorySchema.index({ userId: 1, type: 1 });
budgetCategorySchema.index({ userId: 1, isActive: 1 });
// Unique index to prevent duplicate categories per user
budgetCategorySchema.index({ userId: 1, name: 1, type: 1 }, { unique: true });

export default mongoose.model('BudgetCategory', budgetCategorySchema);
