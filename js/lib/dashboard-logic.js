import { normalizeExpenseCategory, normalizeMemberName } from './expense-options.js';
import { isSunkCostExpense } from './expense-flags.js';

function toAmount(value) {
  return Number(value) || 0;
}

export function splitExpenses(expenses = []) {
  const transfers = expenses.filter((expense) => expense.transfer);
  const nonTransfers = expenses.filter((expense) => !expense.transfer);
  const realExpenses = nonTransfers.filter((expense) => !expense.allocated);
  const allocExpenses = nonTransfers.filter((expense) => expense.allocated);

  return { transfers, nonTransfers, realExpenses, allocExpenses };
}

export function getEffectiveHours(worklog) {
  const hours = toAmount(worklog?.hours);
  const people = toAmount(worklog?.numberOfPeople) || 1;
  return hours * people;
}

export function getWorklogCost(worklog) {
  return getEffectiveHours(worklog) * toAmount(worklog?.hourlyRate);
}

export function calculateSummary(realExpenses = [], worklogs = [], allocExpenses = []) {
  const totalSpent = realExpenses.reduce((sum, expense) => sum + toAmount(expense.amount), 0);
  const totalAllocated = allocExpenses.reduce((sum, expense) => sum + toAmount(expense.amount), 0);
  const totalLaborCost = worklogs.reduce((sum, worklog) => sum + getWorklogCost(worklog), 0);
  const totalHours = worklogs.reduce((sum, worklog) => sum + getEffectiveHours(worklog), 0);

  return {
    totalSpent,
    totalAllocated,
    totalLaborCost,
    totalHours,
    totalAll: totalSpent + totalLaborCost
  };
}

function toMillis(item) {
  return item?.createdAt?.toMillis?.() ?? 0;
}

