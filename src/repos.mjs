// Data access shared by more than one module. Queries used by a single module stay there.
import { id, hash, stable, parse, encrypt, decrypt, ensure } from './util.mjs';
import { CLOSED_STAGES, sqlList } from './domain.mts';
import { DEFAULT_SETTINGS } from './defaults.mts';

const LEAD_COLUMNS = new Set([
  'stage',
  'owner',
  'owner_id',
  'paused',
  'review_reason',
  'open_question',
  'lost_reason',
  'revision',
  'fields',
  'meta',
  'asked',
  'skipped',
  'current_field',
  'qualification',
  'score',
  'category',
  'reasons',
  'rule_id',
  'processed_seq',
  'last_lead_at',
  'waiting_at',
  'followup_run',
  'followup_type',
  'followup_suppressed',
  'first_contact_at',
  'first_contact_channel',
  'first_contact_ms',
  'first_contact_status',
  'service_key'
]);
export const LEAD_SELECT =
  'SELECT l.*,c.name,c.email,c.phone,c.opt_out,c.verified_email,v.id AS conversation_id';
export const LEAD_FROM =
  'FROM leads l JOIN contacts c ON c.id=l.contact_id JOIN conversations v ON v.lead_id=l.id';
export const parseLead = (row) => ({
  ...row,
  fields: parse(row.fields),
  meta: parse(row.meta),
  asked: parse(row.asked),
  skipped: parse(row.skipped, []),
  reasons: parse(row.reasons, [])
});

export class Leads {
  constructor(store, clock) {
    this.s = store;
    this.clock = clock;
  }
  get(leadId) {
    const row = this.s.get(`${LEAD_SELECT} ${LEAD_FROM} WHERE l.id=?`, leadId);
    ensure(row, 'lead_not_found', 'Lead not found', 404);
    return parseLead(row);
  }
  update(leadId, patch, bump = false) {
    const items = Object.entries(patch);
    ensure(
      items.every(([k]) => LEAD_COLUMNS.has(k)),
      'invalid_internal_field'
    );
    if (!items.length && !bump) return;
    const set = [...items.map(([k]) => `${k}=?`), ...(bump ? ['revision=revision+1'] : [])];
    this.s.run(
      `UPDATE leads SET ${set.join(',')},updated_at=? WHERE id=?`,
      ...items.map(([, v]) => (v && typeof v === 'object' ? JSON.stringify(v) : v)),
      this.clock(),
      leadId
    );
  }
  // Every message and control change moves the revision, which invalidates stale AI replies and offers.
  bump(leadId, patch = {}) {
    this.update(leadId, patch, true);
    return this.get(leadId);
  }
  idsForContact(contactId) {
    return this.s.all('SELECT id FROM leads WHERE contact_id=?', contactId).map((r) => r.id);
  }
  // Another open deal of the same contact already uses this service.
  serviceTaken(contactId, service, leadId) {
    return !!this.s.get(
      `SELECT id FROM leads WHERE contact_id=? AND service_key=? AND id<>? AND stage NOT IN (${sqlList(CLOSED_STAGES)})`,
      contactId,
      service,
      leadId
    );
  }
}

export class Messages {
  constructor(store, clock) {
    this.s = store;
    this.clock = clock;
  }
  add(leadId, author, body, clientKey = null, pending = false) {
    const conversation = this.s.get('SELECT id FROM conversations WHERE lead_id=?', leadId),
      mid = id();
    ensure(conversation, 'lead_not_found', 'Lead not found', 404);
    this.s.run(
      'INSERT INTO messages(id,conversation_id,author,body,client_key,pending,created_at) VALUES(?,?,?,?,?,?,?)',
      mid,
      conversation.id,
      author,
      body,
      clientKey,
      pending ? 1 : 0,
      this.clock()
    );
    return mid;
  }
  // The same repository, except that assistant messages are saved hidden until published.
  drafts() {
    return Object.assign(Object.create(this), {
      add: (leadId, author, body, clientKey = null) =>
        this.add(leadId, author, body, clientKey, author === 'AI')
    });
  }
  pending(conversationId) {
    return this.s.all(
      'SELECT id,body FROM messages WHERE conversation_id=? AND pending=1 ORDER BY seq',
      conversationId
    );
  }
  publish(messageId, body) {
    this.s.run('UPDATE messages SET body=?,pending=0 WHERE id=? AND pending=1', body, messageId);
  }
  // Drafts a crashed worker left behind are shown with their planned text.
  publishStale(before) {
    this.s.run('UPDATE messages SET pending=0 WHERE pending=1 AND created_at<?', before);
  }
  byClientKey(conversationId, key) {
    return this.s.get(
      'SELECT id,body,author FROM messages WHERE conversation_id=? AND client_key=?',
      conversationId,
      key
    );
  }
  history(conversationId) {
    return this.s.all(
      'SELECT id,author,body,created_at FROM messages WHERE conversation_id=? AND pending=0 ORDER BY seq',
      conversationId
    );
  }
}

