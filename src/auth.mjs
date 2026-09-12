import {
  id,
  token,
  hash,
  passwordHash,
  passwordValid,
  ensure,
  email,
  sameSecret,
  text
} from './util.mjs';
export class Auth {
  constructor(store, c, clock = Date.now) {
    this.s = store;
    this.c = c;
    this.clock = clock;
  }
  seed() {
    for (const [address, password, name, role] of [
      [this.c.adminEmail, this.c.adminPassword, 'Alex Morgan', 'admin'],
      [this.c.managerEmail, this.c.managerPassword, 'Sam Taylor', 'manager']
    ]) {
      if (!this.s.get('SELECT id FROM users WHERE email=?', email(address)))
        this.s.run(
          'INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)',
          id(),
          email(address),
          name,
          passwordHash(password),
          role
        );
    }
  }
  login(body, ip) {
    this.s.limit(`login:${hash(ip)}`, 10, 15 * 60000, this.clock());
    const address = email(body.email);
    text(body.password, 1024);
    const user = this.s.get('SELECT * FROM users WHERE email=? AND active=1', address);
    // Equal-cost password check even for an unknown address.
    const stored =
      user?.password_hash || this.dummyHash || (this.dummyHash = passwordHash(token()));
    const valid = passwordValid(body.password, stored);
    ensure(user && valid, 'invalid_credentials', 'Invalid email or password', 401);
    const result = this.create('staff', user.id, 8 * 3600000);
    this.s.audit(null, 'staff_login', {}, user.id, undefined, this.clock());
    return {
      ...result,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    };
  }
  create(kind, subjectId, lifetime = 7 * 86400000) {
    const raw = token(),
      csrf = token();
    this.s.run(
      'INSERT INTO sessions(token_hash,kind,subject_id,csrf,expires_at) VALUES(?,?,?,?,?)',
      hash(raw),
      kind,
      subjectId,
      csrf,
      this.clock() + lifetime
    );
    return { raw, csrf };
  }
  get(raw, kind) {
    if (!raw) return null;
    return (
      this.s.get(
        'SELECT * FROM sessions WHERE token_hash=? AND kind=? AND expires_at>?',
        hash(raw),
        kind,
        this.clock()
      ) || null
    );
  }
  staff(raw) {
    const session = this.get(raw, 'staff');
    ensure(session, 'unauthorized', 'Please sign in', 401);
    const user = this.s.get(
      'SELECT id,email,name,role FROM users WHERE id=? AND active=1',
      session.subject_id
    );
    ensure(user, 'unauthorized', 'Account is disabled', 401);
    return { session, user };
  }
  visitor(raw) {
    const session = this.get(raw, 'visitor');
    ensure(session, 'unauthorized', 'Open your secure chat link or start a new enquiry', 401);
    return session;
  }
  csrf(session, provided) {
    ensure(
      typeof provided === 'string' && sameSecret(session.csrf, provided),
      'csrf',
      'Invalid security token. Reload the page.',
      403
    );
  }
  logout(raw) {
    if (raw) this.s.run('DELETE FROM sessions WHERE token_hash=?', hash(raw));
  }
  issue(purpose, leadId, contactId) {
    const raw = token();
    this.s.run(
      'INSERT INTO access_tokens(token_hash,purpose,contact_id,lead_id,expires_at) VALUES(?,?,?,?,?)',
      hash(raw),
      purpose,
      contactId,
      leadId,
      this.clock() + (purpose === 'chat' ? 24 * 3600000 : 90 * 86400000)
    );
    return raw;
  }
  exchange(raw) {
    text(raw, 128);
    return this.s.tx(() => {
      const row = this.s.get(
        "SELECT * FROM access_tokens WHERE token_hash=? AND purpose='chat' AND used_at IS NULL AND expires_at>?",
        hash(raw),
        this.clock()
      );
      ensure(row, 'invalid_access_link', 'This link has expired or was already used', 401);
      this.s.run('UPDATE access_tokens SET used_at=? WHERE token_hash=?', this.clock(), hash(raw));
      this.s.run('UPDATE contacts SET verified_email=1 WHERE id=?', row.contact_id);
      this.s.audit(row.lead_id, 'chat_link_exchanged', {}, 'visitor', undefined, this.clock());
      return { ...this.create('visitor', row.lead_id), leadId: row.lead_id };
    });
  }
  unsubscribeToken(raw) {
    text(raw, 128);
    const r = this.s.get(
      "SELECT * FROM access_tokens WHERE token_hash=? AND purpose='unsubscribe' AND expires_at>?",
      hash(raw),
      this.clock()
    );
    ensure(r, 'invalid_unsubscribe', 'This unsubscribe link is not valid', 401);
    return r;
  }
}
