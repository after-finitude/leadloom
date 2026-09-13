# Leadloom — technical specification v1.1

> Historical design, not the current implementation contract. The standalone edition uses Node HTTP, browser JavaScript and SQLite. See [current product flow](../product-flow.md), [architecture](../architecture.md) and [status](../status.md). Requirements below describe the original target, not completed acceptance.

**Portfolio title:** Leadloom — AI Lead Qualification & Booking.  
**Revision date:** September 8, 2026.  
**Related document:** [Implementation plan v1.1](Leadloom-Implementation-Plan-v1.1.md).

## 0. Basis and revision changes

This document replaces "Specification No. 2 — AI Revenue Agent" for the first product version. It is based on `TZ-2-Revenue-Agent.md`, `AI-Revenue-Agent-Implementation-Plan.md`, and feedback on their consistency. The product purpose, core stack, screens, separation of AI and business logic, reliability requirements, and deliverables are retained.

The changes below are explicit additions, not interpretations of requirements already present in the original specification. Numerical settings absent from the original sources are labeled as **proposed demo values**. This is a working revision; its status does not imply external client approval. At the start of development, these values are fixed in seed data, tests, and settings as a single baseline configuration.

| Decision | Adopted in v1.1 |
|---|---|
| D01. Scope | One company, a built-in CRM, one calendar, one real LLM provider, and one email service. GoHighLevel and SMS are outside acceptance scope. |
| D02. First contact | The form opens a protected web chat. A webhook with email triggers an invitation to chat. A phone-only enquiry without an active chat goes to a manager without automated contact. |
| D03. Nighttime enquiries | Chat replies and the first email for an incoming enquiry are allowed around the clock. Working-hour restrictions apply to proactive follow-up. |
| D04. States | Commercial category, deal stage, need for human review, owner, pause, and opt-out are stored separately. |
| D05. Clarifications | No more than two clarifications after the initial question. An unknown optional field is skipped; an unknown required field triggers manager handoff. |
| D06. Booking | An unsuitable service or location always prohibits automatic booking. Demo eligibility requires completed qualification, Hot or Warm category, and the remaining checks in §7.6. |
| D07. Follow-up | Only incomplete qualification and qualified leads without a booking; three configurable touches each. Nurture and Unqualified do not trigger email sequences. |
| D08. Manager controls | Automatic handoff is implemented separately from manual Take over. Ordinary Resume / Return to AI does not clear STOP. |
| D09. Reliability | Basic Execution Log, slot conflicts, retries, and recovery of uncertain results are included in the first version. Advanced analytics are deferred; evaluation is not. |
| D10. New settings | Demo scoring rules, field criticality, follow-up delays, link lifetime, and evaluation thresholds below are new project values, not data from the original sources. |

Where earlier documents conflict with this revision, this revision applies to the first version. A behavior change requires corresponding updates to the specification, plan, and related tests.

## 1. Purpose

An inbound lead intake and qualification system for one service company, with automatic consultation booking and manager follow-through.

Main flow: **enquiry → protected web chat → structured qualification → explainable scoring → time selection → Google Calendar appointment → manager follow-through**.

A lead arrives through the built-in form or an external source webhook. The agent asks one question at a time, extracts information from free text, answers from a small FAQ, and stores structured data in the CRM. When needed, it hands the conversation to a human with context. If the lead goes silent, the system sends an allowed email follow-up with a link to the chat.

Core principle: the model understands responses and drafts messages; code calculates scores, manages states, and decides which actions are allowed. The LLM does not assign weights, create appointments directly, or serve as a source of facts about calendar availability.

The interface, templates, demo conversations, technical documentation, README, and portfolio case study are in English.

## 2. Stack

| Layer | Implementation |
|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind; starting version from the original specification |
| Backend | NestJS + TypeScript |
| Database | PostgreSQL 16 |
| Queue and scheduler | Redis + BullMQ |
| LLM | One OpenAI / Anthropic provider behind `LLMProvider`, plus a mock for tests |
| CRM | Built-in CRM in PostgreSQL; no mandatory external CRM adapter |
| Calendar | One Google Calendar behind `CalendarProvider`, plus a mock |
| Messaging | Web chat and one email service behind `EmailProvider`, plus a mock |
| Deployment | Docker Compose |

One repository, one backend, and a separate worker from the same codebase. PostgreSQL is the source of truth; the queue is not the only place where a scheduled action is stored. Microservices, a separate vector database, and a general-purpose automation builder are not required.

Exact dependency versions are pinned in the lockfile before integration development. Selecting the real LLM and email service is a stage 2 task, not a reason to implement several providers simultaneously.

## 3. Demo company

The company **Acme Home Improvements** and its services are retained: `roofing`, `extensions`, `pool installation`, `concrete works`.

| Setting | Baseline configuration |
|---|---|
| Service area | Configurable list of cities and postal codes; seed data uses explicitly synthetic `Demo City A` and `Demo City B` |
| Working hours | Mon–Fri, 09:00–18:00 in the company's timezone |
| Timezone | Proposed demo value `Etc/UTC`; an IANA identifier is stored, not just a numerical offset |
| Consultation | 30 minutes; a 15-minute buffer before and after the appointment; overlapping buffers are not added together |
| Budget currency | Proposed demo value USD; the currency is explicitly named in the question |
| Budget reference | Proposed test value of USD 10,000 for each service; this is a scoring fixture, not a market price or a promise to the customer |
| Pipeline | New → Contacted → Qualified → Booked → Proposal → Won/Lost |

The administrator replaces the service area, currency, budget references, and timezone with real values before use with real leads. The agent does not present demo values as a commercial offer.

## 4. Roles

| Role | Permissions |
|---|---|
| Sales manager | View CRM and logs, manual replies, Take over, Return to AI, Pause / Resume, field editing, score recalculation, stage changes, appointment cancellation/rescheduling, and contact-conflict resolution |
| Administrator | All of the above; company, question, FAQ, rule, schedule, and follow-up settings; access management; separate restoration of automation consent with a reason |
| Lead | Only their own chat, slots they are eligible for, and their own appointment. Cannot see scores, internal fields, comments, or logs |

A manager's manual send first transfers the conversation to human control. A visitor gains no staff permissions through either the UI or direct API calls.

