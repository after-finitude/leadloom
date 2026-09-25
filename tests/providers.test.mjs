import test from 'node:test';
import assert from 'node:assert/strict';
import { ResponsesLLM, validateReply } from '../src/providers/llm.mjs';
import { config } from '../src/config.mjs';
import { Store } from '../src/db.mjs';
import { Leadloom } from '../src/service.mjs';
import { GoogleCalendar, eventId } from '../src/providers/calendar.mjs';
import { ResendEmail } from '../src/providers/email.mjs';
import { DEFAULT_SETTINGS } from '../src/defaults.mts';
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
test('OpenRouter routes real extraction with a strict schema while calendar and email stay mock', async () => {
  const c = config({
    mode: 'test',
    dbPath: ':memory:',
    key: 'b'.repeat(64),
    llmProvider: 'openrouter',
    llmKey: 'router-test-key',
    llmModel: 'vendor/test-model',
    calendarProvider: 'mock',
    emailProvider: 'mock'
  });
  assert.throws(() => config({ ...c, llmKey: '' }), /OPENROUTER_API_KEY/);
  assert.throws(() => config({ ...c, llmModel: '' }), /OPENROUTER_MODEL/);
  const store = new Store(':memory:');
  try {
    const app = new Leadloom(store, c);
    assert.equal(app.llm.name, 'openrouter');
    assert.equal(app.calendar.name, 'mock');
    assert.equal(app.email.name, 'mock');
    let calls = 0;
    app.llm.fetcher = async (url, options) => {
      calls++;
      assert.equal(url, 'https://openrouter.ai/api/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer router-test-key');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'vendor/test-model');
      assert.equal(body.store, false);
      assert.equal(body.provider.require_parameters, true);
      assert.deepEqual(body.reasoning, { effort: 'none' });
      assert.equal(body.temperature, 0);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(
        body.input[1].content[0].text,
        JSON.stringify({
          current_field: input.currentField,
          known_fields: input.fields,
          latest_messages: input.body
        })
      );
      return json({
        status: 'completed',
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: calls === 1 ? 'invalid JSON' : JSON.stringify(result)
              }
            ]
          }
        ]
      });
    };
    assert.deepEqual(await app.llm.extract(input), result);
    assert.equal(calls, 2);
    app.llm.fetcher = async () => json({ error: { message: 'Payment required' } }, 402);
    await assert.rejects(() => app.llm.extract(input), { code: 'llm_http_402' });
  } finally {
    store.close();
  }
});
test('OpenAI adapter sends a strict Responses schema and disables response storage', async () => {
  let body;
  const llm = new ResponsesLLM(
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
  assert.equal(body.reasoning, undefined);
  assert.equal(body.temperature, undefined);
});
test('OpenAI JSON repair is limited to one attempt', async () => {
  let calls = 0;
  const llm = new ResponsesLLM(
    { llmKey: 'test-key', llmModel: 'test-model', llmTimeout: 1000 },
    async () => {
      calls++;
      return json({ output: [{ content: [{ type: 'output_text', text: 'not JSON' }] }] });
    }
  );
  await assert.rejects(() => llm.extract(input));
  assert.equal(calls, 2);
});
test('a known FAQ cannot also be outside the FAQ; extraction repairs the contradiction', async () => {
  let calls = 0;
  const expected = { updates: [], unknown: [], handoff: null, faq_id: 'hours' };
  const llm = new ResponsesLLM(
    { llmKey: 'test-key', llmModel: 'test-model', llmTimeout: 1000 },
    async () => {
      calls++;
      const answer = calls === 1 ? { ...expected, handoff: 'outside_faq' } : expected;
      return json({
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }]
      });
    }
  );
  assert.deepEqual(await llm.extract({ ...input, body: 'When are you open?' }), expected);
  assert.equal(calls, 2);
});
test('OpenAI refusal is not silently turned into a mock answer', async () => {
  let calls = 0;
  const llm = new ResponsesLLM(
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
test('reply composition uses a strict schema and keeps what the plan requires', async () => {
  let body;
  const llm = new ResponsesLLM(
    { llmKey: 'test-key', llmModel: 'test-model', llmTimeout: 1000 },
    async (url, options) => {
      body = JSON.parse(options.body);
      return json({
        output: [
          {
            content: [{ type: 'output_text', text: '{"reaction":"","reply":"Где будут работы?"}' }]
          }
        ]
      });
    }
  );
  const plan = { planned: 'Which city?', keep: [], history: [], settings: DEFAULT_SETTINGS };
  assert.deepEqual(await llm.compose(plan), { reaction: '', reply: 'Где будут работы?' });
  assert.deepEqual(body.text.format.schema.required, ['reaction', 'reply']);
  assert.equal(body.text.format.name, 'assistant_reply');
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(JSON.parse(body.input[1].content[0].text).planned_message, 'Which city?');
  const areas = { ...plan, keep: ['Demo City A'] };
  assert.equal(validateReply({ reply: ' In Demo City A? ' }, areas), 'In Demo City A?');
  assert.equal(validateReply({ reply: 'В [[1]]?' }, areas), 'В Demo City A?');
  assert.throws(
    () => validateReply({ reply: 'В Демо Сити А?' }, areas),
    (e) => e.code === 'reply_missing'
  );
  assert.throws(
    () => validateReply({ reply: 'Demo City A or [[2]]?' }, areas),
    (e) => e.code === 'reply_missing'
  );
  assert.equal(
    validateReply({ reaction: 'We do not sell beer.', reply: 'In Demo City A?' }, areas),
    'We do not sell beer. In Demo City A?'
  );
  assert.throws(
    () => validateReply({ reaction: 'Beer?', reply: 'In Demo City A?' }, areas),
    (e) => e.code === 'reply_reaction'
  );
  for (const [reply, code] of [
    ['Somewhere nearby?', 'reply_missing'],
    ['Demo City A.', 'reply_question'],
    ['Demo City A? See https://example.test', 'reply_link'],
    ['', 'reply_length']
  ])
    assert.throws(
      () => validateReply({ reply }, areas),
      (e) => e.code === code
    );
});
test('a prohibited-topic handoff needs a second, narrow confirmation', async () => {
  const banned = { updates: [], unknown: [], handoff: 'banned_topic', faq_id: null };
  const text = (value) =>
    json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  for (const [check, handoff] of [
    [{ topic: 'none' }, null],
    [{ topic: 'illegal drugs' }, 'banned_topic'],
    [null, 'banned_topic']
  ]) {
    const bodies = [];
    const llm = new ResponsesLLM(
      { llmKey: 'test-key', llmModel: 'test-model', llmTimeout: 1000 },
      async (url, options) => {
        bodies.push(JSON.parse(options.body));
        if (bodies.length === 1) return text(banned);
        return check ? text(check) : json({}, 500);
      }
    );
    const result = await llm.extract({ ...input, body: 'Do you sell beer?' });
    assert.equal(result.handoff, handoff);
    assert.equal(bodies[1].text.format.name, 'banned_topic_check');
    assert.deepEqual(bodies[1].text.format.schema.properties.topic.enum, [
      ...DEFAULT_SETTINGS.bannedTopics,
      'none'
    ]);
  }
});
test('a FAQ match that is also outside the FAQ goes to the team after the repair attempt', async () => {
  let calls = 0;
  const llm = new ResponsesLLM(
    { llmKey: 'test-key', llmModel: 'test-model', llmTimeout: 1000 },
    async () => {
      calls++;
      const answer = { updates: [], unknown: [], handoff: 'outside_faq', faq_id: 'services' };
      return json({
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }]
      });
    }
  );
  const result = await llm.extract({ ...input, body: 'Can you guarantee the resale value?' });
  assert.equal(calls, 2);
  assert.equal(result.handoff, 'outside_faq');
  assert.equal(result.faq_id, null);
});
