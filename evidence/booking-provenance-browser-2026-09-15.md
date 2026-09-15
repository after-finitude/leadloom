# Booking recovery and field sources — browser verification

Date: 15 September 2026. Native Codex in-app browser, current working-tree frontend served by Vite and current backend source. All providers were mock. The isolated SQLite database was created under `/tmp/leadloom-browser.gSM7L4`; the normal project database and credentials were not used.

## Observed results

- A synthetic enquiry qualified through the public form and chat and displayed five available slots.
- The isolated test server inserted a competing mock calendar event immediately before the first booking's availability recheck. The actual worker rejected that booking; this was not an injected frontend error response.
- The chat displayed the occupied-slot explanation and automatically replaced the offers. The occupied 09:00 UTC slot and its buffer were excluded; the first new offer was 09:45 UTC.
- Reloading preserved the explanation and automatically loaded available times again.
- Selecting 09:45 UTC produced a confirmed appointment and removed the previous failure notice.
- Staff opened the same lead in Inbox Details. The location source expanded and collapsed using Enter and displayed the original qualification message, customer name and timestamp.
- In the profile's Data tab, the budget displayed separate minimum and maximum sources.
- A manual edit changed only the minimum from $25,000 to $20,000. Its source became a team edit; the maximum retained $25,000 and the original lead message. The result persisted after reload.
- Browser console error logs were empty for both customer and staff tabs.

Screenshots were visually inspected during the session. No application fixes were needed in this verification turn.

## Boundary

This was focused browser verification of booking-conflict recovery and field provenance. It did not run the automated test suite, production build, type checks, lint, real integrations, or full mobile/multi-browser acceptance. The temporary server supplied one controlled calendar conflict and otherwise used the application implementation.
