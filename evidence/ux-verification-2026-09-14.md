# UX verification — 14 September 2026

Production bundle: `index-_GgFZ_62.js`, `index-CPViKQop.css`.

## Automated checks

- ESLint and Prettier checks passed across the project.
- TypeScript and Svelte checks: 0 errors, 0 warnings.
- Production build passed.
- Node tests: 78 passed, 0 failed, including the new frontend state tests.
- Mock evaluation: 24/24 scenarios passed.
- `git diff --check` passed.

The first HTTP test attempt could not bind loopback ports inside the sandbox.
The authorized retry with local network access passed all 78 tests.

## Browser verification

Used the Codex browser against an isolated demo database at
`/tmp/leadloom-ux-20260914/qa.sqlite`, served on `127.0.0.1:3002` with all providers mocked.
Browser interactions were performed through the native browser tools;
the optional Python browser suite was not executed.

- Staff drafts remain separate when switching Lucas and Sophia conversations.
- Staff drafts survive navigation to Settings, return to Inbox and page reload.
- Search, filter and selected conversation survive reload and a profile round trip,
  including reloading the profile before returning to Inbox.
- Whitespace replies show an error under the composer.
- A stopped test server produces an inline connection error and retains the draft.
  The draft survives reload after server recovery; retry sends once and clears it.
- Consecutive manager replies share an author label and a final timestamp.
- A date fixture in the test database renders separate Yesterday and Today dividers.
- An invalid budget range shows its error beside the budget field and retains values.
- Login errors and missing enquiry contact details appear in their forms.
- Public chat drafts survive reload, reject whitespace and clear after successful send.
- At 390 × 844, Back to list and reopening the conversation preserve the draft.
  The composer stays within the viewport; no horizontal overflow was measured.
- No JavaScript errors were recorded in the staff or public test tabs.

## Final state

The primary server had stopped and was restarted with its existing configuration.
The authenticated Inbox at `http://localhost:3000/` loads the production bundle above,
with no horizontal overflow or JavaScript errors. No messages were sent through
the primary OpenRouter-backed workspace during this verification.

Temporary viewport overrides were reset, test tabs closed, and the isolated server
stopped. The primary server remains running. No commit or push was performed.