## 5. Scope

### Mandatory first-version scope

| Included | Implementation boundary |
|---|---|
| Web form, webhook, test-event generator | No advertising account integration or campaign management |
| Web chat and email | Email is used for invitations and two follow-up sequences; inbound emails do not become chat messages |
| Built-in CRM | Contacts, enquiries, deals, notes, timeline, appointments, and tasks |
| Up to 8 qualification question types | One fixed field set; configurable text, order, and required status, without an arbitrary schema builder |
| AI and FAQ | One LLM; a small editable FAQ, without uploading or indexing large document collections |
| Explainable scoring and conversation controls | Rule versioning, manual edits, automatic handoff, pause, opt-out |
| Google Calendar | One calendar; availability, booking, and manager cancellation/rescheduling |
| Two email sequences | Three touches each; working hours, stopping conditions, unsubscribe, and secure return to chat |
| Conversations, Lead Profile, Settings, basic Execution Log | Errors, attempts, and safe retries only |
| Verification, deployment, portfolio | At least 20 AI scenarios, a report, demo mode, documentation, and case-study materials |

### Deferred

GoHighLevel, SMS, additional LLM providers, email conversations, advanced analytics, sequences after Booked / Proposal, and automatic nurture for Nurture / Unqualified.

### Out of scope

Multi-tenancy, voice, bulk outbound and purchased contact lists, kanban, a visual automation builder, migration of another CRM, branch routing, no-show tracking, lead self-service cancellation/rescheduling, and a full integration-management screen. Secrets are supplied through protected deployment configuration; basic integration status may be shown in Settings.

## 6. Screens

### 6.1. Conversations

The main three-column screen is built starting in stage 3.

**Left — conversation list.** Name or contact, channel, stage, owner (`AI`, a manager, or the manager queue), last message and time, commercial category. Separate labels: human attention required, paused, opt-out. Filters: all / needs attention / AI-managed / human-managed / booked / no reply. Sorting by latest event and score.

**Center — message history.** Messages from the lead, AI, and manager, and timestamped system events. Buttons: **Take over**, **Return to AI**, **Pause automation**, **Resume automation**, **Open lead**. Before a manual send, control transfers atomically to a human. An unsent AI draft does not appear in the chat afterward.

**Right — structured data.** `service_type`, `location`, `budget_min` / `budget_max`, `timeline`, `decision_maker`, `preferred_contact`; unknown values are shown as unknown, not negative. Each value shows its source, timestamp, and manual-lock status. The score block shows the number, category, preliminary/completed status, each factor's contribution, rule version, and a separate human-review reason. Below are the appointment, timezone, next action, and measured first-contact time.

Simultaneous visibility of the conversation and extracted fields is a mandatory screen property.

### 6.2. Lead Profile

Header: name, phone, email, source, first-enquiry date, stage, and owner.

Tabs:

- **Data:** qualification fields, manual editing, source with a link to the message, and value locking/unlocking.
- **Score:** score with reasons, rule version, recalculation history; an explicit command to recalculate using the current version.
- **Timeline:** intake, `re_engaged`, messages, data and stage changes, handoff, follow-up, appointments, and errors; events include `correlation_id`.
- **Appointments:** time, status, external identifier, link to the event; manager cancellation and rescheduling.

Actions: assign an owner, change stage, handle a contact conflict, stop or resume automation. Lost requires a reason. Clearing opt-out is a separate administrator action with confirmation of consent; it is not combined with Resume.

### 6.3. Execution Log

Included in the first version in compact form. Processes: intake, conversation turn, initial email, booking, cancellation, reschedule, follow-up. Table columns: lead, state, attempts, duration, error, `correlation_id`.

Expanding a row shows safely redacted inputs, the result, and a diagnostic message. Secrets, link tokens, and unmasked contacts are not displayed. Actions: open lead, hand off for manual handling, retry an allowed operation. For an uncertain result, reconciliation is available first, not a blind repeat send.

### 6.4. Settings

Compact settings for company and brand voice, FAQ, questions and required fields, scoring versions, working hours, timezone, and two follow-up sequences. Changes are logged. When the schedule changes, pending sends and bookings use current restrictions; already confirmed appointments are not rescheduled automatically.

## 7. Functional requirements

### 7.1. Lead intake and first contact

`POST /leads/intake` accepts an incoming enquiry. It requires `source`, a stable event key, and at least one valid contact channel: email or phone. For the built-in form, the server also creates a protected visitor session and opens the chat. Phone numbers are normalized to E.164 with an explicitly specified country; ambiguous numbers are not corrected by guessing. Email normalization must not merge distinct addresses by removing dots or `+suffix`.

Each authorized event receives a `correlation_id` and `idempotency_key`. An invalid event is stored in `IntakeEvent` with `rejected` status and a reason, without creating a contact or deal. Unauthorized requests are rejected at the API boundary and logged without storing arbitrary raw payloads.

| Input | First contact | Exceptions |
|---|---|---|
| Form with a protected session | The agent's first substantive message in the open chat | AI is not enabled automatically when opt-out, pause, or human ownership applies |
| Webhook without a session, with email | One invitation email with a safe link to chat | Send only for an accepted incoming enquiry, not an imported cold list; respect opt-out and ownership |
| Webhook without a session, phone only | `needs_human_review = true`, reason `no_automated_channel`, manager queue | No automatic SMS or call; the absence of a message is not counted as a successful automatic response |
| Repeat enquiry within an existing process | A `re_engaged` event; routing depends on current state | A new webhook does not clear opt-out, pause, or human control |

The form can accept a phone number without email and continue qualification in chat. Email follow-up and automatic booking require email; no email tasks are created when it is missing. Before booking, the agent may request email separately.

The first chat message and first email for an incoming enquiry are allowed around the clock. If staff work only during the day, the agent states this during handoff and does not promise an immediate human response.

**SLA measurement:** from successful persistence of valid intake to persistence and publication of the first substantive chat message; for email intake, until the email provider confirms acceptance. A provider API response is not proof of inbox delivery. An HTTP response, typing indicator, or empty greeting without a next action does not count.

The target is under 10 seconds for every normal first automated contact in the acceptance run. Channels are measured separately. A blocked automatic response records `not_applicable` with a reason; an error or timeout records an error/SLA breach rather than fabricated success. Artificial failures are tested separately and are not hidden from the report.

