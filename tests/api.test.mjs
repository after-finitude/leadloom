import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, errorField, isAbort } from '../web/lib/api.ts';

function respond(status, body) {
  globalThis.fetch = async () => ({
    ok: status < 400,
    status,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body)
  });
}

test('a non-JSON error page becomes an ApiError with the HTTP status', async () => {
  respond(502, '<html>Bad gateway</html>');
  await assert.rejects(api('/leads'), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 502);
    assert.equal(error.code, 'bad_response');
    return true;
  });
});

test('a network failure is status 0, and an abort is passed through', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(api('/leads'), (error) => {
    assert.equal(error.status, 0);
    assert.equal(error.code, 'network');
    assert.match(error.message, /Connection lost/);
    return true;
  });
  globalThis.fetch = async () => {
    throw new DOMException('Aborted', 'AbortError');
  };
  await assert.rejects(api('/leads'), (error) => isAbort(error));
});

test('server messages win; known codes without a message get one and a form field', async () => {
  respond(400, { error: 'invalid_budget', message: 'Maximum must not be below minimum' });
  await assert.rejects(api('/leads/x', { method: 'PATCH', body: {} }), /Maximum must not/);
  const phone = new ApiError({ reason: 'invalid_phone' }, 422);
  assert.match(phone.message, /international phone number/);
  assert.equal(errorField(phone), 'phone');
  assert.equal(errorField(new ApiError({ reason: 'contact_required' }, 422)), 'email');
  assert.equal(errorField(new Error('other')), '');
});
