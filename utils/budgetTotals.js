import mongoose from 'mongoose';
import BudgetCategory from '../models/BudgetCategory.js';
import Transaction from '../models/Transaction.js';

/**
 * Lightweight budget totals for dashboard (no full category list in response).
 */
export async function getBudgetDashboardTotals(userId, startDate, endDate) {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const categoryCollection = BudgetCategory.collection.name;

  const [facetResult] = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $lookup: {
        from: categoryCollection,
        localField: 'categoryId',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $match: { category: { $ne: [] } } },
    { $unwind: '$category' },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: '$type',
              total: { $sum: '$amount' },
            },
          },
        ],
        byCategory: [
          { $match: { type: 'expense' } },
          {
            $group: {
              _id: '$categoryId',
              budgetLimit: { $first: '$category.budgetLimit' },
              total: { $sum: '$amount' },
            },
          },
        ],
      },
    },
  ]);

  const { totals = [], byCategory = [] } = facetResult || {};

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const row of totals) {
    if (row._id === 'income') totalIncome = row.total;
    if (row._id === 'expense') totalExpenses = row.total;
  }

  let categoriesOver80Count = 0;
  for (const cat of byCategory) {
    if (cat.budgetLimit && cat.budgetLimit > 0) {
      const percentage = Math.round((cat.total / cat.budgetLimit) * 100);
      if (percentage >= 80) categoriesOver80Count++;
    }
  }

  return {
    net: totalIncome - totalExpenses,
    totalIncome,
    totalExpenses,
    categoriesOver80Count,
  };
}
