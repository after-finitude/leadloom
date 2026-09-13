# Leadloom — implementation plan v1.1

> Historical plan for the original target stack, not an active execution plan. See [current product flow](../product-flow.md), [architecture](../architecture.md) and [status](../status.md) before making implementation decisions.

**Portfolio title:** Leadloom — AI Lead Qualification & Booking.  
**Revision date:** September 8, 2026.  
**Basis:** [Technical specification v1.1](Leadloom-TZ-v1.1.md). Criteria `AC-01`–`AC-26` are defined in §14 of the specification.

## Goal and scope of the first version

A complete product for one service company: **incoming enquiry → web chat → AI qualification → explainable score → Google Calendar booking → manager follow-through**.

Development proceeds through working scenarios. The web form, chat, and built-in CRM are connected in stage 3; the full path to a real appointment is completed in stage 6. The Conversations screen, log, and tests grow with the functionality rather than appearing only before release.

Scope includes one company, one real LLM provider, one calendar, one email service, a built-in CRM, human controls, settings, and a basic Execution Log. GoHighLevel, SMS, additional LLMs, inbound email conversations, advanced analytics, and additional nurture sequences are outside this version's acceptance scope.

The plan retains the original document's ten stages. Clarifications: the initial email invitation and secure return to chat are implemented in stage 3; minimum sending restrictions are in place before the first external send; complete handoff and control priorities are implemented in stage 5. New numerical values and product decisions are explicitly listed in §0 of the specification rather than attributed to the original sources.

## 1. Finalize the clarified contract and demo configuration

**Dependencies:** none. The updated specification is already prepared; this stage records it in the repository and test data rather than starting another round of document writing.

Before writing the main application code, finalize:

- D01–D10 from the specification: first-contact channels, round-the-clock intake, separate owner/pause/opt-out/review states, handling of Warm/Nurture/Unqualified leads, and first-version limitations.
- The field table: required service/location, conditionally required email before booking, optional budget/timeline/authority, and no more than two clarifications after the initial question.
- Demo scoring rules, Hot/Warm thresholds, hard rejection, and a pinned rule version for each Lead. Budget references and service areas are labeled as synthetic, not real commercial data.
- Two follow-up sequences, their delays, and a limit of three touches per sequence per Lead; no automatic nurture or sequences after Booked/Proposal.
- Intake and repeat-enquiry semantics, both active-deal policies, and the separate effects of Return to AI, Resume, and Restore consent.

Prepare an initial set of at least 20 scenarios with expected outcomes. Record the specification's new parameter values in configuration fixtures; lock evaluation thresholds before the first evaluation run.

**Verification:** each AC row has a stage and test type in the matrix at the end of the plan; no GoHighLevel/SMS requirement or blanket prohibition on nighttime intake is inherited from the old acceptance criteria.

**Outcome:** the specification, plan, seed configuration, and expected outcomes describe the same product. Subsequent changes to an accepted value require a new version and updated tests, not a hidden condition in a prompt.

## 2. Set up the application, data, and access

**Dependencies:** stage 1.

| Component | Implementation |
|---|---|
| Interface | Next.js, TypeScript, Tailwind |
| API and business logic | NestJS |
| Data | PostgreSQL 16 |
| Background tasks | Redis, BullMQ, a separate worker from the shared codebase |
| Integrations | `LLMProvider`, `CalendarProvider`, `EmailProvider`: one real adapter of each type and a mock for tests |
| Startup | Docker Compose, migrations, seed, environment configuration |

One repository and one backend. The built-in CRM uses the same database; an external `CRMProvider` is not needed for the excluded GoHighLevel integration. Do not split the application into separate microservices or build a general-purpose integration platform.

Implement manager and administrator login, roles, a basic protected visitor session, public response schemas, webhook authorization, request limits, and shared error handling. Prepare the return/unsubscribe token model; its user flow is completed in stage 3.

Create the core migrations and infrastructure for `correlation_id`, operation keys, append-only audit, and persisted background intents. Data and the intent to enqueue a task must be committed atomically. The worker retrieves state from the database and does not rely on Redis as the task's only copy.

Obtain and verify real access to the selected LLM, dedicated calendar, and email service; configure the sender. Pin model/dependency versions, timeouts, bounded retries, and secret-storage rules. Check providers' idempotency and reconciliation capabilities: if a capability is unavailable, use `unknown → manual` rather than promising safe repeat sends.

