# Gemini activation and public browser verification

Date: 14 September 2026. Public demo: https://leadloom.176.98.40.150.sslip.io/.

Application changes were committed and pushed as `912452972d131719c87868238bc01c53c2f94070`. GitHub Actions completed checks and deployment successfully: https://github.com/after-finitude/leadloom/actions/runs/34834213118.

Before activation, the deployed revision was checked against that commit. Under the shared deployment lock, the existing server configuration was backed up, the OpenRouter key was transferred through SSH into the root-only server `.env`, and the two missing OpenRouter environment mappings were added to the server-owned Compose file. Only Leadloom was recreated. Its database, existing account credentials, encryption key, and Docflow configuration were preserved.

The recreated container reported healthy and confirmed:

- `LLM_PROVIDER=openrouter`
- `OPENROUTER_MODEL=google/gemini-2.5-flash-lite`
- OpenRouter key present, value not displayed
- `CALENDAR_PROVIDER=mock`, `EMAIL_PROVIDER=mock`

## Verification

Local `npm run check` passed: lint, formatting, TypeScript/build, 73 tests and 24 mock scenarios. The independently preserved real Gemini evaluation passed 24/24 scenarios, 38/38 declared field assertions and 8/8 expected bookings with no false bookings. See `gemini-release-check-2026-09-14.txt` and `openrouter-gemini-evaluation-2026-09-14.md`.

Native Chrome first passed the customer/staff regression against an isolated local database with real Gemini, including slot conflict UI recovery, admin login/search/profile, appointment timezone display and STOP. See `gemini-browser-e2e-2026-09-14.json`.

Native Chrome then passed the public HTTPS customer journey at 2026-09-14T10:41:38.080Z:

- Create a synthetic enquiry and qualify it with real Gemini.
- Refresh available times, confirm a mock consultation and retain confirmation after reload.
- Send STOP and observe that automation is disabled.
- Verify tokenless unsubscribe messaging and public health provider labels.
- Observe zero page JavaScript errors.

See `gemini-vps-browser-2026-09-14.json` and `gemini-vps-chat-2026-09-14.png`. The synthetic smoke lead and mock consultation remain in the demo database; STOP prevents subsequent automation for that lead. No real email or Google Calendar event was created. This is one desktop Chrome customer journey, not a full production, mobile or multi-browser acceptance run.
