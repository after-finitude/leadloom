import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Store } from '../src/db.mjs';
import { Leadloom } from '../src/service.mjs';
import { config, readEnv } from '../src/config.mjs';
import { id, hash } from '../src/util.mjs';
import { PROMPT_VERSION } from '../src/providers/llm.mjs';
readEnv();
const mock = process.argv.includes('--mock');
// Routine checks must not replace the tracked report of the last deliberate run.
const save = !process.argv.includes('--no-save');
const llmProvider = mock
  ? 'mock'
  : !process.env.LLM_PROVIDER || process.env.LLM_PROVIDER === 'mock'
    ? 'openai'
    : process.env.LLM_PROVIDER;
const evaluationConfig = config({
  mode: 'test',
  dbPath: ':memory:',
  llmProvider,
  calendarProvider: 'mock',
  emailProvider: 'mock'
});
const fixtures = JSON.parse(readFileSync(new URL('./scenarios.json', import.meta.url), 'utf8')),
  results = [];
for (const scenario of fixtures) {
  const started = performance.now(),
    s = new Store(':memory:');
  const app = new Leadloom(s, evaluationConfig);
  app.init();
  const expected = scenario.fields || {},
    failures = [];
  let lid,
    actual = {},
    booked = false,
    falseBooking = false;
  try {
    const intake = app.intake(
      {
        name: `Eval ${scenario.id}`,
        event_key: id(),
        email: `${scenario.id}@example.test`,
        ...scenario.intake
      },
      { web: true }
    );
    lid = intake.leadId;
    for (let i = 0; i < scenario.turns.length; i++) {
      if (scenario.manualBefore === i)
        app.editFields(
          lid,
          { fields: scenario.manualFields, locked: true },
          s.get("SELECT id,role FROM users WHERE role='admin'")
        );
      app.postMessage(lid, scenario.turns[i], id());
      await app.tick();
    }
    actual = app.lead(lid);
    if (actual.category !== scenario.category)
      failures.push(`Category ${actual.category}; expected ${scenario.category}`);
    if (scenario.handoff !== undefined && !!actual.review_reason !== scenario.handoff)
      failures.push(`Handoff ${!!actual.review_reason}; expected ${scenario.handoff}`);
    if (scenario.stopped !== undefined && !!actual.opt_out !== scenario.stopped)
      failures.push('STOP expectation differs');
    for (const [key, value] of Object.entries(expected))
      if (JSON.stringify(actual.fields[key] ?? null) !== JSON.stringify(value))
        failures.push(
          `Field ${key}: ${JSON.stringify(actual.fields[key] ?? null)} != ${JSON.stringify(value)}`
        );
    if (scenario.maxQuestions !== undefined) {
      const questions = app
        .publicState(lid)
        .messages.filter((m) => m.author === 'AI' && m.body.includes('?')).length;
      if (questions > scenario.maxQuestions) failures.push('Repeated a known question');
    }
    if (scenario.book === true) {
      const slots = await app.availability(lid);
      if (!slots.slots.length) throw new Error('No slots for expected booking');
      const operation = app.book(lid, slots.slots[0].id, id());
      await app.tick();
      booked = app.operationStatus(operation.id).state === 'confirmed';
      if (!booked) failures.push('Expected booking not confirmed');
    }
    if (scenario.book === false) {
      try {
        const slots = await app.availability(lid);
        if (slots.slots.length) {
          const op = app.book(lid, slots.slots[0].id, id());
          await app.tick();
          falseBooking = app.operationStatus(op.id).state === 'confirmed';
        }
      } catch {
        /* Invalid leads are expected to fail the gate. */
      }
      if (falseBooking) failures.push('FALSE BOOKING');
    }
  } catch (error) {
    failures.push(error.code || error.message);
  }
  const fieldTotal = Object.keys(expected).length,
    fieldCorrect = Object.entries(expected).filter(
      ([k, v]) => JSON.stringify(actual.fields?.[k] ?? null) === JSON.stringify(v)
    ).length;
  results.push({
    id: scenario.id,
    passed: failures.length === 0,
    failures,
    category: actual.category || null,
    expectedCategory: scenario.category,
    fields: actual.fields || {},
    fieldTotal,
    fieldCorrect,
    expectedHandoff: scenario.handoff ?? null,
    handoff: !!actual.review_reason,
    booked,
    expectedBooking: scenario.book ?? null,
    falseBooking,
    firstContactMs: actual.first_contact_ms ?? null,
    elapsedMs: Math.round(performance.now() - started)
  });
  s.close();
  console.log(
    `${failures.length ? 'FAIL' : 'PASS'} ${scenario.id}${failures.length ? ' — ' + failures.join('; ') : ''}`
  );
}
mkdirSync('evaluation', { recursive: true });
const sum = (key) => results.reduce((n, r) => n + (r[key] || 0), 0),
  passed = results.filter((r) => r.passed).length,
  categoryCorrect = results.filter((r) => r.category === r.expectedCategory).length,
  expectedBookings = results.filter((r) => r.expectedBooking === true),
  times = results
    .map((r) => r.firstContactMs)
    .filter((x) => x != null)
    .sort((a, b) => a - b);