### 7.2. Idempotency, contacts, and repeat enquiries

Repeating one event and receiving a new enquiry from a known person are different operations.

- The same source, `idempotency_key`, and payload return the persisted result without new entities or sends. The same key with a different payload returns a conflict rather than changing the previous enquiry.
- Contacts are matched by normalized phone, email, and external id within the specific source's namespace. One consistent match allows reuse of an existing contact. History is not overwritten.
- If identifiers point to different people or the match is ambiguous, intake is stored as `needs_resolution`. Automatic replies, deal creation, and merging are blocked until a manager resolves it. The original event remains available in the CRM/log.
- The default policy is `one_active_per_contact`. A new event for an active enquiry adds `re_engaged` and reuses the existing Lead, Opportunity, and Conversation without resetting their controls or sending limits.
- The `one_active_per_contact_service` setting is supported: different known services may have separate active deals. If the service is unknown and the choice of an existing deal is ambiguous, routing requires a manager.
- An active deal is any stage other than Won/Lost. After closure, a new incoming enquiry creates a new Lead, Opportunity, and Conversation while retaining Contact. A service change that conflicts with active deals does not cause a silent merge.

`IntakeEvent` stores each separate arrival. `Lead` is the canonical commercial enquiry, not necessarily a new row for every webhook. Duplicate prevention is backed by database constraints/transactions, not only a check before insertion.

**Deduplication is not authorization:** knowing a phone/email and matching a contact does not open previous conversations to a new browser. Returning to an existing conversation requires a valid session or a link sent to a previously verified channel for that contact. New contact details from the public form do not replace a trusted channel until the previous channel is confirmed or a manager resolves the change. Without a verified channel, access to old history requires manual approval. Until then, the interface does not expose the existing contact's history.

### 7.3. Conversation and qualification

The agent asks one question per message; an FAQ answer may be accompanied by one next question. It extracts multiple explicitly supplied fields at once and does not ask again for known information. Unknown values are stored as `null`, not zero, `false`, or an assumed value.

**Proposed baseline field table:**

| Field | Representation | Required status and behavior |
|---|---|---|
| `service_type` | Supported service / explicitly different service / `null`; original text is retained | Critical for automatic booking. After two unsuccessful clarifications, hand off. An explicitly unsuitable service is Unqualified, not unknown |
| `location` | City/postal code and derived `location_fit: true / false / null` | Critical for automatic booking. Clarify ambiguity; do not infer an address from timezone or IP |
| `budget_min`, `budget_max` | Range in the company's currency; unknown bounds are `null` | One qualification attribute. Optional by default; after clarifications it remains unknown and contributes 0 budget points |
| `timeline` | Normalized time range + original wording | Optional by default; an unknown timeline receives no urgency points |
| `decision_maker` | `true / false / null` | Optional by default; unknown does not count as a negative answer |
| `preferred_contact` | `chat / email / phone / null` | Optional. A phone preference does not enable the absent SMS channel; a callback request is handed to a manager |
| `email` | Contact field, not a separate scoring factor | Required before automatic booking if still missing. After two unsuccessful clarifications, hand off without booking |

Baseline sequence: service → location → budget → timeline → authority; contact preference is clarified when needed. At most two clarification questions follow the initial question for each field. The counter increments for clarifications actually sent, not for repeated LLM requests. An explicit "I don't know" for an optional field can be accepted without two pointless repeats.

The administrator can change wording, order, brand voice, and whether additional fields are required. Service and location cannot be excluded from booking eligibility checks. If an additional field is required, an unknown value after two clarifications triggers handoff. Qualification is complete when required fields are known and the remaining baseline fields are populated or explicitly marked unknown/skipped; a numerical score alone is insufficient.

The LLM returns a strictly validated JSON schema: field changes, references to source messages, ambiguity indicators, and a proposed handoff reason. Code accepts only allowed fields and values. Code determines the next question, scoring, and external actions.

Lead corrections update values while retaining history. A manager's manual edit locks the field by default: the LLM does not overwrite it but stores the conflicting proposal for review. A material qualification-data conflict triggers handoff; automatic booking is prohibited until it is resolved. A manager can explicitly unlock a field. Changes to significant data invalidate a stale AI reply and a previously offered booking intent, but do not automatically cancel a confirmed appointment.

Answers about the company come from the published FAQ. When there is no verified answer, an ambiguity/low-confidence signal that requires a human, or a prohibited topic, use §7.8. A numerical "model confidence" value is not presented as a measured probability of correctness.

Invalid JSON allows one repair attempt. After another failure or exhaustion of the configured timeout, persist the message and hand off; an infinite repair loop is prohibited. Exact timeouts are fixed in stage 2 configuration and included in the report.

### 7.4. Lead scoring

Code calculates the score using an immutable rule version. Each factor records the actual value, points, maximum contribution, and reason. Unknown values have their own reason even if they receive the same points as a negative answer.

**Proposed demo scoring configuration, maximum total 100:**

| Factor | Points |
|---|---|
| Service fit | Supported service — 25; unsuitable or unknown — 0 |
| Location fit | Confirmed service area — 25; unsuitable or unknown — 0 |
| Budget fit | Known lower bound meets or exceeds the service reference — 25; the range allows a suitable budget but the lower bound does not establish it — 10; known maximum is below the reference or budget is unknown — 0 |
| Urgency | Within 3 months — 15; over 3 and up to 6 months — 10; over 6 months — 5; unknown — 0 |
| Decision authority | Confirmed authority — 10; absent or unknown — 0 |

An exact amount is stored as a range with equal bounds. The model does not convert a budget in another currency: clarification is required. An invalid range is not used for scoring. For a timeline range spanning several categories, use the lowest applicable contribution; ambiguous wording is clarified first.

| Category | Rule | Subsequent behavior |
|---|---|---|
| Unqualified | Explicitly unsuitable service **or** location, regardless of total | Automatic booking prohibited; a brief, polite closing message and CRM persistence for manual resolution; no automatic nurture |
| Hot | No explicit hard rejection; score ≥ 80 | Offer slots after qualification is complete and other eligibility checks pass |
| Warm | No explicit hard rejection; 60 ≤ score < 80 | This demo configuration also allows a consultation after all checks pass |
| Nurture | No explicit hard rejection; score < 60 | No automatic booking or email nurture; data remains available for manual follow-through |

