# Svelte migration verification — 14 September 2026

The user reported a loading screen at localhost:3000 after the migration. The existing tab still displayed the old title and loading screen. The first build failed on a Svelte warning: the settings form reference was reassigned by `bind:this` without `$state`. Declaring the reference reactive removed the warning. The frontend was built and the user's tab reloaded successfully into Inbox.

Lint also found two native URLSearchParams instances in the reactive module and an unnecessary regex escape in the HTTP regression. These were corrected. Source files were formatted with the configured Prettier/Svelte plugin.

## Automated results

- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run build`: passed; Svelte checker reported zero errors and zero warnings, Vite emitted hashed JS/CSS.
- `npm test`: 75 passed, zero failed. Includes deep-link/static-asset/CSP regression.
- `npm run eval -- --mock`: 24/24 passed.

## Native browser observations

The user's existing localhost:3000 server was retained. Its Inbox, messages and Settings loaded after refresh. Mutating checks used a separate SQLite demo database under `/tmp`, port 3002, and mock LLM/calendar/email. Staff login checks used 127.0.0.1 to avoid replacing the user's localhost staff cookie.

- Empty enquiry showed the missing-contact explanation.
- A synthetic enquiry opened a private chat; message submission qualified it and exposed available slots.
- Booking became confirmed and remained present after reload.
- STOP stopped automation without cancelling the existing consultation; staff reply was disabled.
- Staff login and debounced search found the synthetic lead; profile navigation worked.
- Budget edits saved, recorded field history and locked the changed fields.
- Company settings, FAQ and follow-up save actions completed.
- A modified qualification question moved up, saved and retained its text/order after reload.
- Publishing scoring rules advanced the version from 1 to 2.
- Leads, Activity and the empty Outbox rendered.
- Logout worked; manager login showed the settings permission restriction and omitted Outbox.
- No JavaScript console errors were captured in the customer/staff test tabs.

## Limits

This was a targeted browser regression, not exhaustive acceptance. Live OpenRouter responses, real calendar/email, rescheduling/cancellation via UI, email preview/recovery links, all responsive sizes and Docker/CI deployment were not retested in this run. Existing server/API tests cover several underlying paths. No commit, push or deployment was performed.
