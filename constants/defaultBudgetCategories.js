export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Groceries', icon: '🛒', color: '#10b981', type: 'expense' },
  { name: 'Rent', icon: '🏠', color: '#3b82f6', type: 'expense' },
  { name: 'Restaurant', icon: '🍽️', color: '#f59e0b', type: 'expense' },
  { name: 'Transport', icon: '🚗', color: '#8b5cf6', type: 'expense' },
  { name: 'Shopping', icon: '🛍️', color: '#ec4899', type: 'expense' },
  { name: 'Utilities', icon: '💡', color: '#f97316', type: 'expense' },
  { name: 'Subscriptions', icon: '🔄', color: '#06b6d4', type: 'expense' },
  { name: 'Activities', icon: '🎯', color: '#84cc16', type: 'expense' },
  { name: 'Healthcare', icon: '🏥', color: '#ef4444', type: 'expense' },
  { name: 'Education', icon: '📚', color: '#6366f1', type: 'expense' },
  { name: 'Personal Care', icon: '💅', color: '#ec4899', type: 'expense' },
  { name: 'Other', icon: '📦', color: '#6b7280', type: 'expense' },
];

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', icon: '💰', color: '#10b981', type: 'income' },
  { name: 'Freelance', icon: '💼', color: '#3b82f6', type: 'income' },
  { name: 'Investment', icon: '📈', color: '#f59e0b', type: 'income' },
  { name: 'Refund', icon: '↩️', color: '#8b5cf6', type: 'income' },
  { name: 'Gift', icon: '🎁', color: '#ec4899', type: 'income' },
  { name: 'Other', icon: '📦', color: '#6b7280', type: 'income' },
];

export const ALL_DEFAULT_CATEGORIES = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
];
