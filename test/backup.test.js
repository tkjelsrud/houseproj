import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBackupPayload, buildBackupFilename } from '../js/lib/backup.js';

test('buildBackupPayload exports config and collection counts', () => {
  const payload = buildBackupPayload({
    appConfig: { houseName: 'Example House', memberNames: ['Owner A'] },
    expenses: [{ id: 'e1', amount: 100 }],
    worklogs: [{ id: 'w1', hours: 2 }],
    budgets: [{ id: 'b1', allocatedAmount: 500 }]
  });

  assert.equal(payload.version, 1);
  assert.equal(payload.counts.expenses, 1);
  assert.equal(payload.counts.worklogs, 1);
  assert.equal(payload.counts.budgets, 1);
  assert.equal(payload.config.houseName, 'Example House');
});

test('buildBackupPayload serializes timestamp-like values to ISO strings', () => {
  const payload = buildBackupPayload({
    appConfig: { houseName: 'Example House' },
    expenses: [{
      id: 'e1',
      createdAt: {
        toDate: () => new Date('2026-03-23T10:11:12.000Z')
      }
    }],
    worklogs: [],
    budgets: []
  });

  assert.equal(payload.expenses[0].createdAt, '2026-03-23T10:11:12.000Z');
});

test('buildBackupFilename creates a stable json filename', () => {
  const filename = buildBackupFilename('Example House', '2026-03-23T10:11:12.000Z');
  assert.equal(filename, 'example-house-backup-2026-03-23T10-11-12-000Z.json');
});
