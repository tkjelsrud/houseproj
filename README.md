# House Project Tracker

Private Firebase web app for tracking expenses and work hours without committing private project data to the repo.

## Local setup

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project.
2. Enable **Google** under Authentication → Sign-in method.
3. Create Firestore in production mode.
4. Add a Web app and copy the Firebase config values.

### 2. Configure the app locally

Create `js/firebase-config.js` locally. It is gitignored and never committed:

```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';

const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
  measurementId: 'YOUR_MEASUREMENT_ID'
};

export const app = initializeApp(firebaseConfig);
```

Optional: create `js/runtime-config.js` locally from [`js/runtime-config.example.js`](js/runtime-config.example.js) if you want the client-side UID allowlist locally:

```js
export const runtimeConfig = {
  allowedUids: ['UID_1', 'UID_2']
};
```

### 3. Populate protected Firestore config

Create document `config/app` with the private runtime labels you do not want committed to git:

```json
{
  "houseName": "Private project name",
  "memberNames": ["Member One", "Member Two"],
  "defaultExpenseCategories": ["Category A", "Category B"],
  "supplierSuggestions": ["Supplier A", "Supplier B"]
}
```

## GitHub Pages deployment

The GitHub Actions workflow generates `js/firebase-config.js` and `js/runtime-config.js` during deploy. Add these repository secrets in GitHub → Settings → Secrets and variables → Actions:

| Secret name | Value |
|---|---|
| `FIREBASE_API_KEY` | Firebase `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | Firebase `authDomain` |
| `FIREBASE_PROJECT_ID` | Firebase `projectId` |
| `FIREBASE_STORAGE_BUCKET` | Firebase `storageBucket` |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase `messagingSenderId` |
| `FIREBASE_APP_ID` | Firebase `appId` |
| `FIREBASE_MEASUREMENT_ID` | Firebase `measurementId` |
| `FIREBASE_ALLOWED_UID_1` | first allowed Google user UID |
| `FIREBASE_ALLOWED_UID_2` | second allowed Google user UID |

Enable GitHub Pages with **Build and deployment → Source → GitHub Actions**.

## Firestore rules

Use [`firestore.rules.example`](firestore.rules.example) as the starting point. Replace the UID placeholders with your real allowed Google UIDs and publish the rules from the Firebase console or Firebase CLI.

## Local tests

Run the local integrity suite with:

```sh
npm test
```

The test suite covers:

- expense splitting and summary calculations
- per-person balance logic
- worklog hour and cost calculations
- category merging/default selection helpers
- privacy checks that fail if banned private labels reappear in tracked source

## Security note

Firebase web config values are public client identifiers, not admin secrets. Real protection comes from Google Auth, the UID allowlist, and Firestore rules.