export class Audit {
  constructor(store, clock) {
    this.s = store;
    this.clock = clock;
  }
  /**
   * @param {string | null} leadId
   * @param {string} action
   * @param {object} [details]
   * @param {{ actor?: string, correlation?: string, at?: number }} [options]
   */
  add(leadId, action, details = {}, { actor = 'system', correlation, at = this.clock() } = {}) {
    this.s.audit(leadId, action, details, actor, correlation, at);
  }
}

export class Actions {
  constructor(store, clock) {
    this.s = store;
    this.clock = clock;
  }
  enqueue(kind, leadId, key, data = {}, due = this.clock(), operationId = null) {
    const aid = id();
    this.s.run(
      'INSERT OR IGNORE INTO actions(id,action_key,kind,lead_id,operation_id,data,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      aid,
      key,
      kind,
      leadId,
      operationId,
      JSON.stringify(data),
      due,
      this.clock(),
      this.clock()
    );
    return this.s.get('SELECT * FROM actions WHERE action_key=?', key);
  }
  get(actionId) {
    return this.s.get('SELECT * FROM actions WHERE id=?', actionId);
  }
}

// External side effects (calendar, email) with an encrypted, idempotent payload.
export class Operations {
  constructor(store, clock, key) {
    this.s = store;
    this.clock = clock;
    this.key = key;
  }
  create(kind, leadId, key, payload) {
    const old = this.byKey(key),
      digest = hash(stable(payload));
    if (old) {
      ensure(
        old.input_hash === digest && old.kind === kind && old.lead_id === leadId,
        'idempotency_conflict',
        'Operation key was reused for different input',
        409
      );
      return old;
    }
    const oid = id();
    this.s.run(
      'INSERT INTO operations(id,op_key,kind,lead_id,input_hash,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      oid,
      key,
      kind,
      leadId,
      digest,
      encrypt(payload, this.key),
      this.clock(),
      this.clock()
    );
    return this.get(oid);
  }
  get(operationId) {
    return this.s.get('SELECT * FROM operations WHERE id=?', operationId);
  }
  byKey(key) {
    return this.s.get('SELECT * FROM operations WHERE op_key=?', key);
  }
  payload(op) {
    return decrypt(op.payload, this.key);
  }
  status(operationId) {
    const op = this.s.get(
      'SELECT id,kind,state,error_code,external_id FROM operations WHERE id=?',
      operationId
    );
    ensure(op, 'operation_not_found', undefined, 404);
    return op;
  }
}

export class Workspace {
  constructor(store) {
    this.s = store;
  }
  /** @returns {import('./types.ts').CompanySettings & { revision: number }} */
  settings() {
    const row = this.s.get('SELECT * FROM settings WHERE id=1'),
      data = parse(row.data);
    // Settings saved before a reply existed get its default text.
    return {
      ...data,
      replies: { ...DEFAULT_SETTINGS.replies, ...data.replies },
      revision: row.revision
    };
  }
  /** @returns {import('./types.ts').Rule} */
  rules(ruleId) {
    const row = ruleId
      ? this.s.get('SELECT * FROM rule_versions WHERE id=?', ruleId)
      : this.s.get('SELECT * FROM rule_versions ORDER BY version DESC LIMIT 1');
    ensure(row, 'rules_not_found', 'Rules version not found', 404);
    return { ...row, data: parse(row.data) };
  }
  /** @returns {import('./types.ts').Rule[]} */
  ruleVersions() {
    return this.s
      .all('SELECT * FROM rule_versions ORDER BY version DESC')
      .map((r) => ({ ...r, data: JSON.parse(r.data) }));
  }
}