During data collection, scoring is preliminary. Commercial category does not replace `needs_human_review`. For example, a Hot lead may require a human; that lead cannot be booked automatically until the reason is resolved.

An unknown budget alone is not a hard rejection: it contributes 0 points, and the lead may become Warm based on other information. This is an explicit proposed business decision for the first version; a stricter policy is enabled by making budget required and changing rules, not by a hidden prompt check.

A new configuration creates a `RulesVersion`; existing enquiries are not recalculated and do not change their pinned version automatically. Subsequent replies from such a lead recalculate the score using its pinned version. Moving to the current version is an explicit manager action with a history of the old and new results. FAQ changes do not alter historical scores.

### 7.5. Built-in CRM

The CRM supports creating/updating Contact, Lead, and Opportunity, changing stage and owner, and saving source, qualification fields, internal notes, and timeline. The workflow and CRM share the same internal PostgreSQL state; mandatory GoHighLevel synchronization is not required.

Stages are not conflated with categories:

| Stage | Automatic transition |
|---|---|
| New | A valid new enquiry has been persisted |
| Contacted | The first chat message has been published or the email provider has accepted the first email; the channel and confirmation method are visible |
| Qualified | Qualification is complete, service/location fit are positive, score ≥ 60 under the pinned version, and no human review remains unresolved |
| Booked | The calendar appointment's existence is confirmed and its identifier is persisted |
| Proposal, Won, Lost | Manual manager action; Lost requires a reason |

The Qualified stage does not guarantee technical booking eligibility: email, opt-out, controls, and availability are checked separately. A confirmed appointment does not disappear when fields change; such a conflict goes to a manager. Transitions, including manual departures from the sequence, are logged.

If the database is unavailable, the system does not report successful persistence of a message or lead. It returns a retryable error, the UI retains unsent input, and the retry uses the same key. "The conversation continues while the external CRM is unavailable" does not apply to v1.1: no external CRM is in scope.

### 7.6. Calendar and booking

Automatic booking is allowed only when all of the following hold:

1. Qualification is complete, the category is Hot or Warm, service fit and location fit are confirmed, and all configured required fields are known.
2. A valid email exists; the conversation belongs to AI, is not paused, and has no opt-out or unresolved human-review reason.
3. The deal is neither closed nor in a manual post-sales stage; it has no active appointment or incomplete booking operation.
4. Real calendar slots have been retrieved and the lead has made an explicit selection tied to a valid time offer.

Code repeats all checks before the external action. Score does not override hard rejection. When the current service area/service list changes, an incompatible old time offer is invalidated and the lead requires review; the historical score is not silently rewritten.

Free intervals account for the company timezone, schedule, calendar availability, duration, and buffer. The entire appointment fits within a working interval; the buffer applies to neighboring events. The proposed search window is 14 days. Show the nearest 3–5 slots; if 1–2 are found, show those available; if none are found, hand off with `no_available_slots`. These limits are configurable.

Time is stored in UTC; the visitor explicitly sees the timezone being used. The browser timezone may be a suggestion, but not a silent replacement. Daylight saving transitions and ambiguous local times are covered by tests.

Operation sequence: check eligibility → show slots → receive selection → create a durable booking intent with a key → block conflicting application operations → recheck availability → create event → persist `external_event_id` and result → move to Booked → confirm booking and prepare a manager summary.

A unique operation key, persisted mapping to the external event, and result reconciliation are mandatory. After a timeout when an event may have been created, the state is `unknown`, not "not created." The system first searches for the previous operation's result using the selected adapter's capabilities; if unambiguous reconciliation is impossible, it hands off to a manager and does not blindly create a second event. The specific Google Calendar mechanism is implemented and verified in stage 6.

The application lock protects against its own concurrent requests, but not simultaneous external manual bookings in the calendar. Use a dedicated calendar; rechecking is mandatory. A detected external conflict requires manual handling. Absolute atomicity between the application and independent calendar editors is not promised.

In v1.1, separate calendar email reminders to the lead that are not controlled by the application's shared policy are disabled; booking confirmation appears in chat.

Cancellation and rescheduling are performed by a manager with a separate operation key and result verification. During rescheduling, the old booking remains valid until the change is confirmed; a successful action updates the existing appointment rather than creating an unexplained duplicate. On cancellation, Booked returns to Qualified or Contacted according to current state; follow-up does not resume automatically. Manual booking is not used to bypass restrictions: automatic booking is unavailable for an unsuitable lead, and a separate override is outside v1.1.

### 7.7. Email follow-up

Email provides invitations/reminders and a return path to web chat, not an additional conversation channel. Templates contain no invented prices, timelines, or appointment facts. Replies go to the configured company address; automatic parsing of these replies is out of scope.

| Sequence | Start condition | Proposed delays from the start of waiting |
|---|---|---|
| `qualification_abandoned` | The provider accepted the first invitation or a question was sent; qualification is incomplete and the lead is silent | 1 hour, 24 hours, 72 hours |
| `qualified_not_booked` | The lead is eligible for booking and received available slots, but has not selected a time and has no appointment | 24 hours, 72 hours, 7 days |

These are new demo values, not a schedule from the original specification. At most three provider-accepted touches per sequence per Lead; the first invitation email does not count toward these three touches. A reply cancels the current run. A new waiting period may use the remaining allowance but does not reset the number of emails already sent. The two sequences are not active simultaneously; a new Lead after a closed deal has its own allowance but inherits the contact's opt-out.

The pinned sequence version contains templates and delays. New settings apply to new runs without adding touches to an already running sequence. Working hours and restrictions are always checked against current state.

Before every send, the worker rereads from the database: email, replies since waiting began, qualification completion, booking/booking-in-progress, stage, owner, human review, pause, opt-out, touch limit, and working hours. If conditions no longer hold, cancel the task with a reason. No follow-up is sent after Booked, Proposal, Won, Lost, handoff, STOP, or a manual stop.

If the scheduled time falls outside working hours, sending is deferred to the next permitted time. Late tasks are not sent as a batch: missed touches are marked `skipped`, and only the current touch is eligible for sending. Calendar operation and manager working hours do not restrict AI replies to incoming messages.

