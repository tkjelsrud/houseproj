function toAmount(value) {
  return Number(value) || 0;
}

function toCount(value) {
  if (value === '' || value === null || value === undefined) return null;
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return null;
  return Math.floor(count);
}

function isCurrentYear(dateValue, year) {
  return typeof dateValue === 'string' && dateValue.startsWith(`${year}-`);
}

function isSunkCost(expense) {
  if (expense?.sunkCost === true) return true;
  const description = typeof expense?.description === 'string' ? expense.description.trim().toLowerCase() : '';
  return description === 'sunk kost';
}

function uniqueTrimmedCount(values = []) {
  const seen = new Set();

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    seen.add(trimmed);
  }

  return seen.size;
}

export function calculateIndependentSnapshot({ appConfig = {}, runtimeConfig = {}, expenses = [], worklogs = [] }, today = new Date()) {
  const currentYear = today.getFullYear();

  let expenseCount = 0;
  let worklogCount = 0;
  let currentYearExpenseCount = 0;
  let currentYearWorklogCount = 0;
  let realExpenseTotal = 0;
  let allocatedExpenseTotal = 0;
  let transferExpenseTotal = 0;
  let sunkCostTotal = 0;
  let laborHoursTotal = 0;
  let laborCostTotal = 0;

  const purchasers = new Set();
  const contractors = new Set();

  for (const expense of expenses) {
    expenseCount += 1;

    if (isCurrentYear(expense?.date, currentYear)) {
      currentYearExpenseCount += 1;
    }

    if (typeof expense?.purchasedBy === 'string' && expense.purchasedBy.trim()) {
      purchasers.add(expense.purchasedBy.trim());
    }

    const amount = toAmount(expense?.amount);

    if (expense?.transfer === true) {
      transferExpenseTotal += amount;
      continue;
    }

    if (expense?.allocated === true) {
      allocatedExpenseTotal += amount;
      continue;
    }

    realExpenseTotal += amount;

    if (isSunkCost(expense)) {
      sunkCostTotal += amount;
    }
  }

  for (const worklog of worklogs) {
    worklogCount += 1;

    if (isCurrentYear(worklog?.date, currentYear)) {
      currentYearWorklogCount += 1;
    }

    if (typeof worklog?.contractorName === 'string' && worklog.contractorName.trim()) {
      contractors.add(worklog.contractorName.trim());
    }

    const hours = toAmount(worklog?.hours);
    const people = toAmount(worklog?.numberOfPeople) || 1;
    const effectiveHours = hours * people;

    laborHoursTotal += effectiveHours;
    laborCostTotal += effectiveHours * toAmount(worklog?.hourlyRate);
  }

  return {
    allowedUidCount: uniqueTrimmedCount(runtimeConfig.allowedUids),
    memberCount: uniqueTrimmedCount(appConfig.memberNames),
    expenseCount,
    worklogCount,
    transactionCount: expenseCount + worklogCount,
    currentYearExpenseCount,
    currentYearWorklogCount,
    currentYearTransactionCount: currentYearExpenseCount + currentYearWorklogCount,
    realExpenseTotal,
    allocatedExpenseTotal,
    transferExpenseTotal,
    sunkCostTotal,
    laborHoursTotal,
    laborCostTotal,
    grandTotal: realExpenseTotal + laborCostTotal,
    uniquePurchaserCount: purchasers.size,
    uniqueContractorCount: contractors.size
  };
}

export function buildSuggestedExpectations(snapshot, savedAt = new Date()) {
  return {
    savedAt: savedAt.toISOString(),
    expectedAllowedUidCount: snapshot.allowedUidCount,
    expectedMemberCount: snapshot.memberCount,
    minExpenseCount: snapshot.expenseCount,
    minWorklogCount: snapshot.worklogCount,
    minTransactionCount: snapshot.transactionCount,
    minCurrentYearTransactionCount: snapshot.currentYearTransactionCount
  };
}

export function normalizeExpectations(values = {}) {
  return {
    savedAt: typeof values.savedAt === 'string' ? values.savedAt : '',
    expectedAllowedUidCount: toCount(values.expectedAllowedUidCount),
    expectedMemberCount: toCount(values.expectedMemberCount),
    minExpenseCount: toCount(values.minExpenseCount),
    minWorklogCount: toCount(values.minWorklogCount),
    minTransactionCount: toCount(values.minTransactionCount),
    minCurrentYearTransactionCount: toCount(values.minCurrentYearTransactionCount)
  };
}

function makeCheck(name, passed, details) {
  return { name, passed, details };
}

