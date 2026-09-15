# Standalone edition HTTP API

All routes use the `/api` prefix. The public client does not supply trusted lead/contact IDs, owner, or score. Browser writes require application/json, an exact Origin match, and CSRF for actions within an existing session. Cookies use HttpOnly/SameSite=Strict; Secure is enabled for HTTPS. The webhook uses Bearer authentication and does not require browser CSRF.

| Method / path                                         | Purpose                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET /health, /meta                                    | Service health and safe public configuration                                                                       |
| POST /auth/login, /auth/logout; GET /me               | Login, logout, and staff CSRF                                                                                      |
| POST /leads/intake                                    | Authorized webhook: source, event_key, name?, email?, phone?, service_type?, external_id?                          |
| POST /public/intake                                   | Form: event_key, name?, email?, phone?, service_type?; source is set by the server                                 |
| GET /public/chat                                      | Visitor's own messages, active appointment, safe booking issue, and visitor CSRF                                   |
| POST /public/chat/messages                            | body, key; durable processing                                                                                      |
| GET /public/chat/availability                         | Server-provided slot offers for the visitor's own lead                                                             |
| POST /public/chat/appointments                        | offerId, key; explicit selection, response describes the persisted operation rather than a fabricated confirmation |
| POST /public/chat/access                              | token → single-use exchange for a visitor session                                                                  |
| POST /public/chat/request-access                      | email; neutral response, trusted channel, and limits                                                               |
| POST /public/unsubscribe                              | Separate scoped token; no staff login required                                                                     |
| GET /leads, /conversations, /users, /contacts         | Protected staff lists                                                                                              |
| GET/PATCH /leads/:id                                  | Profile / {fields, locked, unlock?}                                                                                |
| POST /leads/:id/messages                              | Manual reply {body,key} with Take over                                                                             |
| POST /leads/:id/notes                                 | Internal note {body}                                                                                               |
| POST /leads/:id/takeover, return-to-ai, pause, resume | Independent controls; reason required when resolving a review                                                      |
| POST /leads/:id/restore-consent                       | Admin only: reason, confirmed:true                                                                                 |
| POST /leads/:id/stage, assign, recalculate            | Stage / manager / explicit switch to the current scoring version                                                   |
| GET /appointments/:id/availability                    | Allowed intervals for staff rescheduling                                                                           |
| POST /appointments/:id/cancel, reschedule             | key and, for rescheduling, offerId                                                                                 |
| GET /runs                                             | Persisted actions, operations, and intake events                                                                   |
| POST /runs/:id/retry                                  | Only an allowed, safe retry                                                                                        |
| POST /operations/:id/reconcile                        | Reconciliation of an uncertain external result                                                                     |
| POST /intake-events/:id/resolve                       | contactId; manual resolution of an identifier conflict                                                             |
| GET/PUT /settings                                     | Staff viewing / admin-only update with revision                                                                    |
| GET/POST /rules                                       | Viewing / admin-only publication of an immutable version                                                           |
| GET /outbox                                           | Admin only in demo mode; local mock emails                                                                         |

`GET /leads` and `/conversations` return an `{items, total, page, pageSize, stats}` object instead of an array. Parameters: `q` (substring search across name, email, phone, and service, up to 200 characters), `filter` (`all`, `attention`, `ai`, `human`, `booked`, `waiting`), `page` (starting at 1), and `pageSize` (1–100, default 50). `%` and `_` are treated as ordinary characters in searches. Results are ordered by the most recent update and ID; a page beyond the result range is clamped to the last available page.

`total` is the record count after search and filtering; `stats` contains database-wide `total`, `open`, `ai`, `attention`, and `booked` counts, independent of the page and search. For example, `/api/leads?q=roofing&filter=ai&page=2&pageSize=50` returns the second page of matching leads and overall CRM counters.

`GET /public/chat` includes `booking_issue: {id, message} | null` for the latest known failed booking. It contains a public explanation, not provider diagnostics. A newer booking or an active appointment clears it; uncertain outcomes retain their appointment/reconciliation state and do not invite a fresh booking.

The customer chat limit applies per lead, identified through a verified visitor session. The form, access recovery, and other public routes retain IP limits; an arbitrary cookie cannot bypass them. Trusted proxy configuration is described in `docs/runbook.md`.

The exact accepted JSON keys are defined by `allowKeys` in `src/http.mjs`/`service.mjs`; reproducible usage examples are in `tests/http.test.mjs`. This is a compact contract for the local edition, not a promise to match every URL in the specification.

Results distinguish rejected (422), conflict (409), forbidden (403), unauthorized (401), accepted/pending (202), and confirmed outcomes. Separate status commands return current state data; the client does not treat 202 as proof that an appointment has been created.

## Webhook example

Against a running server, use its configured origin and webhook secret. This creates a synthetic enquiry and may send an invitation through the selected provider:

```sh
curl "$APP_ORIGIN/api/leads/intake" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -d '{"source":"website","event_key":"demo-webhook-001","name":"Synthetic Visitor","email":"webhook@example.test","service_type":"roofing"}'
```

With mock email, an eligible invitation is saved to the administrator's Outbox. Reuse the same event key only for identical data.
