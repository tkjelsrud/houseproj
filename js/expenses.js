import { requireAuth } from './auth.js';
import { addExpense, getExpenses, archiveExpense, updateExpense } from './db.js';
import { applyHouseName } from './ui.js';
import {
  getKnownCategories,
  resolveCategorySelection,
  getMemberSuggestions,
  getSupplierSuggestions,
  normalizeExpenseCategory
} from './lib/expense-options.js';
import { isSunkCostExpense } from './lib/expense-flags.js';

const nok = (n) =>
  new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n);

let currentUser = null;
let allExpenses = [];
let currentDisplayName = '';
let appConfig = {
  houseName: 'Husprosjekt',
  memberNames: [],
  defaultExpenseCategories: [],
  supplierSuggestions: []
};

requireAuth(async (user) => {
  currentUser = user;
  document.getElementById('user-email').textContent = user.email;
  appConfig = await applyHouseName('Utgifter');

  document.getElementById('exp-date').valueAsDate = new Date();

  // Populate defaults immediately — before Firestore loads
  populateCategorySelect();
  populateCategoryFilter();
  populateSupplierList();

  // Default "Kjøpt av" to logged-in user's display name
  currentDisplayName = user.displayName || user.email;
  document.getElementById('exp-purchased-by').value = currentDisplayName;
  populateMemberList();

  // Vis mer toggle
  document.getElementById('vis-mer-btn').addEventListener('click', () => {
    const fields = document.getElementById('vis-mer-fields');
    const btn = document.getElementById('vis-mer-btn');
    const hidden = fields.classList.toggle('d-none');
    btn.textContent = hidden ? '▸ Vis mer' : '▾ Vis mindre';
  });

  // Show/hide custom category input
  document.getElementById('exp-category').addEventListener('change', (e) => {
    const newInput = document.getElementById('exp-category-new');
    if (e.target.value === '__new__') {
      newInput.classList.remove('d-none');
      newInput.required = true;
      newInput.focus();
    } else {
      newInput.classList.add('d-none');
      newInput.required = false;
      newInput.value = '';
    }
  });

  await loadExpenses();

  document.getElementById('expense-form').addEventListener('submit', handleSubmit);
  document.getElementById('filter-category').addEventListener('change', renderTable);

  // Archive: two-tap confirmation on the table
  document.getElementById('expense-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-archive');
    const sunkBtn = e.target.closest('.btn-sunk');
    if (sunkBtn) {
      sunkBtn.disabled = true;
      await updateExpense(sunkBtn.dataset.id, { sunkCost: sunkBtn.dataset.sunk !== '1' });
      await loadExpenses();
      return;
    }

    if (!btn) return;

    if (!btn.dataset.confirm) {
      // First tap — ask for confirmation
      btn.dataset.confirm = '1';
      btn.textContent = 'Bekreft?';
      btn.classList.add('btn-archive-confirm');
      setTimeout(() => {
        btn.dataset.confirm = '';
        btn.textContent = '×';
        btn.classList.remove('btn-archive-confirm');
      }, 3000);
    } else {
      // Second tap — archive
      btn.disabled = true;
      await archiveExpense(btn.dataset.id);
      await loadExpenses();
    }
  });
});

async function loadExpenses() {
  try {
    allExpenses = await getExpenses();
    populateCategorySelect();
    populateCategoryFilter();
    populateSupplierList();
    renderTable();
  } catch (err) {
    document.getElementById('expense-tbody').innerHTML =
      `<tr><td colspan="7" class="text-danger text-center">Feil: ${err.message}</td></tr>`;
    console.error(err);
  }
}

function allKnownCategories() {
  return getKnownCategories(appConfig.defaultExpenseCategories, allExpenses);
}

function populateCategorySelect() {
  const select = document.getElementById('exp-category');
  const current = select ? select.value : '';
  if (!select) return;

  select.innerHTML = '<option value="">Velg kategori</option>' +
    allKnownCategories().map(c => `<option value="${c}">${c}</option>`).join('') +
    '<option value="__new__">＋ Ny kategori…</option>';

  // Preserve explicit user selection, otherwise default to last added expense's category
  select.value = resolveCategorySelection(current, allExpenses);
}

