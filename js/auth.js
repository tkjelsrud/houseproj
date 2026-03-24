import { app } from './firebase-config.js';
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';

export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

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

function shouldUseRedirectLogin() {
  const ua = navigator.userAgent || '';
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
  const isIPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIOSDevice || isIPadDesktopMode;
}

export async function finalizeLoginRedirect() {
  return getRedirectResult(auth);
}

export async function loginWithGoogle() {
  if (shouldUseRedirectLogin()) {
    await signInWithRedirect(auth, provider);
    return { redirected: true };
  }

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