const metadata = {
  date: new Date().toISOString(),
  node: process.version,
  provider: llmProvider,
  model: mock ? 'deterministic-parser-1.2' : evaluationConfig.llmModel,
  prompt: PROMPT_VERSION,
  calendar: 'mock',
  email: 'mock',
  fixtureHash: hash(JSON.stringify(fixtures)),
  runtimeSourceHash: hash(readFileSync(new URL('../src/service.mjs', import.meta.url), 'utf8')),
  limits: { fieldAccuracy: 0.95, categoryMatch: 0.95, falseBooking: 0 },
  results
};
const report = `# Leadloom evaluation — ${mock ? 'MOCK, not real AI' : `real ${metadata.provider}, controlled mock calendar/email`}\n\nDate: ${metadata.date}\nNode: ${metadata.node}\nModel: ${metadata.model}\nPrompt: ${metadata.prompt}\nFixture SHA-256: ${metadata.fixtureHash}\nService SHA-256: ${metadata.runtimeSourceHash}\n\n## Results\n\n- Scenario assertions passed: ${passed}/${results.length}.\n- Declared field assertions: ${sum('fieldCorrect')}/${sum('fieldTotal')}. These are selected golden fields, not a population estimate.\n- Category matches: ${categoryCorrect}/${results.length}.\n- Expected valid bookings: ${expectedBookings.filter((r) => r.booked).length}/${expectedBookings.length}.\n- False bookings: ${results.filter((r) => r.falseBooking).length}.\n- First chat contact median: ${times[Math.floor(times.length / 2)] ?? 'N/A'} ms; p90: ${times[Math.ceil(times.length * 0.9) - 1] ?? 'N/A'} ms.\n\n${mock ? 'The deterministic parser run does not establish real model accuracy, live email delivery, Google Calendar behavior or production SLA.' : 'Only the LLM is live in this run. Email and calendar remain controlled mocks. No live integration acceptance is implied.'}\n\n| Scenario | Result | Observed category | Notes |\n|---|---|---|---|\n${results.map((r) => `| ${r.id} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.category} | ${r.failures.join('; ').replaceAll('|', '/')} |`).join('\n')}\n`;
// Only real-model reports are worth keeping; a mock run can be reproduced at any time.
if (
  save &&
  existsSync('evaluation/last-run.json') &&
  JSON.parse(readFileSync('evaluation/last-run.json', 'utf8')).provider !== 'mock'
) {
  mkdirSync('evaluation/history', { recursive: true });
  const suffix = Date.now();
  writeFileSync(`evaluation/history/${suffix}.json`, readFileSync('evaluation/last-run.json'));
  writeFileSync(`evaluation/history/${suffix}.md`, readFileSync('evaluation/last-run.md'));
}
if (save) {
  writeFileSync('evaluation/last-run.json', JSON.stringify(metadata, null, 2));
  writeFileSync('evaluation/last-run.md', report);
}
console.log(
  `\n${passed}/${results.length} scenarios passed. ${save ? 'Reports saved in evaluation/.' : 'Reports not saved (--no-save).'}`
);
if (passed !== results.length) process.exitCode = 1;