export function runControlChecks({
  snapshot,
  expectations,
  appSummary,
  appCategoryRows = [],
  appContractors = []
}) {
  const normalized = normalizeExpectations(expectations);
  const checks = [];

  if (normalized.expectedAllowedUidCount !== null) {
    checks.push(makeCheck(
      'Configured access accounts',
      snapshot.allowedUidCount === normalized.expectedAllowedUidCount,
      `Expected ${normalized.expectedAllowedUidCount}, found ${snapshot.allowedUidCount}`
    ));
  }

  if (normalized.expectedMemberCount !== null) {
    checks.push(makeCheck(
      'Configured project members',
      snapshot.memberCount === normalized.expectedMemberCount,
      `Expected ${normalized.expectedMemberCount}, found ${snapshot.memberCount}`
    ));
  }

  if (normalized.minExpenseCount !== null) {
    checks.push(makeCheck(
      'Minimum expense count',
      snapshot.expenseCount >= normalized.minExpenseCount,
      `Expected at least ${normalized.minExpenseCount}, found ${snapshot.expenseCount}`
    ));
  }

  if (normalized.minWorklogCount !== null) {
    checks.push(makeCheck(
      'Minimum worklog count',
      snapshot.worklogCount >= normalized.minWorklogCount,
      `Expected at least ${normalized.minWorklogCount}, found ${snapshot.worklogCount}`
    ));
  }

  if (normalized.minTransactionCount !== null) {
    checks.push(makeCheck(
      'Minimum transaction count',
      snapshot.transactionCount >= normalized.minTransactionCount,
      `Expected at least ${normalized.minTransactionCount}, found ${snapshot.transactionCount}`
    ));
  }

  if (normalized.minCurrentYearTransactionCount !== null) {
    checks.push(makeCheck(
      'Minimum current-year transactions',
      snapshot.currentYearTransactionCount >= normalized.minCurrentYearTransactionCount,
      `Expected at least ${normalized.minCurrentYearTransactionCount}, found ${snapshot.currentYearTransactionCount}`
    ));
  }

  if (appSummary) {
    checks.push(makeCheck(
      'Real expense total matches app summary',
      snapshot.realExpenseTotal === toAmount(appSummary.totalSpent),
      `Control ${snapshot.realExpenseTotal} vs app ${toAmount(appSummary.totalSpent)}`
    ));
    checks.push(makeCheck(
      'Allocated expense total matches app summary',
      snapshot.allocatedExpenseTotal === toAmount(appSummary.totalAllocated),
      `Control ${snapshot.allocatedExpenseTotal} vs app ${toAmount(appSummary.totalAllocated)}`
    ));
    checks.push(makeCheck(
      'Labor hours match app summary',
      snapshot.laborHoursTotal === toAmount(appSummary.totalHours),
      `Control ${snapshot.laborHoursTotal} vs app ${toAmount(appSummary.totalHours)}`
    ));
    checks.push(makeCheck(
      'Labor cost matches app summary',
      snapshot.laborCostTotal === toAmount(appSummary.totalLaborCost),
      `Control ${snapshot.laborCostTotal} vs app ${toAmount(appSummary.totalLaborCost)}`
    ));
    checks.push(makeCheck(
      'Grand total matches app summary',
      snapshot.grandTotal === toAmount(appSummary.totalAll),
      `Control ${snapshot.grandTotal} vs app ${toAmount(appSummary.totalAll)}`
    ));
  }

  const categorySpentTotal = appCategoryRows.reduce((sum, row) => sum + toAmount(row?.spent), 0);
  checks.push(makeCheck(
    'Category table spent total matches raw data',
    categorySpentTotal === snapshot.realExpenseTotal,
    `Category rows ${categorySpentTotal} vs raw ${snapshot.realExpenseTotal}`
  ));

  const contractorHoursTotal = appContractors.reduce((sum, contractor) => sum + toAmount(contractor?.hours), 0);
  checks.push(makeCheck(
    'Contractor table hour total matches raw data',
    contractorHoursTotal === snapshot.laborHoursTotal,
    `Contractor rows ${contractorHoursTotal} vs raw ${snapshot.laborHoursTotal}`
  ));

  const contractorCostTotal = appContractors.reduce((sum, contractor) => sum + toAmount(contractor?.cost), 0);
  checks.push(makeCheck(
    'Contractor table cost total matches raw data',
    contractorCostTotal === snapshot.laborCostTotal,
    `Contractor rows ${contractorCostTotal} vs raw ${snapshot.laborCostTotal}`
  ));

  return {
    checks,
    totalCount: checks.length,
    passedCount: checks.filter((check) => check.passed).length,
    failedCount: checks.filter((check) => !check.passed).length
  };
}
