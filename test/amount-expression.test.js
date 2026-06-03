import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAmountExpression } from '../js/lib/amount-expression.js';

test('plain integer', () => {
  assert.equal(parseAmountExpression('287'), 287);
});

test('two terms: 234+345 = 579', () => {
  assert.equal(parseAmountExpression('234+345'), 579);
});

test('three terms: 234+345+129 = 708', () => {
  assert.equal(parseAmountExpression('234+345+129'), 708);
});

test('whitespace around terms is tolerated', () => {
  assert.equal(parseAmountExpression(' 100 + 200 '), 300);
});

test('empty string returns null', () => {
  assert.equal(parseAmountExpression(''), null);
});

test('whitespace-only returns null', () => {
  assert.equal(parseAmountExpression('   '), null);
});

test('text returns null', () => {
  assert.equal(parseAmountExpression('abc'), null);
});

test('negative number returns null', () => {
  assert.equal(parseAmountExpression('-100'), null);
});

test('subtraction returns null', () => {
  assert.equal(parseAmountExpression('500-100'), null);
});

test('decimal returns null', () => {
  assert.equal(parseAmountExpression('287.50+450'), null);
});

test('trailing plus returns null', () => {
  assert.equal(parseAmountExpression('287+'), null);
});

test('double plus returns null', () => {
  assert.equal(parseAmountExpression('287++450'), null);
});

test('zero is valid', () => {
  assert.equal(parseAmountExpression('0'), 0);
});

test('large sum', () => {
  assert.equal(parseAmountExpression('10000+20000+30000'), 60000);
});
