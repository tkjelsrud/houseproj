import { requireAuth, getRuntimeConfig } from './auth.js';
import { getExpenses, getWorklogs, getBudgets, updateExpense, updateWorklog } from './db.js';
import { applyHouseName } from './ui.js';
import {
  splitExpenses,
  calculateSummary,
  buildCategoryRows,
  aggregateContractors
} from './lib/dashboard-logic.js';
import {
  calculateIndependentSnapshot,
  buildSuggestedExpectations,
  normalizeExpectations,
  runControlChecks
} from './lib/control-checks.js';
import { findSuspiciousDatedRows } from './lib/date-audit.js';

const STORAGE_KEY = 'houseproj.control.expectations.v1';
const AUDIT_STORAGE_KEY = 'houseproj.control.date-audit.v1';

const nok = (n) =>
  new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n);

let appConfig = {
  houseName: 'Husprosjekt',
  memberNames: [],
  defaultExpenseCategories: [],
  supplierSuggestions: []
};

let latestData = null;

requireAuth(async (user) => {
  document.getElementById('user-email').textContent = user.email;
  appConfig = await applyHouseName('Control');

  document.getElementById('refresh-btn').addEventListener('click', loadControlPage);
  document.getElementById('control-form').addEventListener('submit', handleRunChecks);
  document.getElementById('use-live-baseline-btn').addEventListener('click', useLiveBaseline);
  document.getElementById('clear-baseline-btn').addEventListener('click', clearBaseline);
  document.getElementById('suspicious-dates-body').addEventListener('click', handleSuspiciousDateAction);

  await loadControlPage();
});

async function loadControlPage() {
  setLoadingState(true);

  try {
    const [runtimeConfig, expenses, worklogs, budgets] = await Promise.all([
      getRuntimeConfig(),
      getExpenses(),
      getWorklogs(),
      getBudgets()
    ]);

    latestData = { runtimeConfig, expenses, worklogs, budgets };

    const savedExpectations = loadStoredExpectations();
    const suggestedExpectations = buildSuggestedExpectations(
      calculateIndependentSnapshot({ appConfig, runtimeConfig, expenses, worklogs })
    );

    populateExpectationForm(savedExpectations || suggestedExpectations);
    populateAuditForm(loadStoredAuditSettings());
    renderControlPage();
    setLoadingState(false);
  } catch (err) {
    setLoadingState(false, `Feil: ${err.message}`);
    console.error(err);
  }
}

function setLoadingState(isLoading, errorMessage = '') {
  document.getElementById('loading').classList.toggle('d-none', !isLoading);
  document.getElementById('content').classList.toggle('d-none', isLoading || Boolean(errorMessage));

  const errorEl = document.getElementById('load-error');
  errorEl.textContent = errorMessage;
  errorEl.classList.toggle('d-none', !errorMessage);
}

function loadStoredExpectations() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeExpectations(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveStoredExpectations(expectations) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeExpectations(expectations)));
}

function loadStoredAuditSettings() {
  try {
    const raw = window.localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return { cutoffDate: '' };
    const parsed = JSON.parse(raw);
    return { cutoffDate: typeof parsed.cutoffDate === 'string' ? parsed.cutoffDate : '' };
  } catch {
    return { cutoffDate: '' };
  }
}

function saveStoredAuditSettings(settings) {
  window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify({
    cutoffDate: typeof settings.cutoffDate === 'string' ? settings.cutoffDate : ''
  }));
}

function populateExpectationForm(expectations) {
  const normalized = normalizeExpectations(expectations);
  document.getElementById('expected-allowed-users').value = toInputValue(normalized.expectedAllowedUidCount);
  document.getElementById('expected-members').value = toInputValue(normalized.expectedMemberCount);
  document.getElementById('min-expenses').value = toInputValue(normalized.minExpenseCount);
  document.getElementById('min-worklogs').value = toInputValue(normalized.minWorklogCount);
  document.getElementById('min-transactions').value = toInputValue(normalized.minTransactionCount);
  document.getElementById('min-year-transactions').value = toInputValue(normalized.minCurrentYearTransactionCount);
}