**Checks alongside implementation:** login and roles; denial of access to others' data; no secrets in logs; no UPDATE/DELETE permission on AuditEvent for the application role; persistence of pending actions; task reprocessing without a second effect in a test handler.

**Outcome:** the application starts through one documented sequence; staff log in with their roles; the API and worker see persisted state; integration access has actually been verified. The foundation for AC-19, AC-20, and AC-23 is ready.

## 3. Implement intake, the built-in CRM, and live chat

**Dependencies:** stage 2.

Add the form, webhook, and event generator. Implement Contact, Lead, Opportunity, Conversation, Message, IntakeEvent, and the timeline. The minimal UI already shows a list, a profile, and message history, and allows visitors/managers to send messages.

In intake, implement validation, phone/email normalization, rejected-event persistence, `correlation_id`, and an event key. Repeating the same payload returns the previous result; changing the payload under the same key causes a conflict. Repeating a message with the same client key does not add a second row.

Separate deduplication from routing: reuse an unambiguously identified contact; preserve identifier conflicts for the manager without automatic merging. A new event for an active enquiry creates `re_engaged`; after Won/Lost, create a new process. Test both active-deal policies separately; an unknown service with ambiguous routing requires manual resolution.

**Complete the first-contact channel at this stage:**

| Input | Stage 3 implementation |
|---|---|
| Built-in form | Protected chat and the first substantive question from configuration; free-form AI conversation is added in stage 4 |
| Webhook with email, no session | A real one-time invitation email; safe link exchange for a session; measurement of time until the provider accepts the email |
| Phone-only webhook | Manager queue with `no_automated_channel`; no fabricated send |
| Known contact | Existing history opens only after authorization, not merely because the submitted email/phone matches |

Implement basic unsubscribe and checks for opt-out, pause, and owner before the first external email. A manual message already performs Take over. Do not defer these safeguards until follow-up; the full set of transitions and races is accepted in stage 5.

Start measuring first-contact latency using the correct start and end points. Persist separate statuses for sending, errors, and the absence of an automated channel. Waiting for an email click is not included in the first-email SLA.

**Checks:** three identical webhooks; key conflict; rejected intake; both active-deal policies; phone/email belonging to different contacts; history persistence after page refresh; worker restart; safe link and unsubscribe; another visitor's session; a public form using an existing contact's email/phone does not expose history or replace a trusted address with a new one; nighttime intake.

**Outcome:** intake, the built-in CRM, and live chat work; an email webhook has a real return path to chat. AC-01–AC-03 and basic AC-18, AC-19, AC-21, and AC-23 can be verified. This is the first demonstrable milestone.

## 4. Connect AI qualification

**Dependencies:** stage 3.

AI extracts information and drafts text; code chooses the next step and permitted actions. Start with one field set from §7.3 of the specification, without a general-purpose schema editor.

Implement a strict JSON schema, multi-field extraction in one turn, one question per message, skipping answered questions, and clarification limits. Unknown is distinct from `false`, zero, and an explicitly unsuitable value. Each field's state records its source, timestamp, clarification attempts, and unknown status.

Add corrections to previously supplied information, `FieldRevision`, and locking of manual manager edits. A proposal that conflicts with a locked field does not overwrite it; a material conflict is handed off for review.

Connect a small FAQ and brand voice. Questions outside the FAQ, requests for a human, negative responses, prohibited topics, unknown required fields, and unrecoverable model failures trigger the shared handoff mechanism rather than long improvised answers. Handoff does not depend on a successful LLM summary: context is available from persisted data.

Configure one repair attempt for invalid JSON, a bounded timeout, and a clear error. The model has no direct access to the calendar, database, or email sending. Code must validate the model's proposal even when the JSON is valid.

**Checks:** multiple facts in one message; optional "I don't know"; two clarifications for a critical field; corrections; manual locks; FAQ/questions outside the FAQ; invalid JSON; timeout; prompt injection; no repeated question after an answer has been received.

**Outcome:** the visitor can converse freely, while the manager sees the conversation and fields being populated with their sources. AC-04–AC-06 and substantial parts of AC-09, AC-20, and AC-23 are implemented. AI fixtures are run as features appear, not only in stage 9.

## 5. Add scoring and complete conversation controls

**Dependencies:** stage 4.

