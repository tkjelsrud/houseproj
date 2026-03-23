export const PUBLIC_APP_NAME = 'Husprosjekt';

function uniqueTrimmedStrings(values) {
  if (!Array.isArray(values)) return [];

  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

export function normalizeAppConfig(data = {}) {
  const houseName = typeof data.houseName === 'string' && data.houseName.trim()
    ? data.houseName.trim()
    : PUBLIC_APP_NAME;

  return {
    houseName,
    memberNames: uniqueTrimmedStrings(data.memberNames),
    defaultExpenseCategories: uniqueTrimmedStrings(data.defaultExpenseCategories),
    supplierSuggestions: uniqueTrimmedStrings(data.supplierSuggestions)
  };
}

export function buildPageTitle(name, pageSuffix) {
  if (!pageSuffix) return name;
  return `${name} — ${pageSuffix}`;
}