The email contains a secure return link (§12) and a separate unsubscribe link. Stale slot options are not booked from email: the link returns the visitor to chat for a current selection. An unknown send result is first reconciled using the persisted operation and provider capabilities; if no safe mechanism exists, use manual handling without a blind retry.

Nurture and Unqualified have no automated email sequences. This explicitly excludes the original requirement to send Unqualified leads into nurture. The manager sees the category and decides the next action in the CRM.

### 7.8. Manager handoff and controls

Automatic triggers: an explicit request for a human/call, negative responses or insults, a question outside the FAQ, a prohibited topic, unresolved ambiguity/low confidence, two unsuccessful clarifications of a required field, a repeated LLM error, no automated channel, or an unrecoverable integration error. Exhausting clarifications for an unknown optional field does not, by itself, trigger handoff.

Handoff atomically sets `needs_human_review`, stores the reason code/explanation, changes ownership to HUMAN, and cancels pending AI sends and follow-up. If no manager is assigned, the enquiry enters the shared "needs attention" queue; this is a sufficient notification channel for v1.1, and no separate Slack/email alert is required.

The handoff card contains a summary, recent messages/a link to the full conversation, all fields, score with reasons and version, and the handoff reason and time. Handoff does not wait for a successful LLM summary: on failure, deterministic context from persisted data is used. The visitor sees a system handoff status; AI does not continue qualification after ownership changes.

| Action | Effect | Does not do |
|---|---|---|
| Take over / manual reply | HUMAN, cancellation of pending automated actions | Does not clear opt-out |
| Automatic handoff | HUMAN + `needs_human_review = true` + reason + context | Does not return to AI on the lead's next message |
| Return to AI | The manager explicitly resolves the review reason and transfers ownership to AI; the decision is logged | Does not clear pause or opt-out |
| Pause automation | `paused = true`, stops pending automated actions | Does not change owner or consent |
| Resume automation | `paused = false`; conditions for subsequent actions are checked again | Does not change HUMAN to AI, clear review/opt-out, or blindly revive old tasks |
| STOP / unsubscribe | Contact-wide opt-out, cancellation of unsent automated messages across all its enquiries | Does not cancel an existing appointment or delete history |
| Restore automation consent | The administrator separately records the reason and confirmation of new consent, then clears opt-out | Does not automatically enable AI or sending, or reset owner/pause |

STOP and configured equivalents are processed before calling the LLM and without waiting for lengthy generation. An incidental substring match is not a command: recognize a standalone command or explicit refusal of further contact. An ordinary new reply or webhook is not treated as renewed consent. Manual messaging must not be used to bypass an explicit refusal of contact.

### 7.9. Processing order and recovery

Messages within a conversation are processed sequentially. Persisting a new message or changing owner, pause, opt-out, or significant fields increments the state revision. Before publishing an AI reply and before an external action, revision and permissions are checked; stale drafts are discarded, and unprocessed messages remain for the next valid turn.

Persisting the result and the intent to perform background actions is atomic in PostgreSQL. After restart, the worker restores pending actions from persisted state; losing Redis does not mean losing the only copy of a follow-up or booking intent. Task redelivery is allowed; a repeated business effect is not.

Stopping guarantee: after STOP, pause, or human ownership is committed, no new automatic send call starts. An external request started before the prohibition was committed may finish later; an email accepted by a provider cannot be guaranteed to be revoked. Such a race is visible in the log rather than hidden behind a promise of absolute immediate revocation. Reconciling an already started operation is allowed; creating a new one is not.

Retry is permitted only with a persisted key, current permissions, and a safe/established result of the previous attempt. `unknown` requires reconciliation; repeating an API request is not, by itself, an exactly-once mechanism.

## 8. Data model

The following is a logical model, not mandatory verbatim DDL. Names and types are refined in migrations without losing the specified properties. Multi-tenancy is not implemented; `company_id` denotes the single configured company.

```text
StaffUser
  id, role, authentication_data, active

CompanySettings
  id, company_name, timezone, working_hours, services, service_area
  booking_duration, booking_buffer, booking_horizon, currency
  brand_voice, faq, question_config, deduplication_policy

IntakeEvent
  id, source, source_external_id, idempotency_key, payload_hash
  correlation_id, sanitized_payload, status, rejection_reason
  contact_id?, lead_id?, received_at, processed_at

Contact
  id, name, email, phone_e164, source_identities, verified_contact_channels
  opt_out, opt_out_at, opt_out_source, consent_restoration_reference
  created_at, updated_at

Lead
  id, contact_id, opportunity_id, source, first_intake_id
  service_type, location, location_fit, budget_min, budget_max
  timeline, decision_maker, preferred_contact
  qualification_status, field_states, clarification_counts
  score, score_category, score_reasons, rules_version_id
  needs_human_review, review_reason, next_action
  first_contact_channel, first_contact_at, first_contact_latency_ms
  first_contact_status, state_revision, created_at, updated_at

Opportunity
  id, lead_id, contact_id, service_key?, stage, assigned_manager_id?
  lost_reason?, created_at, updated_at

Conversation
  id, lead_id, channel=web_chat, owner_type=AI|HUMAN, owner_id?
  paused, state_revision, last_lead_message_at, last_message_at

Message
  id, conversation_id, client_message_id?, author_type
  body, extracted_fields_json, reply_to_revision?, created_at, published_at?

FieldRevision
  id, lead_id, field_name, old_value, new_value
  source_message_id?, actor_type, actor_id?, locked, created_at

RulesVersion / ScoreEvaluation
  immutable rules content, version, content_hash, active_from
  evaluation: lead_id, rules_version_id, inputs_snapshot, score, reasons, created_at

Appointment / IntegrationOperation
  appointment: id, lead_id, external_event_id?, start_at, end_at, timezone, status
  operation: id, entity_id, type, idempotency_key, input_hash
  external_reference?, state, attempts, last_error, started_at, finished_at?

FollowUpSequenceVersion / FollowUpTask
  sequence: id, type, version, steps, content_hash
  task: id, lead_id, sequence_version_id, run_id, step_index, channel=email
  waiting_started_at, scheduled_at, sent_at?, state, stop_reason?, operation_id?

VisitorSession / AccessToken
  id, conversation_id, contact_id, token_hash, purpose, expires_at, revoked_at?

HandoffEvent / LeadNote
  handoff: lead_id, reason_code, reason_text, summary, context_refs, created_at
  note: lead_id, staff_user_id, body, created_at

WorkflowRun / PendingAction
  id, type, entity_id, state, attempts, correlation_id, idempotency_key?
  operation_id?, error_code?, scheduled_at?, started_at?, finished_at?

AuditEvent
  event_id, correlation_id, actor_type, actor_id, action
  object_type, object_id, result, created_at
```