function populateAuditForm(settings) {
  document.getElementById('date-audit-cutoff').value = settings.cutoffDate || '';
}

function toInputValue(value) {
  return value === null ? '' : String(value);
}

function readExpectationsFromForm() {
  return normalizeExpectations({
    savedAt: new Date().toISOString(),
    expectedAllowedUidCount: document.getElementById('expected-allowed-users').value,
    expectedMemberCount: document.getElementById('expected-members').value,
    minExpenseCount: document.getElementById('min-expenses').value,
    minWorklogCount: document.getElementById('min-worklogs').value,
    minTransactionCount: document.getElementById('min-transactions').value,
    minCurrentYearTransactionCount: document.getElementById('min-year-transactions').value
  });
}

function readAuditSettingsFromForm() {
  return {
    cutoffDate: document.getElementById('date-audit-cutoff').value
  };
}

function renderControlPage() {
  if (!latestData) return;

  const expectations = readExpectationsFromForm();
  const auditSettings = readAuditSettingsFromForm();
  const snapshot = calculateIndependentSnapshot({
    appConfig,
    runtimeConfig: latestData.runtimeConfig,
    expenses: latestData.expenses,
    worklogs: latestData.worklogs
  });

  const { realExpenses, allocExpenses } = splitExpenses(latestData.expenses);
  const appSummary = calculateSummary(realExpenses, latestData.worklogs, allocExpenses);
  const appCategoryRows = buildCategoryRows(realExpenses, latestData.budgets);
  const appContractors = aggregateContractors(latestData.worklogs);
  const results = runControlChecks({
    snapshot,
    expectations,
    appSummary,
    appCategoryRows,
    appContractors
  });

  renderOverview(snapshot, results);
  renderSnapshot(snapshot);
  renderChecks(results.checks);
  renderBaselineStatus(expectations);
  renderDateAudit(auditSettings);
}

function renderOverview(snapshot, results) {
  document.getElementById('check-summary').textContent = `${results.passedCount}/${results.totalCount} bestått`;
  document.getElementById('check-summary').className = results.failedCount > 0 ? 'fw-semibold text-danger' : 'fw-semibold text-success';
  document.getElementById('current-transactions').textContent = String(snapshot.transactionCount);
  document.getElementById('current-total').textContent = nok(snapshot.grandTotal);
  document.getElementById('current-year-transactions').textContent = String(snapshot.currentYearTransactionCount);
  document.getElementById('suspicious-count').textContent = String(findSuspiciousDatedRows(latestData, readAuditSettingsFromForm().cutoffDate).length);
}

function renderSnapshot(snapshot) {
  document.getElementById('snapshot-table-body').innerHTML = [
    ['Tillatte UID-er', snapshot.allowedUidCount],
    ['Prosjektmedlemmer', snapshot.memberCount],
    ['Utgifter', snapshot.expenseCount],
    ['Arbeidslogger', snapshot.worklogCount],
    ['Transaksjoner totalt', snapshot.transactionCount],
    ['Transaksjoner i år', snapshot.currentYearTransactionCount],
    ['Reelle utgifter', nok(snapshot.realExpenseTotal)],
    ['Allokerte utgifter', nok(snapshot.allocatedExpenseTotal)],
    ['Overføringer', nok(snapshot.transferExpenseTotal)],
    ['Egen kost', nok(snapshot.sunkCostTotal)],
    ['Arbeidstimer', `${snapshot.laborHoursTotal.toFixed(1)} t`],
    ['Arbeidskostnad', nok(snapshot.laborCostTotal)],
    ['Totalt inkl. arbeid', nok(snapshot.grandTotal)],
    ['Unike kjøpere', snapshot.uniquePurchaserCount],
    ['Unike håndverkere', snapshot.uniqueContractorCount]
  ].map(([label, value]) => `
    <tr>
      <th scope="row">${escapeHtml(label)}</th>
      <td>${escapeHtml(String(value))}</td>
    </tr>
  `).join('');
}

