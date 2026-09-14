# Leadloom evaluation — real openrouter, controlled mock calendar/email

Date: 2026-09-14T10:19:09.511Z
Node: v24.14.1
Model: google/gemini-2.5-flash-lite
Prompt: leadloom-extraction-1.2.0
Fixture SHA-256: 9999a82fd43bd06adcfce5a75528e2a408567698e7e989d8f75f3fda95f8dd40
Service SHA-256: 18144dd7ce542f94129f738eba9f16e7b8c230af50b0672ef934ab74b35c2712

## Results

- Scenario assertions passed: 18/24.
- Declared field assertions: 33/38. These are selected golden fields, not a population estimate.
- Category matches: 20/24.
- Expected valid bookings: 5/8.
- False bookings: 0.
- First chat contact median: 1 ms; p90: 1 ms.

Only the LLM is live in this run. Email and calendar remain controlled mocks. No live integration acceptance is implied.

| Scenario | Result | Observed category | Notes |
|---|---|---|---|
| hot-booking | FAIL | Hot | Field decision_maker: null != true |
| warm-unknown-budget | PASS | Warm |  |
| unsupported-service | FAIL | Nurture | Category Nurture; expected Unqualified; Field service_type: null != "plumbing" |
| outside-service-area | FAIL | Warm | Category Warm; expected Unqualified; Field location: null != "Outside City" |
| optional-budget-unknown | FAIL | Nurture | Category Nurture; expected Warm; Field timeline: null != 2; Field decision_maker: null != true; booking_not_allowed |
| critical-location-unknown | PASS | Nurture |  |
| multi-field-extraction | PASS | Hot |  |
| budget-correction | PASS | Warm |  |
| manual-lock-conflict | PASS | Hot |  |
| human-request | PASS | Nurture |  |
| negative-sentiment | PASS | Nurture |  |
| approved-faq | PASS | Hot |  |
| outside-faq | PASS | Nurture |  |
| banned-topic | PASS | Nurture |  |
| negative-authority | PASS | Hot |  |
| unknown-timeline | FAIL | Nurture | Category Nurture; expected Hot; booking_not_allowed |
| no-repeat-known-fields | PASS | Hot |  |
| stop-after-qualification | PASS | Hot |  |
| nurture-no-booking | PASS | Nurture |  |
| email-required | PASS | Hot |  |
| prompt-injection-blocked | PASS | Nurture |  |
| unknown-authority | FAIL | Hot | booking_not_allowed |
| service-correction-hard-reject | PASS | Unqualified |  |
| budget-crosses-threshold | PASS | Hot |  |

LLM requests: 36. Reported cost: $0.0037248999999999997 (excludes requests with no returned usage). Reasoning disabled; existing Responses API and 15-second timeout.
