import test from 'node:test';
import assert from 'node:assert/strict';

import {
  splitExpenses,
  calculateSummary,
  buildCategoryRows,
  calculatePersonBalance,
  getEffectiveHours,
  getWorklogCost,
  aggregateContractors,
  buildRecentActivity,
  isSunkCostExpense
} from '../js/lib/dashboard-logic.js';

test('splitExpenses separates transfers, allocated, and real expenses', () => {
  const expenses = [
    { amount: 100, category: 'Alpha' },
    { amount: 50, category: 'Beta', allocated: true },
    { amount: 20, category: 'Transfer', transfer: true }
  ];

  const result = splitExpenses(expenses);

  assert.equal(result.transfers.length, 1);
  assert.equal(result.nonTransfers.length, 2);
  assert.equal(result.realExpenses.length, 1);
  assert.equal(result.allocExpenses.length, 1);
});

test('calculateSummary totals expenses, allocated amounts, and labor', () => {
  const summary = calculateSummary(
    [{ amount: 100 }, { amount: 250 }],
    [
      { hours: 2, numberOfPeople: 2, hourlyRate: 500 },
      { hours: 1.5, hourlyRate: 800 }
    ],
    [{ amount: 75 }]
  );

  assert.deepEqual(summary, {
    totalSpent: 350,
    totalAllocated: 75,
    totalLaborCost: 3200,
    totalHours: 5.5,
    totalAll: 3550
  });
});

test('buildCategoryRows combines spent and budget totals by category', () => {
  const rows = buildCategoryRows(
    [
      { category: 'Alpha', amount: 100 },
      { category: '', amount: 20 },
      { category: 'Alpha', amount: 50 },
      { category: 'Beta', amount: 30 }
    ],
    [
      { categoryName: 'Alpha', allocatedAmount: 200 },
      { categoryName: 'Gamma', allocatedAmount: 10 }
    ]
  );

  assert.deepEqual(rows, [
    { categoryName: 'Alpha', spent: 150, allocated: 200, remaining: 50 },
    { categoryName: 'Beta', spent: 30, allocated: 0, remaining: -30 },
    { categoryName: 'Gamma', spent: 0, allocated: 10, remaining: 10 },
    { categoryName: 'Udefinert', spent: 20, allocated: 0, remaining: -20 }
  ]);
});

test('calculatePersonBalance handles settlement and transfer adjustments', () => {
  const balance = calculatePersonBalance(
    [
      { purchasedBy: 'Alex', amount: 700 },
      { purchasedBy: 'Robin', amount: 300 }
    ],
    [{ purchasedBy: 'Robin', amount: 50 }]
  );

  assert.deepEqual(balance.rows, [
    { name: 'Alex', amount: 700, share: 70 },
    { name: 'Robin', amount: 300, share: 30 }
  ]);
  assert.equal(balance.totalTransfers, 50);
  assert.equal(balance.isBalanced, false);
  assert.deepEqual(balance.settlement, {
    debtor: 'Robin',
    creditor: 'Alex',
    amount: 150
  });
});

test('calculatePersonBalance returns balanced when within threshold', () => {
  const balance = calculatePersonBalance(
    [
      { purchasedBy: 'Alex', amount: 505 },
      { purchasedBy: 'Robin', amount: 495 }
    ],
    [],
    10
  );

  assert.equal(balance.isBalanced, true);
  assert.equal(balance.settlement, null);
});

test('calculatePersonBalance excludes sunk cost rows from distribution', () => {
  const balance = calculatePersonBalance(
    [
      { purchasedBy: 'Owner A', amount: 700 },
      { purchasedBy: 'Owner B', amount: 300 },
      { purchasedBy: 'Owner A', amount: 47000, description: 'SUNK kost' }
    ],
    []
  );

  assert.deepEqual(balance.rows, [
    { name: 'Owner A', amount: 700, share: 70 },
    { name: 'Owner B', amount: 300, share: 30 }
  ]);
  assert.deepEqual(balance.sunkRows, [
    { name: 'Owner A', amount: 47000 }
  ]);
  assert.equal(balance.totalSunk, 47000);
  assert.deepEqual(balance.settlement, {
    debtor: 'Owner B',
    creditor: 'Owner A',
    amount: 200
  });
});

test('worklog helpers apply numberOfPeople fallback and total cost', () => {
  assert.equal(getEffectiveHours({ hours: 3, numberOfPeople: 2 }), 6);
  assert.equal(getEffectiveHours({ hours: 3 }), 3);
  assert.equal(getWorklogCost({ hours: 3, numberOfPeople: 2, hourlyRate: 400 }), 2400);
});

test('aggregateContractors totals hours and cost per contractor', () => {
  const result = aggregateContractors([
    { contractorName: 'Builder Co', hours: 2, numberOfPeople: 2, hourlyRate: 500 },
    { contractorName: 'Builder Co', hours: 1, hourlyRate: 500 },
    { contractorName: 'Electric Team', hours: 4, hourlyRate: 900 }
  ]);

  assert.deepEqual(result, [
    { name: 'Builder Co', hours: 5, cost: 2500 },
    { name: 'Electric Team', hours: 4, cost: 3600 }
  ]);
});

test('buildRecentActivity sorts by createdAt descending and preserves labels', () => {
  const timestamp = (value) => ({ toMillis: () => value });
  const recent = buildRecentActivity(
    [
      {
        category: 'Alpha',
        supplierName: 'Shop One',
        description: 'Paint',
        amount: 100,
        date: '2026-03-22',
        createdAt: timestamp(10)
      }
    ],
    [
      {
        contractorName: 'Builder Co',
        taskDescription: 'Walls',
        hours: 2,
        numberOfPeople: 2,
        date: '2026-03-23',
        createdAt: timestamp(20)
      }
    ]
  );

  assert.equal(recent[0].type, 'Timer');
  assert.equal(recent[0].value, 4);
  assert.equal(recent[1].label, 'Alpha – Shop One');
});

test('isSunkCostExpense supports explicit flag and legacy description fallback', () => {
  assert.equal(isSunkCostExpense({ sunkCost: true }), true);
  assert.equal(isSunkCostExpense({ description: 'SUNK kost' }), true);
  assert.equal(isSunkCostExpense({ description: 'Paint' }), false);
});