function populateCategoryFilter() {
  const select = document.getElementById('filter-category');
  const current = select.value;
  select.innerHTML = '<option value="">Alle kategorier</option>' +
    allKnownCategories().map(c => `<option value="${c}">${c}</option>`).join('');
  if (current) select.value = current;
}

function populateMemberList() {
  const options = getMemberSuggestions(currentDisplayName, appConfig.memberNames);
  document.getElementById('members-list').innerHTML =
    options.map((name) => `<option>${name}</option>`).join('');

  const purchasedBy = document.getElementById('exp-purchased-by');
  if (!purchasedBy.value.trim()) {
    purchasedBy.value = options[0] || currentDisplayName;
  }
}

function populateSupplierList() {
  const suppliers = getSupplierSuggestions(appConfig.supplierSuggestions, allExpenses);
  document.getElementById('supplier-list').innerHTML =
    suppliers.map((name) => `<option>${name}</option>`).join('');
}

function renderTable() {
  const filterCat = document.getElementById('filter-category').value;
  const visible = allExpenses.filter(e => !e.transfer);
  const normalizedRows = filterCat
    ? visible.filter((e) => normalizeExpenseCategory(e.category) === filterCat)
    : visible;

  if (normalizedRows.length === 0) {
    document.getElementById('expense-tbody').innerHTML =
      '<tr><td colspan="7" class="text-muted text-center">Ingen utgifter ennå</td></tr>';
    document.getElementById('expense-total').textContent = '';
    return;
  }

  const realTotal = normalizedRows.filter(e => !e.allocated).reduce((s, e) => s + e.amount, 0);
  const allocTotal = normalizedRows.filter(e => e.allocated).reduce((s, e) => s + e.amount, 0);

  let html = '';
  for (const e of normalizedRows) {
    const allocBadge = e.allocated ? '<span class="alloc-badge">Allokert</span> ' : '';
    const sunkBadge = isSunkCostExpense(e) ? '<span class="alloc-badge">Egen kost</span> ' : '';
    const rowClass   = e.allocated ? ' class="row-allocated"' : '';
    html += `<tr${rowClass}>
      <td>${e.date}</td>
      <td>${allocBadge}${sunkBadge}${nok(e.amount)}</td>
      <td>${normalizeExpenseCategory(e.category)}</td>
      <td>${e.supplierName || '—'}</td>
      <td>${e.description || '—'}</td>
      <td>${e.purchasedBy || '—'}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-secondary btn-sunk" data-id="${e.id}" data-sunk="${isSunkCostExpense(e) ? '1' : '0'}" title="Marker som egen kost">
          ${isSunkCostExpense(e) ? 'Deles' : 'Egen'}
        </button>
        <button class="btn-archive" data-id="${e.id}" title="Arkiver">×</button>
      </td>
    </tr>`;
  }
  document.getElementById('expense-tbody').innerHTML = html;

  let totalText = `Totalt brukt: ${nok(realTotal)}`;
  if (allocTotal > 0) totalText += `  ·  Allokert: ${nok(allocTotal)}`;
  document.getElementById('expense-total').textContent = totalText;
}

async function handleSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('exp-submit');
  btn.disabled = true;

  let category = document.getElementById('exp-category').value;
  if (category === '__new__') {
    category = document.getElementById('exp-category-new').value.trim();
  }

  const data = {
    date: document.getElementById('exp-date').value,
    amount: document.getElementById('exp-amount').value,
    category,
    supplierName: document.getElementById('exp-supplier').value,
    description: document.getElementById('exp-desc').value,
    purchasedBy: document.getElementById('exp-purchased-by').value.trim() || currentDisplayName,
    allocated: document.getElementById('exp-allocated').checked,
    transfer: document.getElementById('exp-transfer').checked,
    sunkCost: document.getElementById('exp-sunk-cost').checked
  };

  try {
    await addExpense(data, currentUser.uid);
    const savedCategory = category; // remember before reset
    e.target.reset();
    document.getElementById('exp-date').valueAsDate = new Date();
    document.getElementById('exp-category-new').classList.add('d-none');
    await loadExpenses();
    // Re-apply saved category as default for next entry
    document.getElementById('exp-category').value = savedCategory;
  } catch (err) {
    alert('Kunne ikke lagre utgift: ' + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}
