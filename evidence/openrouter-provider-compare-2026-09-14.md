# Controlled OpenRouter provider comparison

Date: 2026-09-14. Model: `deepseek/deepseek-v4-flash-0731`.

Four authorized requests used the existing extraction prompt and schema, synthetic input `I need plumbing.`, empty known fields, `current_field: service_type`, `temperature: 0`, disabled reasoning and a 1,600-token output limit. Each request pinned one endpoint using `provider.only`, disabled fallbacks and required parameter support. Chat requests expressed the same messages and schema using the Chat Completions request format. No API key was printed or saved in the evidence.

Expected extraction: `service_type: plumbing`, with no handoff.

| Pinned provider | API | Result | Time |
| --- | --- | --- | --- |
| DeepInfra FP8 | Responses | HTTP 200; empty updates, no handoff; missing service | 2,295 ms |
| DeepInfra FP8 | Chat Completions | HTTP 200; empty updates, no handoff; missing service | 2,056 ms |
| Baidu FP8 | Responses | HTTP 429; no model output | 544 ms |
| Baidu FP8 | Chat Completions | HTTP 200; correct service and evidence, no handoff | 1,735 ms |

All three successful HTTP responses reported zero reasoning tokens. Their combined reported cost was $0.0001020816; no usage was returned for the HTTP 429 request.

This is evidence of different behavior across providers for this input, not a general model-quality verdict. DeepInfra produced the same missing extraction through both APIs, so changing the API alone did not fix that case. Baidu Chat handled the existing prompt correctly. Baidu Responses could not be compared because of HTTP 429. One request per cell cannot establish repeatability, provider-wide quality, or an API implementation bug.

Raw selected response metadata and outputs are in `openrouter-provider-compare-2026-09-14.json`. No application configuration or source was changed for this comparison. A next controlled experiment would run the scenario suite with Baidu pinned and inspect remaining failures before changing the model or accepting the integration.
