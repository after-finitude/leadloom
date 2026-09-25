# Leadloom evaluation — real openrouter, controlled mock calendar/email

Date: 2026-09-25T05:21:57.756Z
Node: v24.14.1
Model: google/gemini-2.5-flash-lite
Prompt: leadloom-extraction-1.2.3
Fixture SHA-256: 7b6975d1895643127df674c7b37df34bcb7c35ca0d82fa4e1b9cbc85063ab84f
Service SHA-256: bdc610096442eb8bed3c52260b2a5853293648cf797a52906e298272570a4f12

## Results

- Scenario assertions passed: 25/25.
- Declared field assertions: 38/38. These are selected golden fields, not a population estimate.
- Category matches: 25/25.
- Expected valid bookings: 8/8.
- False bookings: 0.
- First chat contact median: 1 ms; p90: 1 ms.

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
| legal-product-not-banned | PASS | Unqualified |  |
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
