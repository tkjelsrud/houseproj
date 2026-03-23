import { app } from './firebase-config.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  doc,
  orderBy,
  query,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
import { normalizeAppConfig } from './lib/app-config.js';

const db = getFirestore(app);

// ---- Config ----

export async function getAppConfig() {
  const snap = await getDoc(doc(db, 'config', 'app'));
  if (!snap.exists()) return normalizeAppConfig({});
  return normalizeAppConfig(snap.data());
}

// ---- Expenses ----

export async function addExpense(data, uid) {
  return addDoc(collection(db, 'expenses'), {
    date: data.date,
    amount: Number(data.amount),
    category: data.category.trim(),
    supplierName: data.supplierName.trim(),
    description: data.description.trim(),
    purchasedBy: (data.purchasedBy || '').trim(),
    allocated: data.allocated === true,
    transfer: data.transfer === true,
    addedBy: uid,
    createdAt: serverTimestamp()
  });
}

export async function getExpenses() {
  const q = query(collection(db, 'expenses'), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => !e.archived);
}

export async function archiveExpense(id) {
  return updateDoc(doc(db, 'expenses', id), { archived: true });
}

// ---- Work Logs ----

export async function addWorklog(data, uid) {
  return addDoc(collection(db, 'worklogs'), {
    date: data.date,
    contractorName: data.contractorName.trim(),
    hours: Number(data.hours),
    numberOfPeople: Number(data.numberOfPeople) || 1,
    hourlyRate: Number(data.hourlyRate),
    taskDescription: data.taskDescription.trim(),
    addedBy: uid,
    createdAt: serverTimestamp()
  });
}

export async function getWorklogs() {
  const q = query(collection(db, 'worklogs'), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---- Budgets ----

// categorySlug: lowercase slug used as document ID, e.g. "bathroom"
export async function setBudget(categoryName, allocatedAmount) {
  const slug = categoryName.toLowerCase().replace(/\s+/g, '-');
  return setDoc(doc(db, 'budgets', slug), {
    categoryName: categoryName.trim(),
    allocatedAmount: Number(allocatedAmount),
    updatedAt: serverTimestamp()
  });
}

export async function getBudgets() {
  const snap = await getDocs(collection(db, 'budgets'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