Implement the deterministic weights, thresholds, and hard rejection from the specification. For each result, persist the input snapshot, total, category, reasons, and pinned rule version. An existing Lead retains its previous version; a manager can explicitly recalculate using a new version, and the action is logged.

Store and display commercial category, qualification status, opportunity stage, human review, owner, paused, and contact-level opt-out separately. Do not use a "Needs human review" category in place of an independent flag or treat a high score as booking permission.

Complete automatic handoff: reasons, queue, summary with a fallback, context, and link. A new lead reply after handoff does not enable AI. Implement the exact semantics of Take over, Return to AI, Pause, Resume, and separate Restore consent; the latter is administrator-only and requires confirmation/a reason.

Process each conversation sequentially; any change affecting a reply increments its revision. Recheck revision and permissions immediately before publishing/sending. STOP is applied before the LLM and does not wait for generation to finish. Cancellation of pending tasks is backed by a worker check, not only by removing a job from the queue.

Verify the distinction between "do not start a new send after a prohibition" and "revoke an external request that has already been accepted." The latter is not promised; an operation that has already started is reconciled and logged.

**Checks:** all score boundaries; unknown values; hard rejection despite a high total; new rule version; two enquiries from one opted-out contact; STOP during generation; manual reply during generation; human ownership after new intake; differences between Resume/Return to AI/Restore consent; no automatic nurture.

**Outcome:** scores are explainable, automation is controllable, and handoff actually stops subsequent actions. AC-07–AC-11 and the relevant parts of AC-19/AC-23 are complete. This is the second milestone.

## 6. Implement Google Calendar booking

**Dependencies:** stage 5; access and adapter capability checks from stage 2.

Retrieve real availability, accounting for the schedule, timezone, duration, buffer, and search window. Show 3–5 slots, or all 1–2 slots found; hand off to a human if there are none. The interface always shows the timezone, and database timestamps are stored in UTC.

Booking policy is a separate testable function: qualification completion, Hot/Warm, service/location fit, required fields, email, owner, review, pause, opt-out, stage, no active appointment/operation, and a valid selection. A score comparison or model instruction cannot replace this function.

Booking sequence:

1. Generate server-provided slot offers and receive the visitor's explicit selection.
2. Create a persisted booking intent and stable operation key.
3. Guard against overlapping application operations, reread state, and recheck availability.
4. Create the event and persist the external identifier/confirmed result.
5. Only after confirmation, move the deal to Booked, display the result, and prepare context for the manager.

Add reconciliation when a response is lost after event creation. `unknown` is not retried as a new booking; if the result cannot be established, use the manager queue. The persisted identifier ties a retry to the original operation. Rechecking availability is not an atomic lock against independent calendar editors; use a dedicated calendar and document this boundary explicitly.

Add manager cancellation/rescheduling with keys, result verification, and preservation of the old confirmed state on failure. Cancellation does not automatically resume follow-up. Do not enable independent calendar email reminders that bypass the application's shared restrictions.

**Checks:** Hot/Warm; unknown email; selection of another lead's/stale slot; timezones and daylight saving transitions; 1–2/0 slots; concurrent overlapping intervals; repeated request; failure before creation and timeout after actual creation; cancellation and rescheduling; no false Booked state. Use a dedicated calendar and synthetic data for live smoke testing.

**Outcome:** the full path from enquiry to a real appointment works. AC-12–AC-15, the calendar parts of AC-19/AC-20, and part of AC-25 are complete. This is the product's main intermediate milestone.

## 7. Add two email sequences

**Dependencies:** stage 6; sender, return link, and unsubscribe have worked since stage 3.

Implement only `qualification_abandoned` and `qualified_not_booked`, using the conditions and demo delays in §7.7 of the specification. The sequence version pins templates and delays; current restrictions and working hours are checked separately.

No more than three provider-accepted touches per sequence per Lead. A reply cancels the current run; starting another run does not reset the counter. The two sequences are not active simultaneously; Unqualified/Nurture and Booked/Proposal/Won/Lost do not receive an additional automated sequence.

Before sending, the worker rereads state: email, reply, qualification, booking and any incomplete booking operation, stage, owner, review, pause, opt-out, touch limit, and permitted time. A state change cancels a stale task with a reason. Sending outside working hours is deferred; touches accumulated during downtime are not sent as a batch.

