import { AppError, ensure, hash, encrypt } from '../util.mjs';
export class MockEmail {
  name = 'mock';
  constructor(store, c, clock = Date.now) {
    this.store = store;
    this.c = c;
    this.clock = clock;
    this.failAfterSend = false;
  }
  async send(payload, key, leadId, gate = () => {}) {
    gate();
    const externalId = `mail-${hash(key).slice(0, 24)}`;
    this.store.run(
      'INSERT OR IGNORE INTO outbox(id,operation_key,lead_id,payload,created_at) VALUES(?,?,?,?,?)',
      externalId,
      key,
      leadId,
      encrypt(payload, this.c.key),
      this.clock()
    );
    if (this.failAfterSend) {
      this.failAfterSend = false;
      throw new AppError('email_unknown', 'Simulated lost email acknowledgement', 502);
    }
    return { id: externalId };
  }
  async get(externalId, key) {
    const r = this.store.get(
      'SELECT id FROM outbox WHERE id=? OR operation_key=?',
      externalId || '',
      key
    );
    return r ? { id: r.id } : null;
  }
}
export class ResendEmail {
  name = 'resend';
  constructor(c, fetcher = fetch) {
    this.c = c;
    this.fetcher = fetcher;
  }
  async send(payload, key, _leadId, gate = () => {}) {
    if (this.c.mode === 'demo')
      ensure(
        this.c.emailAllowlist.includes(payload.to.toLowerCase()),
        'recipient_not_allowed',
        'Recipient is not in EMAIL_ALLOWLIST',
        403
      );
    gate();
    let response;
    try {
      response = await this.fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.c.emailKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000)
      });
    } catch {
      throw new AppError('email_unknown', 'Email acceptance could not be established', 502);
    }
    if (!response.ok)
      throw new AppError(
        response.status >= 500 ? 'email_unknown' : `email_http_${response.status}`,
        'Email provider rejected the request',
        502
      );
    /** @type {any} */
    const data = await response.json();
    ensure(typeof data.id === 'string', 'email_unknown', 'Email response had no identifier', 502);
    return { id: data.id };
  }
  async get(externalId) {
    if (!externalId) return null;
    const r = await this.fetcher(
      `https://api.resend.com/emails/${encodeURIComponent(externalId)}`,
      {
        headers: { Authorization: `Bearer ${this.c.emailKey}` },
        signal: AbortSignal.timeout(10000)
      }
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new AppError('email_lookup_failed', 'Could not inspect email operation', 502);
    /** @type {any} */
    const d = await r.json();
    return { id: d.id };
  }
}
