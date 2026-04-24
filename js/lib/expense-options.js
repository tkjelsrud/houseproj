export const UNDEFINED_CATEGORY = 'Udefinert';

export function normalizeExpenseCategory(category) {
  if (typeof category !== 'string') return UNDEFINED_CATEGORY;
  const trimmed = category.trim();
  return trimmed || UNDEFINED_CATEGORY;
}

function normalizeComparisonValue(value) {
  return value.trim().toLocaleLowerCase('nb');
}

export function normalizeMemberName(name, memberNames = []) {
  if (typeof name !== 'string') return '';

  const trimmed = name.trim();
  if (!trimmed) return '';

  const normalizedInput = normalizeComparisonValue(trimmed);
  let prefixMatch = '';

  for (const memberName of memberNames) {
    if (typeof memberName !== 'string') continue;

    const canonicalName = memberName.trim();
    if (!canonicalName) continue;

    const normalizedCanonical = normalizeComparisonValue(canonicalName);
    if (normalizedInput === normalizedCanonical) return canonicalName;
    if (!normalizedInput.startsWith(normalizedCanonical + ' ')) continue;
    if (canonicalName.length <= prefixMatch.length) continue;
    prefixMatch = canonicalName;
  }

  return prefixMatch || trimmed;
}

export function getKnownCategories(defaultCategories = [], expenses = []) {
  const seen = new Set();
  const orderedDefaults = [];

  for (const category of defaultCategories) {
    const normalized = normalizeExpenseCategory(category);
    if (normalized === UNDEFINED_CATEGORY || seen.has(normalized)) continue;
    seen.add(normalized);
    orderedDefaults.push(normalized);
  }

  const extras = [];
  for (const expense of expenses) {
    const normalized = normalizeExpenseCategory(expense?.category);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    extras.push(normalized);
  }

  extras.sort((a, b) => a.localeCompare(b, 'nb'));
  return [...orderedDefaults, ...extras];
}

export function resolveCategorySelection(currentValue, expenses = []) {
  if (currentValue && currentValue !== '__new__') return currentValue;
  return expenses.length > 0 ? expenses[0].category : '';
}

export function getMemberSuggestions(currentDisplayName, memberNames = []) {
  const values = [];
  const seen = new Set();

  for (const name of [currentDisplayName, ...memberNames]) {
    const normalized = normalizeMemberName(name, memberNames);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }

  return values;
}

export function getSupplierSuggestions(configSuggestions = [], expenses = []) {
  const seen = new Set();
  const values = [];

  for (const name of configSuggestions) {
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    values.push(trimmed);
  }

  for (const expense of expenses) {
    const supplier = typeof expense?.supplierName === 'string' ? expense.supplierName.trim() : '';
    if (!supplier || supplier === '-' || seen.has(supplier)) continue;
    seen.add(supplier);
    values.push(supplier);
  }

  return values;
}