function renderChecks(checks) {
  document.getElementById('checks-table-body').innerHTML = checks.map((check) => `
    <tr>
      <td><span class="badge ${check.passed ? 'text-bg-success' : 'text-bg-danger'}">${check.passed ? 'OK' : 'Feil'}</span></td>
      <td>${escapeHtml(check.name)}</td>
      <td class="small text-muted">${escapeHtml(check.details)}</td>
    </tr>
  `).join('');
}

function renderBaselineStatus(expectations) {
  const stored = loadStoredExpectations();
  const source = stored ? 'Lagret baseline i nettleseren' : 'Midlertidige verdier fra skjema';
  const savedAt = expectations.savedAt ? new Date(expectations.savedAt) : null;
  const timestamp = savedAt && !Number.isNaN(savedAt.valueOf())
    ? ` · sist oppdatert ${savedAt.toLocaleString('nb-NO')}`
    : '';

  document.getElementById('baseline-status').textContent = `${source}${timestamp}`;
}

function handleRunChecks(event) {
  event.preventDefault();
  saveStoredAuditSettings(readAuditSettingsFromForm());
  renderControlPage();
}

function useLiveBaseline() {
  if (!latestData) return;

  const baseline = buildSuggestedExpectations(calculateIndependentSnapshot({
    appConfig,
    runtimeConfig: latestData.runtimeConfig,
    expenses: latestData.expenses,
    worklogs: latestData.worklogs
  }));

  saveStoredExpectations(baseline);
  populateExpectationForm(baseline);
  renderControlPage();
}

function clearBaseline() {
  window.localStorage.removeItem(STORAGE_KEY);
  if (!latestData) return;

  const suggested = buildSuggestedExpectations(calculateIndependentSnapshot({
    appConfig,
    runtimeConfig: latestData.runtimeConfig,
    expenses: latestData.expenses,
    worklogs: latestData.worklogs
  }));

  populateExpectationForm(suggested);
  renderControlPage();
}

function renderDateAudit(auditSettings) {
  const infoEl = document.getElementById('date-audit-info');
  const bodyEl = document.getElementById('suspicious-dates-body');
  const rows = findSuspiciousDatedRows(latestData, auditSettings.cutoffDate);

  if (!auditSettings.cutoffDate) {
    infoEl.textContent = 'Sett tidligste gyldige prosjektdato for å finne mistenkelige importdatoer.';
    bodyEl.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Ingen audit kjørt ennå</td></tr>';
    return;
  }

  infoEl.textContent = rows.length > 0
    ? `${rows.length} registreringer før ${auditSettings.cutoffDate}`
    : `Ingen registreringer før ${auditSettings.cutoffDate}`;

  if (rows.length === 0) {
    bodyEl.innerHTML = '<tr><td colspan="6" class="text-success text-center">Ingen mistenkelige datoer funnet</td></tr>';
    return;
  }

  bodyEl.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.type === 'expense' ? 'Utgift' : 'Arbeidslogg'}</td>
      <td>${escapeHtml(row.date)}</td>
      <td>${row.suggestedDate ? escapeHtml(row.suggestedDate) : '<span class="text-muted">—</span>'}</td>
      <td>${escapeHtml(row.summary)}</td>
      <td>${escapeHtml(row.valueLabel)}</td>
      <td>
        ${row.suggestedDate ? `
          <button
            class="btn btn-sm btn-outline-primary btn-apply-date-fix"
            data-type="${row.type}"
            data-id="${row.id}"
            data-date="${row.suggestedDate}"
          >Bruk forslag</button>
        ` : '<span class="text-muted small">Ingen forslag</span>'}
      </td>
    </tr>
  `).join('');
}

async function handleSuspiciousDateAction(event) {
  const button = event.target.closest('.btn-apply-date-fix');
  if (!button) return;

  button.disabled = true;

  try {
    if (button.dataset.type === 'expense') {
      await updateExpense(button.dataset.id, { date: button.dataset.date });
    } else {
      await updateWorklog(button.dataset.id, { date: button.dataset.date });
    }

    await loadControlPage();
  } catch (err) {
    button.disabled = false;
    alert(`Kunne ikke oppdatere dato: ${err.message}`);
    console.error(err);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