The email returns the visitor to their own chat; slots are refreshed on return rather than taken from old email text. Unsubscribe applies to the whole contact and requires no staff login. Email replies go to the company; automatic email parsing is not added to scope.

Handle known rejection and unknown send results separately. Retry does not create a second send if the previous one is already confirmed; an uncertain operation requires provider-supported reconciliation or manual resolution.

**Checks:** both sequences with controlled test clocks; nighttime/weekend deferral; STOP/reply/Take over/booking before sending; missing email; expired link; limits after multiple replies; job redelivery; timeout after email acceptance; task recovery after restart; no batch of overdue touches.

**Outcome:** follow-up actually reaches users outside the website and stops when state changes. AC-16–AC-18 and the email parts of AC-19/AC-20 are complete; real emails have been tested on allowed addresses.

## 8. Complete the working interface and settings

**Dependencies:** stage 7; the interface foundation has been built since stage 3.

Complete Conversations as a three-column workspace: filters, message history, system events, fields with sources, score with reasons/version, separate review status, appointment, and next action. Display pause, opt-out, and owner so that restrictions do not look like a missing-response error.

Complete Lead Profile: data and recalculation history, manual locks, notes, assignments, stages, Lost reasons, appointments, and conflicting-intake handling. Access to a source message must not require searching the console.

Add compact Settings for company, FAQ, questions, scoring, schedule, and follow-up. A new rule version does not recalculate existing enquiries; changing working hours affects future sends. Integration secrets are not displayed as ordinary settings fields.

Complete Execution Log: process, status, attempts, duration, error, correlation id, and safely redacted inputs/results. For `unknown`, reconcile first; unsafe retry must not appear as an available button. Manual resolution and retries respect current restrictions, not just the run's old state.

**Checks:** a manager completes the entire flow without database/console access; buttons do not conflate different transitions; direct API calls cannot bypass roles; settings change the expected behavior; reasons and next actions reflect the worker's actual state.

**Outcome:** the manager interface is ready, including follow-up and diagnostics. AC-21/AC-22 are complete; user-facing parts of AC-07, AC-10, and AC-23 are rechecked.

## 9. Run overall acceptance and evaluation

**Dependencies:** stage 8. This is a full run of tests already written, not the start of testing.

Run unit/integration/E2E tests and the full AC-01–AC-26 matrix where applicable. Separately test STOP/Take over/booking races, redelivery, worker restart, and Redis/PostgreSQL, LLM, and external service outages. An error must not disappear from the log because a later run succeeds.

Run `npm run eval` against the selected real LLM with controlled external adapters. The `--mock` run supports reproducible CI and is labeled separately. Save `/evaluation/last-run.md`, a machine-readable result, commit, models, prompt, rule/fixture versions, adapter modes, and error details.

Apply the thresholds fixed in advance in §13: ≥95% extraction/category match, no invented unknown fields, 100% detection of mandatory handoff, 0 false bookings/duplicates/leaks, and the remaining criteria. Do not turn booking or five-field completion rates into a requirement to book unsuitable leads or invent unknown information.

Measure first contact separately for web and email. Do not describe API email acceptance as actual inbox delivery. Verify and record live smoke testing with a real appointment and an email received at an allowlisted address. Do not present a mock percentage as real integration quality or production conversion.

**Result verification:** each AC has a test/artifact and status; there are no exceptions to mandatory scope without a specification version change. A critical scenario failure blocks release until it is fixed and rerun. The earlier failed result remains in history.

**Outcome:** AC-24/AC-25 are complete, with reproducible evidence for the remaining criteria and an accurate list of limitations.

## 10. Deploy and prepare the portfolio

**Dependencies:** stage 9.

Deploy web, API, worker, PostgreSQL, and Redis through the documented process. Verify environment variables, migrations, data persistence after restart, protected access, and dedicated integration resources.

Prepare a published demo with synthetic contacts, spending/request limits, external-email restrictions, and a safe calendar. Public mock or allowlist mode is clearly labeled; real integration evidence is shown separately. Reset works only on isolated demo data and has no path to production audit records.

Prepare README, `/architecture`, `/configuration`, `/runbook`, `/evaluation`, and `/known-limitations`. The runbook explains retry/reconcile, worker recovery, manual handoff, Resume/Return to AI, and separate removal of opt-out with a reason.

