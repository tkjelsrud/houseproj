import { requireAuth } from './auth.js';
import { getExpenses, getWorklogs, getBudgets, setBudget } from './db.js';
import { applyHouseName } from './ui.js';
import {
  splitExpenses,
  calculateSummary,
  buildRecentActivity,
  buildCategoryChartData,
  buildCategoryRows,
  calculatePersonBalance,
  aggregateContractors
} from './lib/dashboard-logic.js';
import { getKnownCategories } from './lib/expense-options.js';

const nok = (n) =>
  new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n);

let categoryChart = null;
let appConfig = {
  houseName: 'Husprosjekt',
  memberNames: [],
  defaultExpenseCategories: [],
  supplierSuggestions: []
};

requireAuth(async (user) => {
  document.getElementById('user-email').textContent = user.email;
  appConfig = await applyHouseName('Oversikt');
  await loadDashboard();

  document.getElementById('refresh-btn').addEventListener('click', loadDashboard);

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

  const annotations = {};
  labels.forEach((label, i) => {
    const budget = budgetMap[label];
    if (budget > 0) {
      annotations[`budget_${i}`] = {
        type: 'line',
        scaleID: 'y',
        value: budget,
        borderColor: 'rgba(180,0,0,0.5)',
        borderWidth: 1.5,
        borderDash: [4, 3],
        xMin: i - 0.4,
        xMax: i + 0.4,
        label: {
          display: false
        }
      };
    }
  });

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
  const balance = calculatePersonBalance(realExpenses, transfers);
  const el = document.getElementById('person-balance');
  if (!el) return;

  if (balance.rows.length === 0) {
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

  el.innerHTML = `
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
    ${balanceHtml}
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
