# Leadloom evaluation — real openrouter, controlled mock calendar/email

Date: 2026-09-14T10:21:21.564Z
Node: v24.14.1
Model: google/gemini-2.5-flash-lite
Prompt: leadloom-extraction-1.2.1
Fixture SHA-256: 9999a82fd43bd06adcfce5a75528e2a408567698e7e989d8f75f3fda95f8dd40
Service SHA-256: 18144dd7ce542f94129f738eba9f16e7b8c230af50b0672ef934ab74b35c2712

## Results

- Scenario assertions passed: 21/24.
- Declared field assertions: 37/38. These are selected golden fields, not a population estimate.
- Category matches: 22/24.
- Expected valid bookings: 8/8.
- False bookings: 0.
- First chat contact median: 1 ms; p90: 2 ms.

Only the LLM is live in this run. Email and calendar remain controlled mocks. No live integration acceptance is implied.

| Scenario | Result | Observed category | Notes |
|---|---|---|---|
| hot-booking | PASS | Hot |  |
| warm-unknown-budget | PASS | Warm |  |
| unsupported-service | PASS | Unqualified |  |
| outside-service-area | PASS | Unqualified |  |
| optional-budget-unknown | PASS | Warm |  |
| critical-location-unknown | PASS | Nurture |  |
| multi-field-extraction | PASS | Hot |  |
| budget-correction | PASS | Warm |  |
| manual-lock-conflict | PASS | Hot |  |
| human-request | PASS | Nurture |  |
| negative-sentiment | PASS | Nurture |  |
| approved-faq | PASS | Hot |  |
| outside-faq | PASS | Nurture |  |
| banned-topic | PASS | Nurture |  |
| negative-authority | FAIL | Warm | Category Warm; expected Hot |
| unknown-timeline | PASS | Hot |  |
| no-repeat-known-fields | PASS | Hot |  |
| stop-after-qualification | PASS | Hot |  |
| nurture-no-booking | FAIL | Nurture | Field budget_min: null != 5000 |
| email-required | PASS | Hot |  |
| prompt-injection-blocked | PASS | Nurture |  |
| unknown-authority | FAIL | Warm | Category Warm; expected Hot |
| service-correction-hard-reject | PASS | Unqualified |  |
| budget-crosses-threshold | PASS | Hot |  |

LLM requests: 37. Reported cost: $0.0049775 (excludes requests with no returned usage). Reasoning disabled; existing Responses API and 15-second timeout.