Optional references allow rejected/conflicting intake to be stored before creating a lead. Opt-out has a single source of truth in Contact; its display on Lead is not an independent flag. Conversation owns automation; the deal's assigned manager does not replace this property.

Mandatory constraints: uniqueness of the intake key within a source; protection of active deals according to the selected policy; uniqueness of a client message within a conversation, an external operation key, an external event id, and a follow-up step within a run. Blocking overlapping bookings checks the entire interval with its buffer, not just matching start times.

## 9. API

Staff and public access are separated. The names below define the required contract; business checks run regardless of the calling route.

```text
POST   /auth/login                         staff login
POST   /auth/logout                        end session

POST   /leads/intake                       webhook with source authorization
GET    /leads                              list and filters
GET    /leads/{id}                         data, score, history
PATCH  /leads/{id}                         manual fields and value locking
POST   /leads/{id}/handoff                 manual handoff/assignment
POST   /leads/{id}/return-to-ai            explicit return and review resolution
POST   /leads/{id}/pause                   pause
POST   /leads/{id}/resume                  clear pause only
POST   /leads/{id}/recalculate-score       explicit switch to the selected version
POST   /leads/{id}/stage                   stage change
POST   /contacts/{id}/restore-consent      administrator, confirmation, and reason
POST   /intake-events/{id}/resolve         manager conflict resolution

GET    /conversations                      list
GET    /conversations/{id}/messages        history
POST   /conversations/{id}/messages        manual reply with Take over
GET    /availability                       staff viewing
POST   /appointments/{id}/cancel           manager cancellation
POST   /appointments/{id}/reschedule       manager rescheduling
GET    /runs                               log
POST   /runs/{id}/reconcile                reconcile an unknown result
POST   /runs/{id}/retry                    safe retry only
GET/PUT /settings/company                  company and schedule
GET/PUT /settings/questions                questions
GET/PUT /settings/faq                      FAQ
GET    /settings/rules                     rule versions
POST   /settings/rules                     publish a new version
GET/PUT /settings/follow-up                 versions of the two sequences

POST   /public/intake                      form; server sets the trusted source
POST   /public/chat/access                 exchange a token for a restricted session
GET    /public/chat                        own history without internal fields
POST   /public/chat/messages               visitor message
GET    /public/chat/availability           offers available to this specific lead
POST   /public/chat/appointments           explicit slot selection, idempotent booking
POST   /public/unsubscribe                 unsubscribe using a separate scoped token
POST   /public/chat/request-access         rate-limited request for a new link
```

The public client does not set trusted `contact_id`, `lead_id`, owner, score, or permissions. These are derived from a verified session/time offer. Slot selection submits a server offer identifier, not arbitrary calendar data. GET requests through links do not create appointments, consume single-use access, or return control to AI.

Invalid payload, key conflict, lack of permission, stale slot, unknown external result, and temporary unavailability have distinguishable error codes. Repeatable commands receive an operation key; the API does not report final success for `unknown`.

## 10. Business rules and states

| Rule | Requirement |
|---|---|
| First contact | Under 10 seconds in a normal scenario; separate metrics for chat and email acceptance, with an explicit reason when no automatic reply is sent |
| One question | One qualification question per message; multiple supplied fields are extracted immediately |
| Do not invent | Unknown data remains `null`; facts, negative answers, and unknown values are distinct |
| Critical fields | Service/location are required for eligibility; an unknown required field after two clarifications → handoff |
| Score | Calculated by code; reasons and version are visible; preliminary scoring does not permit booking |
| Hard rejection | An explicitly unsuitable service/location prohibits automatic booking at any score |
| Owner | HUMAN prohibits AI replies and follow-up until an explicit Return to AI |
| Pause | Blocks automation independently of owner; Resume clears pause only |
| Opt-out | Prohibits automated messages across all of a contact's enquiries; cleared separately with a reason |
| Working hours | Only proactive follow-up is restricted to working hours; chat and the first email for an incoming request are available 24/7 |
| Duplicates | Repeated intake, messages, tasks, or external operations do not create repeated business effects |
| Booking | Real slot, explicit selection, recheck, confirmed external result; only then Booked |
| Stopping | No new automatic sends start after a prohibition is committed; already started external requests are reconciled |
| Manual data | Manager corrections are not silently overwritten; conflicts are stored for review |
| Uncertain result | Reconcile first, then decide; no blind repeat send |

Automatic-action eligibility order: **authorization → opt-out → HUMAN / pause / human review → closed or manual stage → current operation and revision → action-specific conditions → working hours for follow-up**. The lead's message is persisted and shown to the manager even when an automatic reply is prohibited.

`qualification_status` reflects collecting/complete; category reflects commercial assessment; stage reflects deal progression; owner reflects conversation control. None of these fields replaces the others. After qualification is complete, a new clarification/correction may require collecting or review again; Booked is not overwritten without handling the appointment.

## 11. Negative scenarios

