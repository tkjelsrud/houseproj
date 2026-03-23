import { requireAuth } from './auth.js';
import { addWorklog, getWorklogs } from './db.js';
import { applyHouseName } from './ui.js';
import { getEffectiveHours, getWorklogCost } from './lib/dashboard-logic.js';

const nok = (n) =>
  new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n);

let currentUser = null;
let allWorklogs = [];

requireAuth(async (user) => {
  currentUser = user;
  document.getElementById('user-email').textContent = user.email;
  await applyHouseName('Arbeidslogg');

  document.getElementById('wl-date').valueAsDate = new Date();

  await loadWorklogs();

  document.getElementById('worklog-form').addEventListener('submit', handleSubmit);
  document.getElementById('filter-contractor').addEventListener('change', renderTable);
});

async function loadWorklogs() {
  allWorklogs = await getWorklogs();
  populateContractorFilter();
  renderTable();
}

function populateContractorFilter() {
  const contractors = [...new Set(allWorklogs.map(w => w.contractorName))].sort();
  const select = document.getElementById('filter-contractor');
  const current = select.value;
  select.innerHTML = '<option value="">Alle håndverkere</option>' +
    contractors.map(c => `<option value="${c}">${c}</option>`).join('');
  if (current) select.value = current;
}

function renderTable() {
  const filterCon = document.getElementById('filter-contractor').value;
  const rows = filterCon ? allWorklogs.filter(w => w.contractorName === filterCon) : allWorklogs;
  const totalHours = rows.reduce((sum, worklog) => sum + getEffectiveHours(worklog), 0);
  const totalCost = rows.reduce((sum, worklog) => sum + getWorklogCost(worklog), 0);

  if (rows.length === 0) {
    document.getElementById('worklog-tbody').innerHTML =
      '<tr><td colspan="6" class="text-muted text-center">Ingen registreringer ennå</td></tr>';
    document.getElementById('worklog-total').textContent = '';
    return;
  }

  let html = '';
  for (const w of rows) {
    const people = w.numberOfPeople || 1;
    const totalH = getEffectiveHours(w);
    const cost = getWorklogCost(w);
    html += `<tr>
      <td>${w.date}</td>
      <td>${w.contractorName}</td>
      <td>${totalH.toFixed(1)} h${people > 1 ? ` <span class="text-muted" style="font-size:0.8em">(${people}×${w.hours}h)</span>` : ''}</td>
      <td>${nok(w.hourlyRate)}/h</td>
      <td>${nok(cost)}</td>
      <td>${w.taskDescription || '—'}</td>
    </tr>`;
  }
  document.getElementById('worklog-tbody').innerHTML = html;
  document.getElementById('worklog-total').textContent =
    `${totalHours.toFixed(1)} h · ${nok(totalCost)}`;
}

async function handleSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('wl-submit');
  btn.disabled = true;

  const data = {
    date: document.getElementById('wl-date').value,
    contractorName: document.getElementById('wl-contractor').value,
    hours: document.getElementById('wl-hours').value,
    numberOfPeople: document.getElementById('wl-people').value,
    hourlyRate: document.getElementById('wl-rate').value,
    taskDescription: document.getElementById('wl-desc').value
  };

  try {
    await addWorklog(data, currentUser.uid);
    e.target.reset();
    document.getElementById('wl-date').valueAsDate = new Date();
    await loadWorklogs();
  } catch (err) {
    alert('Kunne ikke lagre arbeidslogg. Prøv igjen.');
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}
