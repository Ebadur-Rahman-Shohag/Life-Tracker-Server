import BudgetCategory from '../models/BudgetCategory.js';
import { ALL_DEFAULT_CATEGORIES } from '../constants/defaultBudgetCategories.js';

export async function seedDefaultBudgetCategories(userId) {
  const docs = ALL_DEFAULT_CATEGORIES.map((cat) => ({
    userId,
    name: cat.name,
    type: cat.type,
    icon: cat.icon || '',
    color: cat.color || '#10b981',
    budgetLimit: null,
    isActive: true,
  }));

  try {
    await BudgetCategory.insertMany(docs, { ordered: false });
  } catch (err) {
    const isDuplicateOnly =
      err.code === 11000 ||
      (err.writeErrors && err.writeErrors.every((e) => e.err?.code === 11000));
    if (!isDuplicateOnly) throw err;
  }
}
