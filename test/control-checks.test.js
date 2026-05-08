import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateIndependentSnapshot,
  buildSuggestedExpectations,
  normalizeExpectations,
  runControlChecks
} from '../js/lib/control-checks.js';

test('calculateIndependentSnapshot derives live totals without dashboard helpers', () => {
  const snapshot = calculateIndependentSnapshot({
    appConfig: { memberNames: ['Member A', 'Member B'] },
    runtimeConfig: { allowedUids: ['uid-a', 'uid-b'] },
    expenses: [
      { date: '2026-05-01', amount: 100, purchasedBy: 'Member A' },
      { date: '2026-05-02', amount: 40, allocated: true, purchasedBy: 'Member B' },
      { date: '2026-05-03', amount: 25, transfer: true, purchasedBy: 'Member B' },
      { date: '2026-05-04', amount: 70, sunkCost: true, purchasedBy: 'Member A' }
    ],
    worklogs: [
      { date: '2026-05-10', contractorName: 'Builder Co', hours: 2, numberOfPeople: 2, hourlyRate: 500 },
      { date: '2026-05-12', contractorName: 'Builder Co', hours: 1, hourlyRate: 500 }
    ]
  }, new Date('2026-05-20T12:00:00Z'));

  assert.deepEqual(snapshot, {
    allowedUidCount: 2,
    memberCount: 2,
    expenseCount: 4,
    worklogCount: 2,
    transactionCount: 6,
    currentYearExpenseCount: 4,
    currentYearWorklogCount: 2,
    currentYearTransactionCount: 6,
    realExpenseTotal: 170,
    allocatedExpenseTotal: 40,
    transferExpenseTotal: 25,
    sunkCostTotal: 70,
    laborHoursTotal: 5,
    laborCostTotal: 2500,
    grandTotal: 2670,
    uniquePurchaserCount: 2,
    uniqueContractorCount: 1
  });
});

test('buildSuggestedExpectations captures current live counts as a baseline', () => {
  const baseline = buildSuggestedExpectations({
    allowedUidCount: 2,
    memberCount: 2,
    expenseCount: 10,
    worklogCount: 6,
    transactionCount: 16,
    currentYearTransactionCount: 14
  }, new Date('2026-05-20T12:00:00Z'));

  assert.deepEqual(baseline, {
    savedAt: '2026-05-20T12:00:00.000Z',
    expectedAllowedUidCount: 2,
    expectedMemberCount: 2,
    minExpenseCount: 10,
    minWorklogCount: 6,
    minTransactionCount: 16,
    minCurrentYearTransactionCount: 14
  });
});

test('normalizeExpectations rejects invalid thresholds', () => {
  assert.deepEqual(normalizeExpectations({
    expectedAllowedUidCount: '2',
    expectedMemberCount: '-1',
    minExpenseCount: 'abc',
    minWorklogCount: '',
    minTransactionCount: 4.8,
    minCurrentYearTransactionCount: null
  }), {
    savedAt: '',
    expectedAllowedUidCount: 2,
    expectedMemberCount: null,
    minExpenseCount: null,
    minWorklogCount: null,
    minTransactionCount: 4,
    minCurrentYearTransactionCount: null
  });
});

test('runControlChecks compares thresholds and app aggregates against raw data', () => {
  const result = runControlChecks({
    snapshot: {
      allowedUidCount: 2,
      memberCount: 2,
      expenseCount: 4,
      worklogCount: 2,
      transactionCount: 6,
      currentYearTransactionCount: 6,
      realExpenseTotal: 170,
      allocatedExpenseTotal: 40,
      laborHoursTotal: 5,
      laborCostTotal: 2500,
      grandTotal: 2670
    },
    expectations: {
      expectedAllowedUidCount: 2,
      expectedMemberCount: 2,
      minExpenseCount: 3,
      minWorklogCount: 2,
      minTransactionCount: 6,
      minCurrentYearTransactionCount: 5
    },
    appSummary: {
      totalSpent: 170,
      totalAllocated: 40,
      totalHours: 5,
      totalLaborCost: 2500,
      totalAll: 2670
    },
    appCategoryRows: [
      { spent: 100 },
      { spent: 70 }
    ],
    appContractors: [
      { hours: 5, cost: 2500 }
    ]
  });

  assert.equal(result.failedCount, 0);
  assert.equal(result.passedCount, result.totalCount);
});