| Situation | Expected behavior |
|---|---|
| Invalid intake | `rejected` with a reason; no lost event or partially created deal |
| Same key, different payload | Conflict; previous result is not overwritten |
| Phone only, no chat | Manager queue; no fabricated SMS send or false successful SLA |
| Phone and email belong to different contacts | Manual resolution; no automatic merge or exposure of someone else's history |
| Known contact enquires again | `re_engaged` or a new enquiry after closure; controls and opt-out are not reset |
| Unknown optional field | `null`, a separate reason, and continuation after allowed clarifications |
| Unknown required field | Handoff after two clarifications, without booking |
| Negative response, prohibited topic, request for a human, question outside the FAQ | Handoff with context, without further AI qualification |
| Invalid JSON / LLM unavailable | Bounded repair/retry policy, then handoff; the original message is persisted |
| Manager takes over during generation | Stale AI reply is not published |
| Lead replies after handoff | A human sees the message; AI does not reclaim ownership |
| STOP with pending follow-up | Tasks are cancelled; the worker rechecks the prohibition before sending |
| Follow-up scheduled at night/on a weekend | Deferred to working hours; no batch of old touches after a pause |
| Slot becomes occupied after display | Old selection is rejected and current alternatives are offered; no false confirmation |
| Timeout after appointment creation / email sending | `unknown`, reconciliation of the previous operation; no blind duplicate creation |
| Cancellation/rescheduling error | Old confirmed status is not replaced with fabricated success; a manual-handling task is visible |
| Restart / Redis unavailable | Accepted data and intents remain in PostgreSQL; execution recovers without repeated effects |
| PostgreSQL unavailable | No persistence confirmation; the client can retry with the same key |
| Another visitor's ID, expired link, repeated token exchange | Access denied without exposing internal information |
| Prompt injection requesting score changes or booking outside the rules | Text does not grant action permissions; code enforces restrictions |

## 12. Security

- Role-based staff authorization, protected sessions, request rate limits, and CSRF protection for modifying requests. The webhook requires a source secret/signature; the public form does not receive this secret and cannot impersonate an arbitrary source.
- Visitors receive a separate public schema without scores, internal fields, notes, or audit. Ownership is checked on every read and write; hiding a button is insufficient.
- The return link uses a cryptographically random scoped token; only its hash is stored in the database. The proposed lifetime is 24 hours. Exchange for a protected session uses an explicit POST so that email previews do not consume the link. The token is single-use for exchange; the session has its own expiry and revocation. An expired link requires a safe request for a new one; the request checks limits, channel, and opt-out.
- The unsubscribe token has a separate purpose and does not open chat. Unsubscribe requires no staff login. Secrets and access tokens do not appear in logged URLs, analytics, or external Referer headers; the exchange page contains no third-party trackers.
- Persisted integration tokens in the deployed system are encrypted separately from ordinary settings; the encryption key is not stored alongside ciphertext in the database. Local secrets and real `.env` files are not committed. `example.env` contains only variable names and safe examples.
- Phone/email are masked in technical logs. Full conversation text is available only to authorized staff; Execution Log must not become a second unprotected PII archive. The LLM receives only data needed for the current conversation, without integration secrets.
- The application role has no UPDATE/DELETE permission for `AuditEvent`. User messages, webhooks, and FAQ content cannot execute arbitrary tools/SQL/HTTP requests; code and schemas restrict all actions.
- The public demo uses synthetic data, request/spending limits, a dedicated calendar, and an email-recipient allowlist. Visitors cannot access real leads. Reset is a separate service command operating only on the demo database, without affecting production or its audit.

## 13. Evaluation

**Dataset:** at least 20 scenarios in the repository with initial data, response sequences, expected fields/unknown values, category, handoff, and booking outcome. Fixtures use synthetic contacts and a pinned configuration.

Mandatory scenarios: Hot with booking; Warm with booking; unsuitable service; unsuitable location; unknown budget; unknown required location; multiple fields in one reply; data correction; conflict with a manual lock; direct request for a human; negative response; answer within the FAQ; question outside the FAQ; prohibited topic; negative authority; unknown timeline; no repeated questions; STOP; Nurture without booking; missing email before booking. Prompt injection and ambiguous responses are also tested; the dataset may be expanded.

**Command:** `npm run eval`. The main AI run uses the selected real LLM and controlled calendar/email providers to test logic reproducibly without external sends. A separate `npm run eval -- --mock` is allowed for CI but does not replace evaluation of the real model. If the LLM secret is missing, the real run ends with a clear error rather than silently switching to a mock.

**Report:** `/evaluation/last-run.md` and machine-readable results. Persist the date, commit, provider/model, prompt, rule and fixture versions, each adapter's mode, run settings, numerators/denominators, and individual scenario results. Failures are included in the report. A separate live smoke test with real Google Calendar and email is mandatory before release; include evidence and external identifiers without secrets. A mock run does not prove real delivery or integration.

**Proposed thresholds for this revision; fixed before the run and not adjusted to fit results:**

| Metric | Definition | Criterion |
|---|---|---|
| Median and p90 first-contact time | Intake → publication of the first substantive message / provider acceptance of the first email, separately by channel | Report median/p90; every normal acceptance-run first contact < 10 s; list omissions and overruns |
| Qualification completion rate | Share of scenarios with all 5 baseline attributes known: service, location, budget as one attribute, timeline, authority | Report the whole dataset and, separately, scenarios where this information is supplied; the latter group must reach ≥ 90% |
| Field extraction accuracy | Final normalized fields match the reference, including corrections; known and unknown values are also reported separately | ≥ 95%; invented values for reference-unknown fields — 0 |
| Score category match | Post-conversation category matches the expected category | ≥ 95%; unit tests of deterministic scoring itself — 100% |
| Booking rate | Confirmed bookings / qualified scenarios; separately, the subset with explicit selection of a valid slot | Overall rate is descriptive; 100% in the normal slot-selection subset |
| Handoff precision / recall | Precision: correct handoffs / all handoffs; recall: detected mandatory triggers / all mandatory triggers | Precision ≥ 95%; recall for mandatory triggers — 100% |
| False booking | Appointment creation when eligibility is unmet, explicit selection is absent, or automation is prohibited at operation start | 0 |
| Repeated effects and access leaks | Duplicate webhooks/appointments/emails and access to someone else's conversation in the relevant tests | 0 |

This is acceptance of a limited dataset, not a statistical guarantee of quality for arbitrary customers. `Qualification completion rate` with five populated fields is an analytical metric; it does not replace the business rule allowing explicitly unknown optional fields.

Critical violations cannot be offset by an average percentage: false booking, missed STOP/handoff, duplicates, and leaks block release. If a threshold is not met, fix the logic/prompt and perform a new recorded run; retain the failed report in history.

## 14. Acceptance criteria

AC identifiers are used in the implementation plan and tests.

