function pad(value) {
  return String(value).padStart(2, '0');
}

function buildIsoDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year
    || utcDate.getUTCMonth() !== month - 1
    || utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, isoDate: buildIsoDate(year, month, day) };
}

export function suggestDateAtOrAfterCutoff(originalDate, cutoffDate, maxYearsToScan = 20) {
  const parsedOriginal = parseIsoDate(originalDate);
  const parsedCutoff = parseIsoDate(cutoffDate);
  if (!parsedOriginal || !parsedCutoff) return '';

  for (let year = parsedCutoff.year; year <= parsedCutoff.year + maxYearsToScan; year += 1) {
    const candidate = parseIsoDate(buildIsoDate(year, parsedOriginal.month, parsedOriginal.day));
    if (!candidate) continue;
    if (candidate.isoDate >= parsedCutoff.isoDate) return candidate.isoDate;
  }

  return '';
}

function toValueLabel(type, item) {
  if (type === 'expense') return `${Number(item?.amount) || 0} kr`;

  const hours = Number(item?.hours) || 0;
  const people = Number(item?.numberOfPeople) || 1;
  return `${hours * people} t`;
}

function toRow(type, item, cutoffDate) {
  const suggestedDate = suggestDateAtOrAfterCutoff(item?.date, cutoffDate);
  const summary = type === 'expense'
    ? item?.description || item?.supplierName || item?.category || 'Utgift'
    : item?.taskDescription || item?.contractorName || 'Arbeidslogg';

  return {
    type,
    id: item.id,
    date: item?.date || '',
    summary,
    valueLabel: toValueLabel(type, item),
    suggestedDate
  };
}

export function findSuspiciousDatedRows({ expenses = [], worklogs = [] }, cutoffDate) {
  const parsedCutoff = parseIsoDate(cutoffDate);
  if (!parsedCutoff) return [];

  const rows = [
    ...expenses
      .filter((expense) => typeof expense?.date === 'string' && expense.date < parsedCutoff.isoDate)
      .map((expense) => toRow('expense', expense, parsedCutoff.isoDate)),
    ...worklogs
      .filter((worklog) => typeof worklog?.date === 'string' && worklog.date < parsedCutoff.isoDate)
      .map((worklog) => toRow('worklog', worklog, parsedCutoff.isoDate))
  ];

  return rows.sort((a, b) => a.date.localeCompare(b.date, 'nb'));
}
