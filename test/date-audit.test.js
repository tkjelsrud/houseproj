import test from 'node:test';
import assert from 'node:assert/strict';

import { findSuspiciousDatedRows, suggestDateAtOrAfterCutoff } from '../js/lib/date-audit.js';

test('suggestDateAtOrAfterCutoff preserves month/day and moves early-2025 dates into 2026 when needed', () => {
  assert.equal(suggestDateAtOrAfterCutoff('2025-03-14', '2025-08-01'), '2026-03-14');
});

test('suggestDateAtOrAfterCutoff can lift a 2024 date into 2025', () => {
  assert.equal(suggestDateAtOrAfterCutoff('2024-09-10', '2025-08-01'), '2025-09-10');
});

test('findSuspiciousDatedRows returns expenses and worklogs before the cutoff date', () => {
  const rows = findSuspiciousDatedRows({
    expenses: [
      { id: 'e1', date: '2024-11-10', description: 'Paint', amount: 1000 },
      { id: 'e2', date: '2025-09-10', description: 'Valid', amount: 2000 }
    ],
    worklogs: [
      { id: 'w1', date: '2025-02-12', contractorName: 'Builder', hours: 4, numberOfPeople: 2 },
      { id: 'w2', date: '2025-08-03', contractorName: 'Valid', hours: 1 }
    ]
  }, '2025-08-01');

  assert.deepEqual(rows, [
    {
      type: 'expense',
      id: 'e1',
      date: '2024-11-10',
      summary: 'Paint',
      valueLabel: '1000 kr',
      suggestedDate: '2025-11-10'
    },
    {
      type: 'worklog',
      id: 'w1',
      date: '2025-02-12',
      summary: 'Builder',
      valueLabel: '8 t',
      suggestedDate: '2026-02-12'
    }
  ]);
});