| ID | Verifiable outcome |
|---|---|
| AC-01 | Three identical webhooks produce one Contact, Lead, and Opportunity and one first contact; a changed payload with the same key causes a conflict |
| AC-02 | Invalid intake is persisted as rejected; ambiguous contacts require manual resolution; new enquiries are handled under both policies without resetting opt-out/owner |
| AC-03 | The form opens a protected chat; an email webhook sends an invitation; phone-only intake without chat goes to a human; normal first automatic response < 10 s, measured through the correct channel |
| AC-04 | The agent asks one question at a time, extracts multiple fields, and does not repeat answered questions; a successful scenario collects 5 baseline attributes |
| AC-05 | Unknown remains null; after at most two clarifications, an optional field is skipped and a required field triggers handoff |
| AC-06 | A lead correction updates the field and history; manual locks are protected, and material conflicts are sent for review |
| AC-07 | Score, factors, reasons, and version match the rules; category, review, stage, owner, and pause are independent; a new version does not automatically recalculate old leads |
| AC-08 | An unsuitable service/location prohibits booking at any score; Nurture/Unqualified do not trigger a nonexistent nurture sequence |
| AC-09 | All mandatory handoff triggers create a reason and context; subsequent lead replies remain with a human |
| AC-10 | Take over during generation prevents publication of the old reply; Return to AI, Pause, Resume, and Restore consent have different effects |
| AC-11 | STOP/unsubscribe cancel pending automatic sends across all the contact's enquiries; an ordinary message, new intake, and Resume do not clear the prohibition |
| AC-12 | Fully eligible Hot and Warm leads see real slots with a timezone; 1–2 available slots and no available slots are handled explicitly |
| AC-13 | Explicit selection of a free slot creates a confirmed event, persists its external id, moves to Booked, and provides a manager summary; no appointment is created without email/selection/eligibility |
| AC-14 | Repeated and concurrent application operations do not create duplicates/overlaps; occupied slots are not confirmed; a timeout after creation recovers the previous result or requires a human |
| AC-15 | Manager cancellation/rescheduling reflects confirmed calendar state; an error does not destroy the old booking or start follow-up by itself |
| AC-16 | Both email sequences respect their conditions, three-touch limit, and shared per-Lead counter; the two sequences are not active simultaneously |
| AC-17 | Follow-up does not start outside working hours or after a reply, booking, handoff, pause, or opt-out; the queue does not send a batch of stale touches after downtime; nighttime intake is served |
| AC-18 | Email returns only to the recipient's own chat; an expired/foreign/already exchanged token does not open history; GET preview does not consume access; unsubscribe requires no login |
| AC-19 | Message/task redelivery and worker restart preserve a single business result; pending actions are restored from PostgreSQL |
| AC-20 | LLM, calendar, or email errors do not lose messages/operations; unknown is reconciled before retry; PostgreSQL failure is not disguised as successful persistence |
| AC-21 | Conversations and Lead Profile support the workflow without database/console access; data, reasons, history, appointment, handoff, and next action are visible |
| AC-22 | Settings changes allowed parameters; the log shows attempts and errors; manual retry is unavailable for an unsafe uncertain result |
| AC-23 | Roles, public schemas, and protection of others' history, secrets, and logs are tested; the application does not modify/delete AuditEvent; prompt injection does not bypass business restrictions |
| AC-24 | At least 20 AI scenarios are run with npm run eval, reports and versions are saved, and §13 thresholds are met without hiding errors |
| AC-25 | Live smoke testing confirms a real appointment and email at an allowed address; demo restrictions prevent arbitrary external sends |
| AC-26 | Docker Compose, migrations, seed, README, runbook, evaluation, limitations, published demo, video, and screenshots are delivered; demo reset does not affect real data |

## 15. Implementation stages

Detailed work, dependencies, and checks are described in the [v1.1 plan](Leadloom-Implementation-Plan-v1.1.md). Tests are written alongside features, not started in stage 9.

| Stage | Work | Outcome |
|---|---|---|
| 1 | Finalize v1.1, demo values, states, and the acceptance matrix | One contract instead of conflicting documents |
| 2 | Repository, database, queue, roles, sessions, secrets, and access | The application starts and access boundaries work |
| 3 | Intake, deduplication, built-in CRM, live chat, and first email invitation | Enquiry, history, and first contact work end to end |
| 4 | AI, extraction, questions, FAQ, corrections, and basic handoff triggers | Testable qualification and visible fields |
| 5 | Scoring, independent states, handoff, STOP, and concurrency control | Explainable scores and reliable human control |
| 6 | Real availability and booking, reconciliation, cancellation/rescheduling | Full path to a real appointment |
| 7 | Two email sequences and all stopping conditions | Reliable return of a silent lead to chat |
| 8 | Complete Conversations, Lead Profile, Settings, Execution Log | Daily manager work without the console |
| 9 | Full AC run, AI evaluation, fault tolerance, and live smoke | Measured acceptance and a list of limitations |
| 10 | Deployment, safe demo, and portfolio | Published product and case study |

## 16. Deliverables

- One repository, Docker Compose, migrations, `example.env` without secrets, and seed data: Acme Home Improvements, questions, FAQ, rule version, two sequences, and synthetic leads. Startup, build, test, and demo-reset commands are documented.
- Unit tests for normalization, scoring, transitions, priorities, clarifications, working hours, and handoff/follow-up conditions. Integration tests for intake, deduplication, authorization, concurrent actions, calendar/email, and recovery. E2E: form → chat → qualification → booking → built-in CRM state.
- `/architecture` — components, states, and processing sequence; `/configuration` — environment, fields, scoring, schedule, and limits; `/runbook` — startup, shutdown, diagnostics, unknown reconciliation, safe retry, manual controls, and consent restoration.
- `/evaluation` — fixtures, runnable scenario, current report, and run history; `/known-limitations` — explicit real/mock distinction, excluded integrations, and limitations of email, links, and calendar concurrency.
- A published safe demo; a 60–90-second video; screenshots of Conversations with structured data, a real booking, and Execution Log/evaluation. The case study uses measured run results, does not attribute unproven revenue growth to the product, and does not present mocks as real integrations.

**Main intermediate outcome after stage 6:** a real incoming lead goes through chat, receives explainable qualification, and books into a real calendar. **First-version outcome:** this path is supplemented by manager controls, controlled follow-up, error recovery, and reproducible acceptance.
