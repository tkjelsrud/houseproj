export function isSunkCostExpense(expense) {
  if (expense?.sunkCost === true) return true;
  const description = typeof expense?.description === 'string' ? expense.description.trim().toLowerCase() : '';
  return description === 'sunk kost';
}
