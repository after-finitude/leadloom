# Browser audit — 2026-09-13

Target: https://leadloom.176.98.40.150.sslip.io/ · deployed Leadloom 1.2.0.

Manual browser walkthrough using the customer, administrator and manager interfaces. All three providers were visibly configured as mock. The source was inspected to explain findings; no unit tests, builds, fault injection, application changes or deployment were performed in this audit.

## Result

The main demo journey works: intake → qualification → booking → manager reschedule → cancellation, plus CRM edits, review handoff, manual replies, consent controls and settings. This is not a clean release sign-off: the meeting time display is misleading, and several branches cannot be verified from the available browser data alone.

## Reproduced findings

### 1. Meeting time and displayed time zone disagree — medium

Book 14 September at 09:45 UTC, then reschedule to 10:30 UTC. The customer confirmation correctly shows 10:30 and Etc/UTC. The staff Meetings tab shows **18:30**, while its subtitle still says **Etc/UTC**. This also remains visible after cancellation.

Cause: `web/app.js:563` formats `a.start_at` through the general `dt` helper, which uses the browser's local zone, then prints `a.timezone` separately. Format the meeting in its appointment zone, or explicitly label the browser-local zone.

Evidence: [meeting-timezone.png](meeting-timezone.png). No underlying booking-time corruption was observed.

### 2. Login advertises credentials that differ from this deployment — low

The deployed login page displays and prefills a hardcoded demo password despite the VPS using generated credentials. This is a misleading login hint, not exposure of the actual VPS password. Successful admin and manager logins used the locally saved deployment credentials.

Cause: `web/app.js:1020` and `web/app.js:1025` depend only on demo mode. Demo provider mode does not imply default account credentials.

### 3. Tokenless unsubscribe page presents the wrong action — low

Opening `/unsubscribe` without a token shows “Stop automated outreach” and text asking the visitor to confirm stopping messages, but the actual form is “Request a new link”. It does not unsubscribe. The page should explain that a valid unsubscribe link is required.

Cause: `accessPage` in `web/app.js:1033` chooses the heading from the route and the form from token presence independently.

## Browser checks completed

