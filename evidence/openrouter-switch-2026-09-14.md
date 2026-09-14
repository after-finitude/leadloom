# Gemini switch and extraction contract corrections

Local Leadloom now selects `google/gemini-2.5-flash-lite` through OpenRouter. The API key was preserved and was not displayed. Calendar and email remain mocks. No VPS configuration, deployment, commit or push was performed.

## Docflow comparison

An allowlisted SSH read of the Docflow server configuration confirmed `dots-studio/dots-3-note-preview:free`, `LLM_REASONING_EFFORT=none`, and `LLM_RESPONSE_FORMAT=json_schema`. Its source adapter uses Chat Completions and temperature 0. Local Docflow `.env` uses mock; it does not represent the deployed model.

OpenRouter's model page announces removal of that free Dots model on September 30, 2026: https://openrouter.ai/dots-studio/dots-3-note-preview:free. Gemini 2.5 Flash Lite is the inexpensive preset in Docflow's configuration guide. Leadloom retained its existing Responses adapter; copying Docflow's transport was not needed for the successful run.

## Changes

- Select Gemini in the ignored local `.env` and show its model ID in the integration guide.
- Set temperature 0 for OpenRouter extraction; optional reasoning remains disabled.
- Version the prompt as `leadloom-extraction-1.2.3`. Explicitly extract all mentioned fields, including services/locations outside business coverage. Distinguish property ownership from CRM staff assignment, unknown answers from missing fields, and qualification replies from FAQ/handoff.
- State the existing product convention for bare budget amounts: both budget bounds equal the stated amount; explicitly one-sided limits retain an unknown opposite bound.
- Reject contradictory output that selects an existing FAQ while also declaring it outside the FAQ. The existing bounded repair loop handles this error. Add a regression test proving repair, without replacing model output with guessed facts.

Business rules, booking gates, fixtures and expected assertions were not changed.

## Verification

All eight provider tests passed. ESLint and Prettier checks passed for the changed source, tests and integration guide.

The final real Gemini run completed at 2026-09-14T10:24:50.398Z with exit code 0:

- 24/24 scenarios passed.
- 38/38 declared field assertions matched.
- 24/24 categories matched.
- 8/8 expected bookings confirmed; zero false bookings.
- 37 LLM requests, zero HTTP errors; reported run cost $0.0056309.

Raw synthetic request context, selected response metadata and outputs are in `openrouter-gemini-evaluation-2026-09-14.json`; the scenario report is in the adjacent Markdown file. The original Gemini baseline (18/24) and intermediate prompt results (21/24, 22/24) were preserved separately. The success is one fixture-based live LLM run, not a production or browser acceptance result. The report's first-contact metric measures the initial application message, not LLM latency.
