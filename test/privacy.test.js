import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeAppConfig, PUBLIC_APP_NAME } from '../js/lib/app-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function fromCodes(...codes) {
  return String.fromCharCode(...codes);
}

const bannedStrings = [
  fromCodes(216, 72, 50, 48, 99),
  fromCodes(84, 104, 111, 109, 97, 115),
  fromCodes(65, 110, 105, 116, 97),
  fromCodes(75, 106, 248, 107, 107, 101, 110),
  fromCodes(71, 97, 110, 103),
  fromCodes(83, 116, 117, 101),
  fromCodes(83, 111, 118, 101, 114, 111, 109),
  fromCodes(75, 106, 101, 108, 108, 101, 114, 115, 116, 117, 101),
  fromCodes(76, 111, 102, 116),
  fromCodes(71, 97, 114, 97, 115, 106, 101),
  fromCodes(85, 116, 111, 109, 104, 117, 115),
  fromCodes(72, 121, 98, 101, 108),
  fromCodes(77, 97, 120, 98, 111),
  fromCodes(66, 97, 117, 104, 97, 117, 115),
  fromCodes(66, 121, 103, 103, 109, 97, 120),
  fromCodes(74, 117, 108, 97),
  fromCodes(69, 108, 101, 107, 116, 114, 111, 105, 109, 112)
];

const ignoredDirs = new Set(['.git', 'node_modules']);
const ignoredFiles = new Set([
  '.DS_Store',
  'js/firebase-config.js',
  'js/runtime-config.js'
]);

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, fullPath);
    if (ignoredFiles.has(relativePath)) continue;

    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

test('normalizeAppConfig enforces expected runtime config shape', () => {
  const result = normalizeAppConfig({
    houseName: 'Private Label',
    memberNames: ['A', 'A', 'B'],
    defaultExpenseCategories: ['One', 'Two', 'Two'],
    supplierSuggestions: ['S1', 'S1', 'S2']
  });

  assert.deepEqual(result, {
    houseName: 'Private Label',
    memberNames: ['A', 'B'],
    defaultExpenseCategories: ['One', 'Two'],
    supplierSuggestions: ['S1', 'S2']
  });
});

test('normalizeAppConfig falls back to generic public app name', () => {
  const result = normalizeAppConfig({});
  assert.equal(result.houseName, PUBLIC_APP_NAME);
});

test('public HTML keeps generic branding before runtime config loads', () => {
  for (const fileName of ['index.html', 'dashboard.html', 'expenses.html', 'worklogs.html']) {
    const html = fs.readFileSync(path.join(rootDir, fileName), 'utf8');
    assert.match(html, /Husprosjekt/);
  }
});

test('private utility files are not present in the working tree', () => {
  assert.equal(fs.existsSync(path.join(rootDir, 'import.html')), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'fix-dates.html')), false);
});

test('repo files do not contain banned private labels', () => {
  const failures = [];

  for (const file of collectFiles(rootDir)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const value of bannedStrings) {
      if (content.includes(value)) {
        failures.push(`${path.relative(rootDir, file)} contains banned value ${JSON.stringify(value)}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});