export function buildRecentActivity(expenses = [], worklogs = [], limit = 3) {
  const expenseItems = expenses.map((expense) => ({
    type: 'Utgift',
    date: expense.date,
    label: normalizeExpenseCategory(expense.category) + (expense.supplierName ? ` – ${expense.supplierName}` : ''),
    detail: expense.description || '',
    value: toAmount(expense.amount),
    ts: toMillis(expense)
  }));

  const worklogItems = worklogs.map((worklog) => ({
    type: 'Timer',
    date: worklog.date,
    label: worklog.contractorName,
    detail: worklog.taskDescription || '',
    value: getEffectiveHours(worklog),
    ts: toMillis(worklog)
  }));

  return [...expenseItems, ...worklogItems]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

export function buildCategoryChartData(realExpenses = [], allocExpenses = [], budgets = []) {
  const realByCategory = {};
  const allocByCategory = {};
  const budgetMap = {};

  for (const expense of realExpenses) {
    const category = normalizeExpenseCategory(expense.category);
    realByCategory[category] = (realByCategory[category] || 0) + toAmount(expense.amount);
  }

  for (const expense of allocExpenses) {
    const category = normalizeExpenseCategory(expense.category);
    allocByCategory[category] = (allocByCategory[category] || 0) + toAmount(expense.amount);
  }

  for (const budget of budgets) {
    budgetMap[budget.categoryName] = toAmount(budget.allocatedAmount);
  }

  const labels = [...new Set([
    ...Object.keys(realByCategory),
    ...Object.keys(allocByCategory)
  ])].sort((a, b) => a.localeCompare(b, 'nb'));

  return { labels, realByCategory, allocByCategory, budgetMap };
}

export function buildBudgetAnnotations(labels = [], budgetMap = {}) {
  const annotations = {};

  labels.forEach((label, index) => {
    const budget = toAmount(budgetMap[label]);
    if (budget <= 0) return;

    annotations[`budget_${index}`] = {
      type: 'line',
      xScaleID: 'x',
      yScaleID: 'y',
      xMin: index - 0.4,
      xMax: index + 0.4,
      yMin: budget,
      yMax: budget,
      borderColor: 'rgba(180,0,0,0.55)',
      borderWidth: 1.5,
      borderDash: [4, 3],
      label: {
        display: false
      }
    };
  });

  return annotations;
}

export function buildCategoryRows(realExpenses = [], budgets = []) {
  const spentByCategory = {};
  const budgetMap = {};

  for (const expense of realExpenses) {
    const category = normalizeExpenseCategory(expense.category);
    spentByCategory[category] = (spentByCategory[category] || 0) + toAmount(expense.amount);
  }

  for (const budget of budgets) {
    budgetMap[budget.categoryName] = toAmount(budget.allocatedAmount);
  }

  const allCategories = [...new Set([
    ...Object.keys(spentByCategory),
    ...budgets.map((budget) => budget.categoryName)
  ])].sort((a, b) => a.localeCompare(b, 'nb'));

  return allCategories.map((categoryName) => {
    const spent = spentByCategory[categoryName] || 0;
    const allocated = budgetMap[categoryName] || 0;

    return {
      categoryName,
      spent,
      allocated,
      remaining: allocated - spent
    };
  });
}

export function calculatePersonBalance(realExpenses = [], transfers = [], memberNamesOrThreshold = [], threshold = 10) {
  const memberNames = Array.isArray(memberNamesOrThreshold) ? memberNamesOrThreshold : [];
  const effectiveThreshold = Array.isArray(memberNamesOrThreshold) ? threshold : memberNamesOrThreshold;
  const totalsByPerson = {};
  const sunkByPerson = {};

  for (const expense of realExpenses) {
    const name = normalizeMemberName(expense.purchasedBy, memberNames) || 'Ukjent';
    if (isSunkCostExpense(expense)) {
      sunkByPerson[name] = (sunkByPerson[name] || 0) + toAmount(expense.amount);
      continue;
    }
    totalsByPerson[name] = (totalsByPerson[name] || 0) + toAmount(expense.amount);
  }

  const names = Object.keys(totalsByPerson).sort((a, b) => a.localeCompare(b, 'nb'));
  const total = Object.values(totalsByPerson).reduce((sum, value) => sum + value, 0);

  const rows = names.map((name) => ({
    name,
    amount: totalsByPerson[name],
    share: total > 0 ? Math.round(totalsByPerson[name] / total * 100) : 0
  }));

  if (names.length < 2) {
    return {
      rows,
      total,
      sunkRows: Object.keys(sunkByPerson)
        .sort((a, b) => a.localeCompare(b, 'nb'))
        .map((name) => ({ name, amount: sunkByPerson[name] })),
      totalSunk: Object.values(sunkByPerson).reduce((sum, value) => sum + value, 0),
      totalTransfers: transfers.reduce((sum, transfer) => sum + toAmount(transfer.amount), 0),
      settlement: null,
      isBalanced: false
    };
  }

  const sorted = rows.slice().sort((a, b) => b.amount - a.amount);
  let net = sorted[0].amount - total / 2;

  for (const transfer of transfers) {
    const from = normalizeMemberName(transfer.purchasedBy, memberNames);
    const amount = toAmount(transfer.amount);
    if (from === sorted[1].name) net -= amount;
    else if (from === sorted[0].name) net += amount;
  }

  const totalTransfers = transfers.reduce((sum, transfer) => sum + toAmount(transfer.amount), 0);
  const totalSunk = Object.values(sunkByPerson).reduce((sum, value) => sum + value, 0);
  const isBalanced = Math.abs(net) <= effectiveThreshold;

  if (isBalanced) {
    return {
      rows,
      total,
      sunkRows: Object.keys(sunkByPerson)
        .sort((a, b) => a.localeCompare(b, 'nb'))
        .map((name) => ({ name, amount: sunkByPerson[name] })),
      totalSunk,
      totalTransfers,
      settlement: null,
      isBalanced: true
    };
  }

  return {
    rows,
    total,
    sunkRows: Object.keys(sunkByPerson)
      .sort((a, b) => a.localeCompare(b, 'nb'))
      .map((name) => ({ name, amount: sunkByPerson[name] })),
    totalSunk,
    totalTransfers,
    settlement: {
      debtor: net > 0 ? sorted[1].name : sorted[0].name,
      creditor: net > 0 ? sorted[0].name : sorted[1].name,
      amount: Math.abs(net)
    },
    isBalanced: false
  };
}

export function aggregateContractors(worklogs = []) {
  const byContractor = {};

  for (const worklog of worklogs) {
    const name = worklog.contractorName;
    if (!byContractor[name]) {
      byContractor[name] = { name, hours: 0, cost: 0 };
    }

    byContractor[name].hours += getEffectiveHours(worklog);
    byContractor[name].cost += getWorklogCost(worklog);
  }

  return Object.values(byContractor).sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}
