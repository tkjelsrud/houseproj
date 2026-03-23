import { getAppConfig } from './db.js';
import { PUBLIC_APP_NAME, buildPageTitle } from './lib/app-config.js';

function setBranding(name, pageSuffix) {
  document.querySelectorAll('.navbar-brand').forEach((el) => {
    el.textContent = name;
  });
  document.title = buildPageTitle(name, pageSuffix);
}

export function applyPublicBranding(pageSuffix) {
  setBranding(PUBLIC_APP_NAME, pageSuffix);
}

// Fetches protected app name from Firestore config and updates navbar + page title.
export async function applyHouseName(pageSuffix) {
  const config = await getAppConfig();
  setBranding(config.houseName || PUBLIC_APP_NAME, pageSuffix);
  return config;
}
