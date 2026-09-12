# Leadloom evaluation — MOCK, not real AI

Date: 2026-09-10T05:13:06.643Z
Node: v22.16.0
Model: deterministic-parser-1.2
Prompt: leadloom-extraction-1.2.0
Fixture SHA-256: 9999a82fd43bd06adcfce5a75528e2a408567698e7e989d8f75f3fda95f8dd40
Service SHA-256: ff36bc322c603ae9e5259abf28774e6ba3f0da5196cfa867bb3ca48b0bc7d74a

## Results

- Scenario assertions passed: 24/24.
- Declared field assertions: 38/38. These are selected golden fields, not a population estimate.
- Category matches: 24/24.
- Expected valid bookings: 8/8.
- False bookings: 0.
- First chat contact median: 2 ms; p90: 2 ms.

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
