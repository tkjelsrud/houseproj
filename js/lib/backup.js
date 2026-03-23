function serializeValue(value) {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, serializeValue(nestedValue)])
    );
  }

  return value;
}

function slugify(value) {
  return String(value || 'backup')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'backup';
}

export function buildBackupPayload({ appConfig, expenses, worklogs, budgets }) {
  const exportedAt = new Date().toISOString();

  return {
    version: 1,
    exportedAt,
    counts: {
      expenses: expenses.length,
      worklogs: worklogs.length,
      budgets: budgets.length
    },
    config: serializeValue(appConfig),
    expenses: serializeValue(expenses),
    worklogs: serializeValue(worklogs),
    budgets: serializeValue(budgets)
  };
}

export function buildBackupFilename(appName, exportedAt = new Date()) {
  const date = exportedAt instanceof Date ? exportedAt : new Date(exportedAt);
  const iso = date.toISOString().replace(/[:.]/g, '-');
  return `${slugify(appName)}-backup-${iso}.json`;
}
