# AGENTS.md — House Project Tracker

Static Firebase web app for tracking expenses and work hours for a private project.

## Tech stack

- **Frontend**: Static HTML + Bootstrap 5.3.3 + vanilla ES modules
- **Auth**: Firebase Google Sign-In
- **Database**: Firestore (Firebase SDK 12.11.0 via CDN)
- **Charts**: Chart.js 4.4.4 + chartjs-plugin-annotation 3.0.1
- **Locale**: Norwegian (`nb-NO`)

## Project shape

- `index.html`: login page
- `dashboard.html`: overview, charts, budgets, and balance
- `expenses.html`: expense entry and archive
- `worklogs.html`: work-hour entry and totals
- `js/db.js`: Firestore CRUD
- `js/auth.js`: Google sign-in, sign-out, and allowlist gate
- `js/ui.js`: public/private branding helpers
- `js/lib/`: pure logic helpers used both by pages and local tests

## Runtime config

House-specific labels are intentionally not tracked in git. They live in Firestore document `config/app`:

```json
{
  "houseName": "Private project name",
  "memberNames": ["Member One", "Member Two"],
  "defaultExpenseCategories": ["Category A", "Category B"],
  "supplierSuggestions": ["Supplier A", "Supplier B"]
}
```

Local/deploy-only files:

- `js/firebase-config.js`: gitignored Firebase client config
- `js/runtime-config.js`: gitignored runtime allowlist config

## Business rules

- `transfer` expenses affect only per-person settlement
- `allocated` expenses are excluded from real totals and shown separately
- effective worklog hours are `hours * (numberOfPeople || 1)`
- archived expenses are filtered out by `getExpenses()`

## Public repo rule

Tracked source must stay generic. Do not commit:

- real house identifiers
- real member names
- real default category names
- supplier suggestions tied to the private project
- import/export utility files containing live data
