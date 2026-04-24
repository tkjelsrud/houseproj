import { requireAuth } from './auth.js';
import { getExpenses, getWorklogs, getBudgets, setBudget } from './db.js';
import { applyHouseName } from './ui.js';
import {
  splitExpenses,
  calculateSummary,
  buildRecentActivity,
  buildCategoryChartData,
  buildBudgetAnnotations,
  buildCategoryRows,
  calculatePersonBalance,
  aggregateContractors
} from './lib/dashboard-logic.js';
import { getKnownCategories } from './lib/expense-options.js';
import { buildBackupPayload, buildBackupFilename } from './lib/backup.js';

const nok = (n) =>
  new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n);

const CATEGORY_CHART_Y_MAX = 500000;

let categoryChart = null;
let appConfig = {
  houseName: 'Husprosjekt',
  memberNames: [],
  defaultExpenseCategories: [],
  supplierSuggestions: []
};
let latestBackupData = null;

requireAuth(async (user) => {
  document.getElementById('user-email').textContent = user.email;
  appConfig = await applyHouseName('Oversikt');
  await loadDashboard();

  document.getElementById('refresh-btn').addEventListener('click', loadDashboard);
  document.getElementById('backup-download-btn').addEventListener('click', downloadBackup);

  document.getElementById('budget-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = document.getElementById('budget-category').value.trim();
    const amount = document.getElementById('budget-amount').value;
    if (!category || !amount) return;
    await setBudget(category, amount);
    document.getElementById('budget-category').value = '';
    document.getElementById('budget-amount').value = '';
    await loadDashboard();
  });
});

async function loadDashboard() {
  document.getElementById('loading').classList.remove('d-none');
  document.getElementById('content').classList.add('d-none');
  document.getElementById('load-error').classList.add('d-none');

  try {
    const [expenses, worklogs, budgets] = await Promise.all([
      getExpenses(),
      getWorklogs(),
      getBudgets()
    ]);

    const { transfers, realExpenses, allocExpenses } = splitExpenses(expenses);
    latestBackupData = { appConfig, expenses, worklogs, budgets };

    populateBudgetCategoryList(expenses, budgets);
    renderSummary(realExpenses, worklogs, allocExpenses);
    renderRecentActivity(realExpenses, worklogs);
    renderCategoryChart(realExpenses, allocExpenses, budgets);
    renderCategoryTable(realExpenses, budgets);
    renderContractorTable(worklogs);
    renderPersonBalance(realExpenses, transfers);

    document.getElementById('loading').classList.add('d-none');
    document.getElementById('content').classList.remove('d-none');
  } catch (err) {
    document.getElementById('loading').classList.add('d-none');
    document.getElementById('load-error').textContent = `Feil: ${err.message}`;
    document.getElementById('load-error').classList.remove('d-none');
    console.error(err);
  }
}

function setBackupStatus(message, isError = false) {
  const el = document.getElementById('backup-status');
  el.textContent = message;
  el.className = isError ? 'text-danger small' : 'text-muted small';
}

function downloadBackup() {
  if (!latestBackupData) {
    setBackupStatus('Ingen data klare for eksport ennå.', true);
    return;
  }

  try {
    const payload = buildBackupPayload(latestBackupData);
    const filename = buildBackupFilename(appConfig.houseName, payload.exportedAt);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setBackupStatus(`Backup lastet ned: ${payload.counts.expenses} utgifter, ${payload.counts.worklogs} arbeidslogger.`);
  } catch (err) {
    setBackupStatus(`Kunne ikke lage backup: ${err.message}`, true);
    console.error(err);
  }
}

function populateBudgetCategoryList(expenses, budgets) {
  const categories = getKnownCategories(appConfig.defaultExpenseCategories, [
    ...expenses,
    ...budgets.map((budget) => ({ category: budget.categoryName }))
  ]);

  document.getElementById('budget-category-list').innerHTML =
    categories.map((category) => `<option>${category}</option>`).join('');
}

function renderSummary(realExpenses, worklogs, allocExpenses) {
  const summary = calculateSummary(realExpenses, worklogs, allocExpenses);

  document.getElementById('total-spent').textContent = nok(summary.totalSpent);
  document.getElementById('total-allocated').textContent = nok(summary.totalAllocated);
  document.getElementById('total-labor').textContent = nok(summary.totalLaborCost);
  document.getElementById('total-hours').textContent = summary.totalHours.toFixed(1) + ' t';
  document.getElementById('total-all').textContent = nok(summary.totalAll);
}

function renderRecentActivity(realExpenses, worklogs) {
  const recent = buildRecentActivity(realExpenses, worklogs);

  if (recent.length === 0) {
    document.getElementById('recent-list').innerHTML =
      '<p class="text-muted small mb-0">Ingen registreringer ennå.</p>';
    return;
  }

  document.getElementById('recent-list').innerHTML = recent.map((item) => `
    <div class="d-flex align-items-start gap-3 py-2 border-bottom">
      <span class="badge-type">${item.type}</span>
      <div class="flex-grow-1">
        <div class="fw-semibold small">${item.label}</div>
        ${item.detail ? `<div class="text-muted" style="font-size:0.8rem">${item.detail}</div>` : ''}
      </div>
      <div class="text-end">
        <div class="fw-semibold small">${item.type === 'Utgift' ? nok(item.value) : `${item.value.toFixed(1)} t`}</div>
        <div class="text-muted" style="font-size:0.75rem">${item.date}</div>
      </div>
    </div>
  `).join('');
}

