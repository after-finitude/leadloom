import { hash, AppError, ensure } from '../util.mjs';
export const eventId = (key) => `ll${hash(key)}`; // Lower-case base32hex-compatible characters.
export class MockCalendar {
  name = 'mock';
  constructor(store, clock = Date.now) {
    this.store = store;
    this.clock = clock;
    this.failAfterCreate = false;
  }
  async busy(start, end) {
    return this.store.all(
      "SELECT start_at AS start,end_at AS end FROM calendar_events WHERE status='confirmed' AND start_at<? AND end_at>?",
      end,
      start
    );
  }
  async get(externalId) {
    const row = this.store.get('SELECT * FROM calendar_events WHERE id=?', externalId);
    return row && row.status === 'confirmed'
      ? {
          id: row.id,
          start: row.start_at,
          end: row.end_at,
          operationKey: row.operation_key,
          url: null
        }
      : null;
  }
  async create(input, gate = () => {}) {
    gate();
    const eid = eventId(input.key),
      existing = await this.get(eid);
    if (existing) return existing;
    gate();
    this.store.run(
      "INSERT INTO calendar_events(id,operation_key,lead_id,start_at,end_at,status,updated_at) VALUES(?,?,?,?,?,'confirmed',?)",
      eid,
      input.key,
      input.leadId,
      input.start,
      input.end,
      this.clock()
    );
    if (this.failAfterCreate) {
      this.failAfterCreate = false;
      throw new AppError('calendar_unknown', 'Simulated lost response after event creation', 502);
    }
    return { id: eid, start: input.start, end: input.end, operationKey: input.key, url: null };
  }
  async cancel(input) {
    this.store.run(
      "UPDATE calendar_events SET status='cancelled',updated_at=? WHERE id=?",
      this.clock(),
      input.externalId
    );
    return { cancelled: true };
  }
  async reschedule(input) {
    this.store.run(
      "UPDATE calendar_events SET start_at=?,end_at=?,operation_key=?,updated_at=? WHERE id=? AND status='confirmed'",
      input.start,
      input.end,
      input.key,
      this.clock(),
      input.externalId
    );
    return this.get(input.externalId);
  }
}
export class GoogleCalendar {
  name = 'google';
  constructor(c, fetcher = fetch) {
    this.c = c;
    this.fetcher = fetcher;
    this.cached = null;
  }
  async accessToken() {
    if (this.cached && this.cached.expires > Date.now() + 60000) return this.cached.token;
    const r = await this.fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({
        client_id: this.c.googleClientId,
        client_secret: this.c.googleClientSecret,
        refresh_token: this.c.googleRefreshToken,
        grant_type: 'refresh_token'
      })
    });
    if (!r.ok) throw new AppError('calendar_auth', 'Google OAuth refresh failed', 502);
    /** @type {any} */
    const data = await r.json();
    ensure(typeof data.access_token === 'string', 'calendar_auth');
    this.cached = {
      token: data.access_token,
      expires: Date.now() + Number(data.expires_in || 3600) * 1000
    };
    return data.access_token;
  }
  /** @param {string} path @param {string} [method] @param {object} [body] @returns {Promise<any>} */
  async request(path, method = 'GET', body = undefined, gate = () => {}) {
    const auth = await this.accessToken();
    gate();
    let r;
    try {
      r = await this.fetcher(`https://www.googleapis.com/calendar/v3${path}`, {
        method,
        headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12000)
      });
    } catch {
      throw new AppError('calendar_unknown', 'Calendar response could not be established', 502);
    }
    if (r.status === 404 || r.status === 410) return null;
    if (r.status === 409)
      throw new AppError('calendar_exists', 'Calendar identifier already exists', 409);
    if (!r.ok)
      throw new AppError(
        r.status >= 500 ? 'calendar_unknown' : `calendar_http_${r.status}`,
        'Calendar request failed',
        502
      );
    return r.status === 204 ? { deleted: true } : r.json();
  }
  path(id = '') {
    return `/calendars/${encodeURIComponent(this.c.calendarId)}/events${
      id ? '/' + encodeURIComponent(id) : ''
    }`;
  }
  event(data) {
    if (!data || data.status === 'cancelled') return null;
    return {
      id: data.id,
      start: Date.parse(data.start?.dateTime),
      end: Date.parse(data.end?.dateTime),
      operationKey: data.extendedProperties?.private?.leadloomOperation,
      url: data.htmlLink || null
    };
  }
  async busy(start, end) {
    const data = await this.request('/freeBusy', 'POST', {
      timeMin: new Date(start).toISOString(),
      timeMax: new Date(end).toISOString(),
      items: [{ id: this.c.calendarId }]
    });
    const c = data?.calendars?.[this.c.calendarId];
    if (!c || c.errors?.length)
      throw new AppError('calendar_busy_error', 'Availability could not be read', 502);
    return (c.busy || []).map((x) => ({ start: Date.parse(x.start), end: Date.parse(x.end) }));
  }
  async get(externalId) {
    return this.event(await this.request(this.path(externalId)));
  }
  async create(input, gate = () => {}) {
    const eid = eventId(input.key),
      body = {
        id: eid,
        summary: `Consultation · ${input.name}`,
        description: input.summary,
        start: { dateTime: new Date(input.start).toISOString(), timeZone: input.timezone },
        end: { dateTime: new Date(input.end).toISOString(), timeZone: input.timezone },
        reminders: { useDefault: false },
        extendedProperties: { private: { leadloomOperation: input.key } }
      };
    try {
      return this.event(await this.request(this.path() + '?sendUpdates=none', 'POST', body, gate));
    } catch (error) {
      if (error.code === 'calendar_exists') {
        const found = await this.get(eid);
        ensure(
          found &&
            found.operationKey === input.key &&
            found.start === input.start &&
            found.end === input.end,
          'calendar_identity_conflict',
          'Existing event does not match the operation',
          409
        );
        return found;
      }
      throw error;
    }
  }
  async cancel(input) {
    await this.request(this.path(input.externalId) + '?sendUpdates=none', 'DELETE');
    return { cancelled: true };
  }
  async reschedule(input) {
    return this.event(
      await this.request(this.path(input.externalId) + '?sendUpdates=none', 'PATCH', {
        start: { dateTime: new Date(input.start).toISOString(), timeZone: input.timezone },
        end: { dateTime: new Date(input.end).toISOString(), timeZone: input.timezone },
        extendedProperties: { private: { leadloomOperation: input.key } },
        reminders: { useDefault: false }
      })
    );
  }
}
