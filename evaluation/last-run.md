# Leadloom evaluation — MOCK, not real AI

Date: 2026-09-25T03:54:42.512Z
Node: v24.14.1
Model: deterministic-parser-1.2
Prompt: leadloom-extraction-1.2.3
Fixture SHA-256: 37490d82e44936994ccd455049a8c50ac7406a4b5ce117a9a43a6140b560082b
Service SHA-256: 1135a0668a3013e4e5f3fc5170bca22bed2242b3f111fbbffbd0910904c8f719

## Results

- Scenario assertions passed: 24/24.
- Declared field assertions: 38/38. These are selected golden fields, not a population estimate.
- Category matches: 24/24.
- Expected valid bookings: 8/8.
- False bookings: 0.
- First chat contact median: 0 ms; p90: 1 ms.

The deterministic parser run does not establish real model accuracy, live email delivery, Google Calendar behavior or production SLA.

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
| negative-authority | PASS | Hot |  |
| unknown-timeline | PASS | Hot |  |
| no-repeat-known-fields | PASS | Hot |  |
| stop-after-qualification | PASS | Hot |  |
| nurture-no-booking | PASS | Nurture |  |
| email-required | PASS | Hot |  |
| prompt-injection-blocked | PASS | Nurture |  |
| unknown-authority | PASS | Hot |  |
| service-correction-hard-reject | PASS | Unqualified |  |
| budget-crosses-threshold | PASS | Hot |  |