| Area | Observed result |
| --- | --- |
| Empty intake | Rejected with `contact_required`; rejected event visible in Activity. Name is not a native required field. |
| New enquiry | Name, email and selected roofing service accepted; chat started at the location question. |
| Enquiry without selected service | Chat asked the service question first. |
| Duplicate intake | Same contact's active conversation and history reused; total stayed at ten leads after two new QA contacts. |
| Qualification | Synthetic service, city, budget, timeline and authority parsed; first QA lead scored Hot, 100/100. |
| FAQ | Opening-hours question returned the approved answer. |
| Unsupported location | “Outside City” produced an unqualified response and no booking button. Arbitrary “Outsideville” was not extracted by the mock parser and prompted for the city again. |
| Question outside FAQ | Warranty question handed off to a person; `outside_faq` appeared in the staff timeline. |
| Availability | Current slots loaded and refresh completed. |
| Booking | Selected time confirmed in customer chat and staff CRM. |
| Reload persistence | Chat history and active booking survived reload. |
| Rescheduling | New time confirmed in customer chat and staff record; staff time-zone display has finding 1. |
| Cancellation | Appointment became cancelled, stage returned to Qualified, customer booking confirmation card disappeared and booking became available again. |
| Login failure | Wrong password returned “Invalid email or password”. |
| Admin login/logout | Both completed successfully. |
| Manager login | Completed successfully; CRM available. |
| Manager settings restriction | Settings showed “An administrator is required to edit settings.” |
| Manager Outbox restriction | Navigation omitted Outbox; direct `/outbox` returned “Administrator required”. |
| Manager consent restriction | No restore-consent button on the opted-out QA lead. |
| Search | Email search found the QA lead; nonexistent search showed an empty result state. |
| List filters | Booked, Human, Needs attention and AI active returned appropriate records; All restored the full list. |
| Pagination boundary | With ten records, Page 1 / 1 and disabled Previous/Next. Multiple pages not exercised. |
| CRM profile tabs | Timeline, Data, Score and Meetings opened successfully. |
| Field edits | Budget changed from 25,000 to 30,000–35,000; manager source and revision history recorded. |
| Locked-field conflict | Customer's 40,000 answer did not overwrite the manager values; proposed conflicts recorded and owner became HUMAN. |
| Unlock controls | Budget unlock checkboxes submitted successfully. Subsequent AI overwrite after unlocking was not separately exercised. |
| Review resolution | Resolution reason saved; conversation returned to AI. |
| Private note | Note persisted in CRM and was absent from customer chat. |
| Scoring explanation | Component weights, total, rule version and evaluation history visible. |
| Recalculation | Explicit recalculation succeeded; later moved the first QA lead from rules v1 to v2. |
| Pause/resume | Customer pause banner appeared; message saved while pause remained active. Resume completed. |
| Manual replies | Replies from both admin and manager accounts appeared in customer chat and set human ownership. |
| STOP | Automation stopped; a subsequent customer message did not restore consent or trigger a reply before explicit restoration. |
| Restore consent | Admin recorded a reason and checked renewed-consent confirmation; AI ownership required a separate action. |
| Lost-stage validation | Missing reason rejected; supplied reason saved. Both QA records ended Lost. Other manual stage transitions were not individually exercised. |
| Activity | Intake events, turns, booking/reschedule/cancel operations and cancelled follow-ups visible. Completed operations reported done. |
| Company settings | Invalid time zone rejected with `invalid_timezone`; temporary company-name edit survived reload; original name restored. |
| Qualification settings | Question reorder worked; original order restored and saved; service/location required controls disabled. |
| Knowledge settings | Add FAQ added a draft row; draft discarded via reload; existing knowledge saved successfully. Saving a new populated FAQ was not exercised. |
| Rules publication | Published v2 with identical weights/thresholds. Existing first QA lead remained on v1 until explicit recalculation; second QA lead used v2. |
| Follow-up settings | Existing schedule and message saved successfully. |
| Outbox | Administrator could open the empty mock outbox. No real email was sent. |
| Invalid access token | Fresh tab required explicit Continue securely; invalid token rejected as expired/already used. |
| Access request | Synthetic unverified contact received the neutral eligibility response; no existence disclosure or recovery email was expected. |
| Browser console | Retrieved warning/error logs for customer and staff tabs were empty at the end of the walkthrough. This is not a network trace. |

## Not verified

- Real LLM behavior, real email delivery and an external calendar integration: all providers are mock.
- Successful access-link recovery, link replay, valid unsubscribe links, webhook invitations and intake-conflict resolution: no eligible verified test contact, mail payload or intake conflict available from the exercised UI paths.
- Time-delayed follow-up delivery, retries, reconciliation after uncertain provider responses, stale offers and simultaneous booking races: require controlled timing or fault/concurrency scenarios. Pending/cancelled states alone do not prove delivery.
- Pagination past 50 records: the deployment contained ten leads, and the UI has no page-size selector.
- Full mobile behavior: requested 390 × 844 through the browser viewport tool, but the actual page remained 739 × 714. The override was reset. A screenshot at 739px is not mobile verification.
- Every stage value, every settings validation boundary, keyboard/screen-reader coverage, multi-browser compatibility, security penetration testing and load testing.

## Test data and resulting state

- Created only `Browser QA 2026-09-13 Booking` (`qa-booking-20260913@example.test`) and `Browser QA 2026-09-13 Recovery` (`qa-recovery-20260913@example.test`). Both were marked Lost; the second was also opted out with STOP.
- The first QA appointment was cancelled. No existing seeded appointment was changed.
- Company name, question order, knowledge and follow-up values were left at their original values. An immutable **rules v2** was published with the same values as v1; the first QA lead was explicitly recalculated to v2.
- QA messages, notes, operations, intake events and rules v2 remain as audit evidence. No data was permanently deleted.
- Pre-existing uncommitted deployment files were left untouched. This report and screenshot are the only local audit artifacts.
