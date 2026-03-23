export function getKnownCategories(defaultCategories = [], expenses = []) {
  const seen = new Set();
  const orderedDefaults = [];

  for (const category of defaultCategories) {
    if (typeof category !== 'string') continue;
    const trimmed = category.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    orderedDefaults.push(trimmed);
  }

  const extras = [];
  for (const expense of expenses) {
    const category = typeof expense?.category === 'string' ? expense.category.trim() : '';
    if (!category || seen.has(category)) continue;
    seen.add(category);
    extras.push(category);
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
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    values.push(trimmed);
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
