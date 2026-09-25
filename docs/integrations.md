# Real integrations

All providers default to mocks. Selecting a real provider requires keys; a missing key causes a startup error. Never commit real `.env` files to Git or send tokens in chat.

## Portfolio demo: OpenRouter with simulated calendar and email

The portfolio target uses a real LLM through OpenRouter with the existing mock calendar and email adapters. Configure these values in the local `.env` (fill in the key and exact model ID):

```dotenv
APP_MODE=demo
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemini-2.5-flash-lite
CALENDAR_PROVIDER=mock
EMAIL_PROVIDER=mock
```

Choose a model ID in `vendor/model` form whose endpoint supports structured outputs and disabled reasoning. The shared adapter uses OpenRouter's [Responses API](https://openrouter.ai/docs/api_reference/responses/basic-usage), the existing extraction schema and evidence validation, and `provider.require_parameters=true` to require support for the supplied parameters. OpenRouter extraction requests set `reasoning.effort=none` so reasoning cannot consume the 1,600-token JSON response budget, and `temperature=0` to reduce output variability. See [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs). Missing credentials or an incompatible model do not silently switch qualification to the mock parser.

The extraction prompt separates business eligibility from reported facts: unsupported services and locations must still be extracted. It requests every stated field, defines property ownership/approval as qualification evidence, and distinguishes explicit uncertainty from missing information and human handoff. Scores, eligibility and booking remain application decisions.

Booking, rescheduling and cancellation use SQLite; no Google account or event is involved. Mock emails, including secure chat and unsubscribe links, appear in the administrator's Outbox; no Resend account or actual email delivery is involved. Present this as **real AI qualification with simulated calendar and email** in the portfolio.

Existing synthetic demo records remain usable. Automatic sample seeding and reset require all providers to be mock; a fresh database with OpenRouter enabled starts without the eight sample leads. To include them, seed in all-mock demo mode before enabling OpenRouter, when execution is authorized. New enquiries can also be created through the form.

When checks are authorized, `npm run eval` uses the configured OpenRouter model with mock calendar/email and records the provider/model in the report. It makes paid LLM requests. `npm run eval -- --mock` remains offline. Real Google/Resend smoke is outside this portfolio scope.

Docker Compose forwards the OpenRouter variables. On the shared VPS, an administrator must install the updated `compose.yaml` and configure the server `.env`; the source-only autodeploy does not update Compose or credentials. No activation, deployment or provider check is implied by these instructions.

## OpenAI

```dotenv
LLM_PROVIDER=openai
OPENAI_API_KEY=your-key-in-local-env-only
OPENAI_MODEL=gpt-4.1-mini
LLM_TIMEOUT_MS=15000
```

The model name is a configurable default, **not a claim that it is the newest or best model**. The selected model must support the Responses API and strict structured output. The adapter in `src/providers/llm.mjs` calls `https://api.openai.com/v1/responses`, requests extraction with evidence from the message and validates the JSON schema and allowed fields. A second call rewrites the reply the application already chose in the customer's language; it must keep the planned question and service-area names, or the configured text is sent instead. The model does not receive scoring weights, owner, or calendar tools. An invalid response allows one repair attempt, followed by handoff. FAQ answers are retrieved from configuration by ID rather than copied from arbitrary model output.

With `LLM_PROVIDER=openai`, `npm run eval` uses real OpenAI but mock calendar/email providers. For backward compatibility, an unset/mock LLM provider also selects OpenAI for evaluation unless `--mock` is supplied. The run may incur charges. The local demo parser recognizes a limited set of English expressions; a successful mock run does not automatically generalize to arbitrary real responses.

## Google Calendar

```dotenv
CALENDAR_PROVIDER=google
GOOGLE_CALENDAR_ID=dedicated-calendar-id
GOOGLE_CLIENT_ID=your-oauth-client-id
GOOGLE_CLIENT_SECRET=your-oauth-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

Create a dedicated calendar and obtain an OAuth refresh token for your own authorized account. The application needs freeBusy read access and permission to create/update/delete events in the selected calendar; OAuth authorization and the consent screen are handled outside this application. Your OAuth client must be granted suitable permissions according to Google's documentation. This edition does not implement an OAuth callback/UI.

The adapter refreshes the access token in memory, retrieves real busy intervals, and uses a stable event.id and a private operation property. After a timeout, it searches for an existing event. Repeating an insert does not guarantee exactly-once behavior.

The lead's email **is not added as an attendee**, `sendUpdates=none`, and default reminders are disabled. This prevents uncontrolled calendar emails; confirmation appears in the chat. Cancellation and rescheduling are available to managers, not customers. The application does not generate prices or market-based timelines.

## Resend

```dotenv
EMAIL_PROVIDER=resend
RESEND_API_KEY=your-key-in-local-env-only
EMAIL_FROM=Acme <hello@your-verified-domain.example>
EMAIL_REPLY_TO=team@your-domain.example
EMAIL_ALLOWLIST=your-controlled-inbox@example.com
```

The domain/sender must be verified with the provider. In `APP_MODE=demo`, every email is restricted to an exact address allowlist. This applies to both the initial invitation and follow-up. In live mode, addresses are permitted according to the accepted lead's state; bulk import/cold outbound is not implemented.

Send requests use a stable `Idempotency-Key` and the same persisted payload. Resend documents a 24-hour key lifetime; the application uses a conservative 23-hour replay limit. An unknown result without safe reconciliation requires manual handling. Provider API acknowledgement means the service accepted the email, not that it reached the inbox.

## Live smoke test

Configure a dedicated calendar and a verified `SMOKE_EMAIL` address, and add that address to `EMAIL_ALLOWLIST`. Then run:

```sh
npm run live:smoke -- --confirm
```

**This command performs real actions:** it creates a synthetic event, reads it, sends one real email, and deletes the event during cleanup. Incomplete cleanup requires a manual check of the event.id in the report. Do not blindly repeat the command after an unknown result. The report is written to `evidence/live-smoke.json`; recorded verification coverage is in [status](status.md).

## Access and spending limits

Live mode uses a new database path, an HTTPS reverse proxy, changed passwords and webhook secret, and a 64-character hexadecimal encryption key. To generate a key locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Application limits restrict request counts but do not replace a provider billing cap. Before publishing on the internet, configure your own spending limits and restrictions on external recipients. Do not put real contacts in a public demo.
