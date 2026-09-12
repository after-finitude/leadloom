import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAILLM } from '../src/providers/llm.mjs';
import { GoogleCalendar, eventId } from '../src/providers/calendar.mjs';
import { ResendEmail } from '../src/providers/email.mjs';
import { DEFAULT_SETTINGS } from '../src/defaults.mjs';
const result = {
  updates: [{ field: 'service_type', value: 'roofing', evidence: 'roofing' }],
  unknown: [],
  handoff: null,
  faq_id: null
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const input = {
  body: 'I need roofing',
  fields: {},
  currentField: 'service_type',
  settings: DEFAULT_SETTINGS
};
test('OpenAI adapter sends a strict Responses schema and disables response storage', async () => {
  let body;
  const llm = new OpenAILLM(
    { llmKey: 'test-key', llmModel: 'test-model', llmTimeout: 1000 },
    async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      body = JSON.parse(options.body);
      return json({
        status: 'completed',
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }]
      });
    }
  );
  assert.deepEqual(await llm.extract(input), result);
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.tools, undefined);
});
test('OpenAI JSON repair is limited to one attempt', async () => {
  let calls = 0;
  const llm = new OpenAILLM(
    { llmKey: 'test-key', llmModel: 'test-model', llmTimeout: 1000 },
    async () => {
      calls++;
      return json({ output: [{ content: [{ type: 'output_text', text: 'not JSON' }] }] });
    }
  );
  await assert.rejects(() => llm.extract(input));
  assert.equal(calls, 2);
});
test('OpenAI refusal is not silently turned into a mock answer', async () => {
  let calls = 0;
  const llm = new OpenAILLM(
    { llmKey: 'test-key', llmModel: 'test-model', llmTimeout: 1000 },
    async () => {
      calls++;
      return json({ output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] });
    }
  );
  await assert.rejects(
    () => llm.extract(input),
    (e) => e.code === 'llm_refusal'
  );
  assert.equal(calls, 1);
});
test('Google adapter uses a deterministic valid event id without uncontrolled attendee mail', async () => {
  const calls = [];
  const p = {
    key: 'booking-stable-key',
    leadId: 'lead',
    name: 'Synthetic',
    summary: 'Test',
    start: 1789030800000,
    end: 1789032600000,
    timezone: 'Etc/UTC'
  };
  const calendar = new GoogleCalendar(
    {
      calendarId: 'test@example.test',
      googleClientId: 'client',
      googleClientSecret: 'secret',
      googleRefreshToken: 'refresh'
    },
    async (url, options) => {
      calls.push({ url, options });
      if (url.includes('oauth2')) return json({ access_token: 'oauth-token', expires_in: 3600 });
      const body = JSON.parse(options.body);
      return json({ ...body, htmlLink: 'https://calendar.google.com/calendar/event?test' });
    }
  );
  const found = await calendar.create(p);
  assert.equal(found.id, eventId(p.key));
  assert.match(found.id, /^[0-9a-v]{5,1024}$/);
  const request = calls.at(-1);
  assert.match(request.url, /sendUpdates=none/);
  const body = JSON.parse(request.options.body);
  assert.equal(body.attendees, undefined);
  assert.equal(body.reminders.useDefault, false);
  assert.equal(body.extendedProperties.private.leadloomOperation, p.key);
});
test('calendar permission is checked after OAuth refresh, immediately before event request', async () => {
  let requests = 0;
  const calendar = new GoogleCalendar(
    {
      calendarId: 'test',
      googleClientId: 'client',
      googleClientSecret: 'secret',
      googleRefreshToken: 'refresh'
    },
    async () => {
      requests++;
      return json({ access_token: 'token', expires_in: 3600 });
    }
  );
  await assert.rejects(() =>
    calendar.create({ key: 'x', start: 1, end: 2, name: 'x', timezone: 'Etc/UTC' }, () => {
      throw new Error('STOP');
    })
  );
  assert.equal(requests, 1);
});
test('Resend adapter reuses the provided idempotency key and enforces demo allowlist', async () => {
  let request;
  const mail = new ResendEmail(
    { mode: 'demo', emailAllowlist: ['allowed@example.test'], emailKey: 'test' },
    async (_url, options) => {
      request = options;
      return json({ id: 'message-id' });
    }
  );
  await assert.rejects(() => mail.send({ to: 'other@example.test' }, 'key', 'lead'));
  const payload = {
    to: 'allowed@example.test',
    from: 'test@example.test',
    subject: 'Test',
    text: 'Synthetic'
  };
  assert.equal((await mail.send(payload, 'stable-key', 'lead')).id, 'message-id');
  assert.equal(request.headers['Idempotency-Key'], 'stable-key');
  assert.equal(request.body, JSON.stringify(payload));
});
