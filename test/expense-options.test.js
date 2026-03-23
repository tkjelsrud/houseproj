import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getKnownCategories,
  resolveCategorySelection,
  getMemberSuggestions,
  getSupplierSuggestions,
  normalizeExpenseCategory
} from '../js/lib/expense-options.js';

test('getKnownCategories preserves configured order and appends sorted extras', () => {
  const categories = getKnownCategories(
    ['Alpha', 'Beta'],
    [
      { category: 'Beta' },
      { category: 'Zulu' },
      { category: 'Delta' }
    ]
  );

  assert.deepEqual(categories, ['Alpha', 'Beta', 'Delta', 'Zulu']);
});

test('resolveCategorySelection preserves explicit selection or falls back to most recent expense category', () => {
  assert.equal(resolveCategorySelection('Chosen', [{ category: 'Latest' }]), 'Chosen');
  assert.equal(resolveCategorySelection('', [{ category: 'Latest' }]), 'Latest');
  assert.equal(resolveCategorySelection('__new__', [{ category: 'Latest' }]), 'Latest');
});

test('getMemberSuggestions puts current display name first and removes duplicates', () => {
  const members = getMemberSuggestions('Alex', ['Robin', 'Alex', 'Robin', 'Chris']);
  assert.deepEqual(members, ['Alex', 'Robin', 'Chris']);
});

test('getSupplierSuggestions merges config suggestions with historical suppliers', () => {
  const suppliers = getSupplierSuggestions(
    ['Supplier One'],
    [
      { supplierName: 'Supplier Two' },
      { supplierName: 'Supplier One' },
      { supplierName: '-' }
    ]
  );

  assert.deepEqual(suppliers, ['Supplier One', 'Supplier Two']);
});

test('normalizeExpenseCategory maps blank values to Udefinert', () => {
  assert.equal(normalizeExpenseCategory(''), 'Udefinert');
  assert.equal(normalizeExpenseCategory('  '), 'Udefinert');
  assert.equal(normalizeExpenseCategory('Alpha'), 'Alpha');
});