function renderCategoryChart(realExpenses, allocExpenses, budgets) {
  const { labels, realByCategory, allocByCategory, budgetMap } =
    buildCategoryChartData(realExpenses, allocExpenses, budgets);

  if (categoryChart) categoryChart.destroy();

  if (labels.length === 0) {
    document.getElementById('category-chart').style.display = 'none';
    return;
  }
  document.getElementById('category-chart').style.display = '';

  const annotations = buildBudgetAnnotations(labels, budgetMap);

  categoryChart = new Chart(document.getElementById('category-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Brukt',
          data: labels.map((label) => realByCategory[label] || 0),
          backgroundColor: '#1a1a1a',
          borderRadius: 2,
          borderSkipped: false
        },
        {
          label: 'Allokert',
          data: labels.map((label) => allocByCategory[label] || 0),
          backgroundColor: '#aaaaaa',
          borderRadius: 2,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { boxWidth: 12, font: { size: 11 }, color: '#555' }
        },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${nok(ctx.parsed.y)}` }
        },
        annotation: { annotations }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#555' }
        },
        y: {
          stacked: true,
          max: CATEGORY_CHART_Y_MAX,
          grid: { color: '#f0f0f0' },
          border: { display: false },
          ticks: { font: { size: 11 }, color: '#888', callback: (value) => nok(value) }
        }
      }
    }
  });
}

function renderCategoryTable(realExpenses, budgets) {
  const rows = buildCategoryRows(realExpenses, budgets);

  if (rows.length === 0) {
    document.getElementById('category-table-body').innerHTML =
      '<tr><td colspan="4" class="text-muted text-center">Ingen data ennå</td></tr>';
    return;
  }

  document.getElementById('category-table-body').innerHTML = rows.map((row) => {
    const cls = row.allocated > 0 ? (row.remaining >= 0 ? 'remaining-positive' : 'remaining-negative') : '';

    return `<tr>
      <td>${row.categoryName}</td>
      <td>${row.allocated > 0 ? nok(row.allocated) : '<span class="text-muted">—</span>'}</td>
      <td>${nok(row.spent)}</td>
      <td class="${cls}">${row.allocated > 0 ? nok(row.remaining) : '<span class="text-muted">—</span>'}</td>
    </tr>`;
  }).join('');
}

function renderPersonBalance(realExpenses, transfers) {
  const balance = calculatePersonBalance(realExpenses, transfers, appConfig.memberNames);
  const el = document.getElementById('person-balance');
  if (!el) return;

  if (balance.rows.length === 0 && balance.sunkRows.length === 0) {
    el.innerHTML = '<p class="text-muted small mb-0">Ingen data ennå</p>';
    return;
  }

  const tableHtml = balance.rows.map((row) => `
    <tr>
      <td>${row.name}</td>
      <td>${nok(row.amount)}</td>
      <td class="text-muted">${row.share}%</td>
    </tr>
  `).join('');

  let balanceHtml = '';
  if (balance.isBalanced) {
    const transferNote = balance.totalTransfers > 0
      ? ` <span class="text-muted small">(inkl. ${nok(balance.totalTransfers)} overføring)</span>`
      : '';
    balanceHtml = `<p class="small text-muted mb-0 mt-2">Balansert — ingen skylder noe${transferNote}</p>`;
  } else if (balance.settlement) {
    const transferNote = balance.totalTransfers > 0
      ? ` <span class="text-muted small">(inkl. ${nok(balance.totalTransfers)} overføring)</span>`
      : '';

    balanceHtml = `<p class="small mb-0 mt-2">
      <span class="text-muted">Utjevning:</span>
      <strong>${balance.settlement.debtor}</strong> skylder <strong>${balance.settlement.creditor}</strong>
      <strong>${nok(balance.settlement.amount)}</strong>${transferNote}
    </p>`;
  }

  let sunkHtml = '';
  if (balance.sunkRows.length > 0) {
    const details = balance.sunkRows
      .map((row) => `${row.name}: ${nok(row.amount)}`)
      .join(' · ');
    sunkHtml = `<p class="small text-muted mb-0 mt-2">Egen kost holdt utenfor fordeling: ${details}</p>`;
  }

  const tableSection = balance.rows.length > 0 ? `
    <div class="table-responsive">
      <table class="table table-sm mb-0">
        <thead class="table-light">
          <tr>
            <th>Person</th>
            <th>Betalt</th>
            <th>Andel</th>
          </tr>
        </thead>
        <tbody>${tableHtml}</tbody>
      </table>
    </div>
  ` : '';

  el.innerHTML = `
    ${tableSection}
    ${balanceHtml}
    ${sunkHtml}
  `;
}

function renderContractorTable(worklogs) {
  const contractors = aggregateContractors(worklogs);
  if (contractors.length === 0) {
    document.getElementById('contractor-table-body').innerHTML =
      '<tr><td colspan="3" class="text-muted text-center">Ingen data ennå</td></tr>';
    return;
  }

  document.getElementById('contractor-table-body').innerHTML = contractors.map((contractor) => `
    <tr>
      <td>${contractor.name}</td>
      <td>${contractor.hours.toFixed(1)} t</td>
      <td>${nok(contractor.cost)}</td>
    </tr>
  `).join('');
}
