import { app } from './firebase-config.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';

export const auth = getAuth(app);
const provider = new GoogleAuthProvider();

async function loadRuntimeConfig() {
  try {
    const mod = await import('./runtime-config.js');
    return mod.runtimeConfig || {};
  } catch {
    return {};
  }
}

function redirectToIndex(reason = '') {
  const url = new URL('index.html', window.location.href);
  if (reason) url.searchParams.set('reason', reason);
  window.location.href = url.toString();
}

export async function isAuthorizedUser(user) {
  const runtimeConfig = await loadRuntimeConfig();
  const allowedUids = Array.isArray(runtimeConfig.allowedUids) ? runtimeConfig.allowedUids : [];
  if (allowedUids.length === 0) return true;
  return allowedUids.includes(user.uid);
}

export function loginWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function logout(reason = '') {
  return signOut(auth).finally(() => {
    redirectToIndex(reason);
  });
}

// Call on every protected page. Redirects to login if not authenticated.
export function requireAuth(initFn) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirectToIndex();
      return;
    }

    if (!await isAuthorizedUser(user)) {
      await logout('unauthorized');
      return;
    }

    initFn(user);
  });
}