Portfolio materials: a 60–90-second video; scenarios for "successful booking," "manager handoff," and "integration failure and recovery"; screenshots of Conversations with populated fields, the appointment, and the log/evaluation; an English case study with measured results. Do not attribute real revenue growth to a demo or present a sandbox as a production channel.

**Checks:** clean startup following README; a new visitor completes the flow with the correct demo restrictions; a manager opens history and handles an error; demo reset does not affect real data; all links and materials are accessible.

**Outcome:** AC-26 is complete. The published product and case study are ready; excluded integrations remain in the backlog and are not hidden in feature descriptions.

## Requirements and verification matrix

The stage number indicates implementation/primary verification; stage 9 repeats all mandatory scenarios in full.

| Acceptance | Specification basis | Stages | Main evidence |
|---|---|---|---|
| AC-01 | §7.1–7.2 | 3 | Integration: identical keys, payload conflict, a single first contact |
| AC-02 | §7.1–7.2 | 3 | Integration/UI: rejected intake, contact conflict, re_engaged, both policies |
| AC-03 | §7.1 | 3, 9 | E2E + web/email measurement + phone-only route |
| AC-04 | §7.3 | 4 | AI fixtures + E2E extraction of five attributes |
| AC-05 | §7.3 | 4 | Unit/AI: null, clarification limit, required fields |
| AC-06 | §7.3 | 4, 5 | Integration/AI: corrections, history, manual locks |
| AC-07 | §7.4–7.5, §10 | 5, 8 | Unit scoring + version/state integration + UI |
| AC-08 | §7.4, §7.6–7.7 | 5, 6, 7 | Negative booking tests and absence of prohibited sequences |
| AC-09 | §7.8 | 4, 5 | AI/integration: every trigger, context, subsequent reply |
| AC-10 | §7.8–7.9 | 5 | Concurrent integration test and button checks |
| AC-11 | §7.8–7.9 | 3, 5, 7 | STOP/unsubscribe, multiple enquiries, queue state |
| AC-12 | §7.6 | 6 | Calendar contract tests, timezones, live availability |
| AC-13 | §7.6 | 6 | Booking E2E, external event id, negative eligibility tests |
| AC-14 | §7.6, §7.9 | 6 | Concurrent requests and fault injection after creation |
| AC-15 | §7.6 | 6 | Cancellation/rescheduling, repeat requests, unknown results |
| AC-16 | §7.7 | 7 | Test clocks, limits, and mutually exclusive sequences |
| AC-17 | §7.1, §7.7–7.9 | 3, 5, 7 | Working hours and races with stop/reply/booking |
| AC-18 | §9, §12 | 3, 7 | Link authorization, GET preview, expiry, unsubscribe |
| AC-19 | §7.9, §8 | 2, 3, 5, 6, 7 | Restart, redelivery, persisted intents |
| AC-20 | §7.3, §7.5–7.9 | 2, 4, 6, 7 | Database/LLM/calendar/email failures, unknown reconciliation |
| AC-21 | §6.1–6.2 | 3, 8 | User E2E without database access |
| AC-22 | §6.3–6.4 | 5, 7, 8 | Version/hour changes and allowed log actions |
| AC-23 | §9, §12 | 2–8 | RBAC, public schemas, others' IDs, secrets, audit, injection |
| AC-24 | §13 | 4–9 | Real AI run, report, versions, thresholds |
| AC-25 | §12–13 | 3, 6, 7, 9 | Real email/calendar on allowed resources |
| AC-26 | §16 | 10 | Clean startup, published demo, and materials |

## Development milestones

| After stage | What can already be demonstrated |
|---|---|
| 3 | Intake, CRM, live chat, email invitation, and secure return |
| 5 | AI qualification, explainable score, automatic handoff, STOP, and manager takeover |
| 6 | Full path to a real appointment with conflict and retry handling |
| 8 | Complete manager workflow, both follow-up sequences, and diagnostics |
| 10 | Published product, measured acceptance, and a finished Upwork case study |

## Stage completion rule

A stage is complete when its scenario works through the application, data survives restart, relevant negative cases are tested, and the result and limitations are documented. An endpoint or attractive screen without connected behavior is not a completed feature.

Add GoHighLevel, SMS, new sequences, and advanced analytics in a separate subsequent version after this one is accepted, rather than silently reintroducing them into the current scope.
