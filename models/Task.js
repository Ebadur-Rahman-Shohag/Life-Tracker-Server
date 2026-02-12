import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
    date: { type: Date, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    dueDate: { type: Date },
    order: { type: Number, default: 0 },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    notes: { type: String, trim: true, default: '' },
    recurrenceRule: { type: String, enum: ['daily', 'weekly', 'weekdays'], default: null },
  },
  { timestamps: true }
);

taskSchema.index({ userId: 1, date: 1 });
taskSchema.index({ userId: 1, projectId: 1 });

export default mongoose.model('Task', taskSchema);
