export function isSunkCostExpense(expense) {
  if (expense?.sunkCost === true) return true;
  const description = typeof expense?.description === 'string' ? expense.description.trim().toLowerCase() : '';
  return description === 'sunk kost';
}

export function normalizeExpenseFlags(flags = {}, preferredFlag = '') {
  const normalized = {
    allocated: flags.allocated === true,
    transfer: flags.transfer === true,
    sunkCost: flags.sunkCost === true
  };

  if (preferredFlag === 'sunkCost' && normalized.sunkCost) {
    return { allocated: false, transfer: false, sunkCost: true };
  }

  if (preferredFlag === 'transfer' && normalized.transfer) {
    return { allocated: false, transfer: true, sunkCost: false };
  }

  if (preferredFlag === 'allocated' && normalized.allocated) {
    return { allocated: true, transfer: false, sunkCost: false };
  }

  if (normalized.sunkCost) return { allocated: false, transfer: false, sunkCost: true };
  if (normalized.transfer) return { allocated: false, transfer: true, sunkCost: false };
  if (normalized.allocated) return { allocated: true, transfer: false, sunkCost: false };

  return normalized;
}
