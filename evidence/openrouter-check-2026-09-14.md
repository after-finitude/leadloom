# OpenRouter check — 2026-09-14

Model: `deepseek/deepseek-v4-flash-0731`. Real LLM requests; in-memory evaluation databases and mock calendar/email. The initial diagnosis did not change source or environment configuration. The subsequent authorized change and rerun are recorded below. The API key was not printed.

## Full evaluation with current configuration

`npm run eval` completed with exit code 1: 6/24 scenarios passed, 13/38 declared field assertions correct, 8/24 category matches, 1/8 expected bookings confirmed, and zero false bookings. Details are in `evaluation/last-run.json` and `evaluation/last-run.md`.

An initial sandboxed attempt failed to resolve OpenRouter (`ENOTFOUND`); that run is not evidence of model quality. The complete evaluation above was repeated with network access.

## Focused diagnosis

The synthetic `hot-booking` message was sent through the existing ResponsesLLM adapter. Only response status, token usage, timing and synthetic extraction results were inspected.

- With the configured 15-second timeout: HTTP 200 headers arrived, but reading the complete response raised TimeoutError after 15,006 ms.
- With a temporary 60-second timeout: both adapter attempts returned `incomplete` with reason `max_output_tokens`. Each used all 1,600 output tokens for reasoning. The first completed after 43,988 ms; both attempts finished after 88,029 ms. The adapter raised `llm_incomplete`. Reported costs were $0.00011613 and $0.000119839 respectively.
- With `reasoning: { effort: 'none' }` injected into one diagnostic request and the original 15-second timeout: the response completed and passed the existing extraction validator in 6,106 ms. It correctly extracted service, location, both budget bounds, timeline and decision-maker status. Usage: 511 input tokens, 185 output tokens, zero reasoning tokens; reported cost $0.000017187.

The public model catalog reported `default_enabled: true`, `default_effort: high`, and `mandatory: false` for reasoning. OpenRouter documents reasoning controls at https://openrouter.ai/docs/guides/best-practices/reasoning-tokens.

The focused success does not establish full-suite accuracy. Increasing the timeout alone did not resolve the token-budget failure. Total evaluation cost was not collected; the diagnostic costs above are not a total.

## Rerun after disabling reasoning

OpenRouter extraction now sends `reasoning: { effort: 'none' }`, including the repair attempt. OpenAI requests are unchanged. The existing provider test asserts both behaviors. All seven provider tests passed; ESLint and Prettier checks passed for the changed source, test and integration documentation.

The full real evaluation finished at 2026-09-14T08:49:45.391Z with exit code 1:

| Metric | Before | After |
| --- | --- | --- |
| Scenarios passed | 6/24 | 6/24 |
| Declared field assertions | 13/38 | 20/38 |
| Category matches | 8/24 | 12/24 |
| Expected bookings confirmed | 1/8 | 3/8 |
| False bookings | 0 | 0 |

These are single, stochastic runs; the differences do not establish a reliable improvement. The current detailed report is `evaluation/last-run.md`; earlier runs are preserved in `evaluation/history/`.

A focused replay of the failing message `I need plumbing.` completed in 5,207 ms with HTTP 200, zero reasoning tokens and schema-valid JSON. However, the model extracted `service_type: unknown` and returned `handoff: negative_sentiment`, despite the message merely requesting plumbing. This confirms a semantic failure remains independently of reasoning truncation. The request used 489 input and 76 output tokens at a reported cost of $0.0000315.

Disabling reasoning alone is insufficient for this model/provider setup. The run also failed human-request, banned-topic and prompt-injection handoff assertions. Further work should compare a controlled provider/model and examine these failures before accepting the AI demo. No commit, push or deployment was performed.
