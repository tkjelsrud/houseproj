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
import { isSunkCostExpense, normalizeExpenseFlags } from './lib/expense-flags.js';

const nok = (n) =>
  new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n);

let currentUser = null;
let allExpenses = [];
let currentDisplayName = '';
let editingExpenseId = null;
let editingCategoryValue = '';
let editingCategoryNewValue = '';
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

  wireExclusiveExpenseFlags();

  await loadExpenses();

  document.getElementById('expense-form').addEventListener('submit', handleSubmit);
  document.getElementById('filter-category').addEventListener('change', renderTable);

  // Archive: two-tap confirmation on the table
  document.getElementById('expense-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-archive');
    const sunkBtn = e.target.closest('.btn-sunk');
    const editBtn = e.target.closest('.btn-category-edit');
    const cancelBtn = e.target.closest('.btn-category-cancel');
    const saveBtn = e.target.closest('.btn-category-save');

    if (editBtn) {
      startCategoryEdit(editBtn.dataset.id);
      return;
    }

    if (cancelBtn) {
      stopCategoryEdit();
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      await saveCategoryEdit(saveBtn.dataset.id);
      return;
    }

    if (sunkBtn) {
      sunkBtn.disabled = true;
      const nextSunkState = sunkBtn.dataset.sunk !== '1';
      await updateExpense(
        sunkBtn.dataset.id,
        nextSunkState
          ? normalizeExpenseFlags({ sunkCost: true }, 'sunkCost')
          : { sunkCost: false }
      );
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

  document.getElementById('expense-tbody').addEventListener('change', (e) => {
    if (e.target.matches('.expense-category-edit-select')) {
      editingCategoryValue = e.target.value;
      if (editingCategoryValue !== '__new__') {
        editingCategoryNewValue = '';
      }
      renderTable();
    }
  });

  document.getElementById('expense-tbody').addEventListener('input', (e) => {
    if (e.target.matches('.expense-category-edit-new')) {
      editingCategoryNewValue = e.target.value;
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

function startCategoryEdit(expenseId) {
  const expense = allExpenses.find((item) => item.id === expenseId);
  if (!expense) return;

  editingExpenseId = expenseId;
  editingCategoryValue = normalizeExpenseCategory(expense.category);
  editingCategoryNewValue = '';
  renderTable();
}

function stopCategoryEdit() {
  editingExpenseId = null;
  editingCategoryValue = '';
  editingCategoryNewValue = '';
  renderTable();
}

function resolveEditedCategory() {
  if (editingCategoryValue === '__new__') {
    return editingCategoryNewValue.trim();
  }
  return normalizeExpenseCategory(editingCategoryValue);
}

async function saveCategoryEdit(expenseId) {
  const nextCategory = resolveEditedCategory();
  if (!nextCategory) {
    alert('Velg kategori eller skriv inn en ny kategori.');
    renderTable();
    return;
  }

  try {
    await updateExpense(expenseId, { category: nextCategory });
    editingExpenseId = null;
    editingCategoryValue = '';
    editingCategoryNewValue = '';
    await loadExpenses();
  } catch (err) {
    alert('Kunne ikke oppdatere kategori. Prøv igjen.');
    console.error(err);
    renderTable();
  }
}

function getExpenseFlagInputs() {
  return {
    allocated: document.getElementById('exp-allocated'),
    transfer: document.getElementById('exp-transfer'),
    sunkCost: document.getElementById('exp-sunk-cost')
  };
}

function applyExpenseFlagState(flags) {
  const inputs = getExpenseFlagInputs();
  inputs.allocated.checked = flags.allocated;
  inputs.transfer.checked = flags.transfer;
  inputs.sunkCost.checked = flags.sunkCost;
}

function wireExclusiveExpenseFlags() {
  const inputs = getExpenseFlagInputs();

  Object.entries(inputs).forEach(([flagName, input]) => {
    input.addEventListener('change', () => {
      applyExpenseFlagState(normalizeExpenseFlags({
        allocated: inputs.allocated.checked,
        transfer: inputs.transfer.checked,
        sunkCost: inputs.sunkCost.checked
      }, flagName));
    });
  });
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
    const isEditingCategory = editingExpenseId === e.id;
    const allocBadge = e.allocated ? '<span class="alloc-badge">Allokert</span> ' : '';
    const sunkBadge = isSunkCostExpense(e) ? '<span class="alloc-badge">Egen kost</span> ' : '';
    const rowClass   = e.allocated ? ' class="row-allocated"' : '';
    const categoryOptions = allKnownCategories()
      .map((category) => `<option value="${category}"${category === editingCategoryValue ? ' selected' : ''}>${category}</option>`)
      .join('');
    const categoryCell = isEditingCategory ? `
      <div class="d-flex flex-column gap-1">
        <select class="form-select form-select-sm expense-category-edit-select">
          ${categoryOptions}
          <option value="__new__"${editingCategoryValue === '__new__' ? ' selected' : ''}>＋ Ny kategori…</option>
        </select>
        <input
          type="text"
          class="form-control form-control-sm expense-category-edit-new${editingCategoryValue === '__new__' ? '' : ' d-none'}"
          placeholder="Navn på ny kategori"
          value="${editingCategoryValue === '__new__' ? escapeHtml(editingCategoryNewValue) : ''}"
        />
      </div>
    ` : normalizeExpenseCategory(e.category);
    const actionCell = isEditingCategory ? `
      <div class="d-flex flex-wrap gap-1 justify-content-end">
        <button class="btn btn-sm btn-primary btn-category-save" data-id="${e.id}">Lagre</button>
        <button class="btn btn-sm btn-outline-secondary btn-category-cancel" data-id="${e.id}">Avbryt</button>
        <button class="btn-archive" data-id="${e.id}" title="Arkiver">×</button>
      </div>
    ` : `
      <div class="d-flex flex-wrap gap-1 justify-content-end">
        <button class="btn btn-sm btn-outline-secondary btn-category-edit" data-id="${e.id}" title="Endre kategori">Kategori</button>
        <button class="btn btn-sm btn-outline-secondary btn-sunk" data-id="${e.id}" data-sunk="${isSunkCostExpense(e) ? '1' : '0'}" title="Marker som egen kost">
          ${isSunkCostExpense(e) ? 'Deles' : 'Egen'}
        </button>
        <button class="btn-archive" data-id="${e.id}" title="Arkiver">×</button>
      </div>
    `;
    html += `<tr${rowClass}>
      <td>${e.date}</td>
      <td>${allocBadge}${sunkBadge}${nok(e.amount)}</td>
      <td>${categoryCell}</td>
      <td>${e.supplierName || '—'}</td>
      <td>${e.description || '—'}</td>
      <td>${e.purchasedBy || '—'}</td>
      <td>
        ${actionCell}
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

  const flags = normalizeExpenseFlags({
    allocated: document.getElementById('exp-allocated').checked,
    transfer: document.getElementById('exp-transfer').checked,
    sunkCost: document.getElementById('exp-sunk-cost').checked
  });

  applyExpenseFlagState(flags);

  const data = {
    date: document.getElementById('exp-date').value,
    amount: document.getElementById('exp-amount').value,
    category,
    supplierName: document.getElementById('exp-supplier').value,
    description: document.getElementById('exp-desc').value,
    purchasedBy: document.getElementById('exp-purchased-by').value.trim() || currentDisplayName,
    allocated: flags.allocated,
    transfer: flags.transfer,
    sunkCost: flags.sunkCost
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
