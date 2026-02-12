import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    type: { type: String, required: true, enum: ['expense', 'income'] },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'BudgetCategory', required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    recurring: {
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], default: null },
      endDate: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, date: 1 });
transactionSchema.index({ userId: 1, type: 1, date: -1 });
transactionSchema.index({ userId: 1, categoryId: 1, date: -1 });

export default mongoose.model('Transaction', transactionSchema);
