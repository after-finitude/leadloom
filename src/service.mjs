import {
  id,
  hash,
  stable,
  parse,
  encrypt,
  decrypt,
  text,
  email,
  phone,
  ensure,
  allowKeys,
  isStop,
  AppError,
  escapeHtml
} from './util.mjs';
import { DEFAULT_SETTINGS, newRules } from './defaults.mts';
import {
  FIELDS,
  normalizeField,
  validateBudget,
  scoreLead,
  known,
  mayAutomate,
  mayBook,
  maySendAccess,
  validateSettings,
  validateRules
} from './rules.mts';
import { MockLLM, ResponsesLLM, validateExtraction } from './providers/llm.mjs';
import { MockCalendar, GoogleCalendar } from './providers/calendar.mjs';
import { MockEmail, ResendEmail } from './providers/email.mjs';
import { Auth } from './auth.mjs';
import * as operations from './operations.mjs';
import * as followups from './followups.mjs';

const LEAD_COLUMNS = new Set([
  'stage',
  'owner',
  'owner_id',
  'paused',
  'review_reason',
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
export class Leadloom {
  constructor(store, c, providers = {}, clock = Date.now) {
    this.s = store;
    this.c = c;
    this.clock = clock;
    this.auth = new Auth(store, c, clock);
    this.llm = providers.llm || (c.llmProvider === 'mock' ? new MockLLM() : new ResponsesLLM(c));
    this.calendar =
      providers.calendar ||
      (c.calendarProvider === 'google' ? new GoogleCalendar(c) : new MockCalendar(store));
    this.email =
      providers.email ||
      (c.emailProvider === 'resend' ? new ResendEmail(c) : new MockEmail(store, c));
  }
  init() {
    this.s.tx(() => {
      const marker = this.s.get("SELECT value FROM app_metadata WHERE key='mode'");
      ensure(
        !marker || marker.value === this.c.mode,
        'database_mode_mismatch',
        'Use a fresh database when changing APP_MODE; demo users must not be reused in live mode.',
        409
      );
      if (!marker) this.s.run("INSERT INTO app_metadata(key,value) VALUES('mode',?)", this.c.mode);
      if (!this.s.get('SELECT id FROM settings WHERE id=1'))
        this.s.run('INSERT INTO settings(id,data) VALUES(1,?)', JSON.stringify(DEFAULT_SETTINGS));
      if (!this.s.get('SELECT id FROM rule_versions LIMIT 1'))
        this.publishRules(newRules(this.settings()), 'system');
      this.auth.seed();
    });
  }
  settings() {
    const row = this.s.get('SELECT * FROM settings WHERE id=1');
    return { ...parse(row.data), revision: row.revision };
  }
  rules(ruleId) {
    const row = ruleId
      ? this.s.get('SELECT * FROM rule_versions WHERE id=?', ruleId)
      : this.s.get('SELECT * FROM rule_versions ORDER BY version DESC LIMIT 1');
    ensure(row, 'rules_not_found', 'Rules version not found', 404);
    return { ...row, data: parse(row.data) };
  }
  publishRules(data, actor) {
    validateRules(data);
    const s = this.settings();
    const content = { ...data, services: s.services, areas: s.areas, currency: s.currency };
    const version = (this.s.get('SELECT MAX(version) AS n FROM rule_versions')?.n || 0) + 1,
      rid = id();
    this.s.run(
      'INSERT INTO rule_versions(id,version,data,content_hash,created_at) VALUES(?,?,?,?,?)',
      rid,
      version,
      JSON.stringify(content),
      hash(stable(content)),
      this.clock()
    );
    this.s.audit(null, 'rules_published', { version }, actor, undefined, this.clock());
    return this.rules(rid);
  }
  updateSettings(data, actor) {
    const allowed = Object.keys(DEFAULT_SETTINGS);
    allowKeys(data, [...allowed, 'revision']);
    const current = this.settings();
    ensure(
      data.revision === current.revision,
      'settings_conflict',
      'Settings were changed by another user. Reload first.',
      409
    );
    validateSettings(data);
    delete data.revision;
    return this.s.tx(() => {
      // Changing active-deal policy on existing ambiguous data would silently merge work.
      if (
        data.deduplication === 'one_active_per_contact' &&
        current.deduplication !== data.deduplication
      )
        ensure(
          !this.s.get(
            "SELECT contact_id FROM leads WHERE stage NOT IN ('Won','Lost') GROUP BY contact_id HAVING COUNT(*)>1 LIMIT 1"
          ),
          'active_deal_conflict',
          'Close duplicate active deals before changing policy',
          409
        );
      this.s.run('UPDATE settings SET data=?,revision=revision+1 WHERE id=1', JSON.stringify(data));
      this.s.audit(
        null,
        'settings_updated',
        { revision: current.revision + 1 },
        actor,
        undefined,
        this.clock()
      );
      return this.settings();
    });
  }
  lead(leadId) {
    const row = this.s.get(
      'SELECT l.*,c.name,c.email,c.phone,c.opt_out,c.verified_email,v.id AS conversation_id FROM leads l JOIN contacts c ON c.id=l.contact_id JOIN conversations v ON v.lead_id=l.id WHERE l.id=?',
      leadId
    );
    ensure(row, 'lead_not_found', 'Lead not found', 404);
    return {
      ...row,
      fields: parse(row.fields),
      meta: parse(row.meta),
      asked: parse(row.asked),
      skipped: parse(row.skipped, []),
      reasons: parse(row.reasons, [])
    };
  }
  save(leadId, patch) {
    const items = Object.entries(patch);
    ensure(
      items.every(([k]) => LEAD_COLUMNS.has(k)),
      'invalid_internal_field'
    );
    if (!items.length) return;
    this.s.run(
      `UPDATE leads SET ${items.map(([k]) => `${k}=?`).join(',')},updated_at=? WHERE id=?`,
      ...items.map(([, v]) => (v && typeof v === 'object' ? JSON.stringify(v) : v)),
      this.clock(),
      leadId
    );
  }
  bump(leadId, patch = {}) {
    const l = this.lead(leadId);
    this.save(leadId, { ...patch, revision: l.revision + 1 });
    return this.lead(leadId);
  }
  message(leadId, author, body, clientKey = null) {
    const l = this.lead(leadId),
      mid = id();
    this.s.run(
      'INSERT INTO messages(id,conversation_id,author,body,client_key,created_at) VALUES(?,?,?,?,?,?)',
      mid,
      l.conversation_id,
      author,
      body,
      clientKey,
      this.clock()
    );
    return mid;
  }
  summary(leadId) {
    const l = this.lead(leadId);
    return `${l.name} · ${l.fields.service_type ?? 'service unknown'} · ${
      l.fields.location ?? 'location unknown'
    }\nBudget: ${l.fields.budget_min ?? '?'}–${l.fields.budget_max ?? '?'} ${
      this.rules(l.rule_id).data.currency
    }\nTimeline: ${l.fields.timeline ?? '?'} months; authority: ${
      l.fields.decision_maker ?? 'unknown'
    }\n${l.category} (${l.score}/100), rules v${this.rules(l.rule_id).version}\nReview: ${
      l.review_reason || 'none'
    }`;
  }
  score(leadId) {
    const l = this.lead(leadId),
      result = scoreLead(l.fields, this.rules(l.rule_id).data),
      s = this.settings();
    const complete =
      result.category === 'Unqualified' ||
      s.questions.every(
        (q) => known(l.fields, q.field) || (!q.required && l.skipped.includes(q.field))
      );
    const stage =
      complete &&
      result.score >= this.rules(l.rule_id).data.warm &&
      result.serviceFit &&
      result.locationFit &&
      !l.review_reason &&
      ['New', 'Contacted', 'Qualified'].includes(l.stage)
        ? 'Qualified'
        : l.stage === 'Qualified' &&
            (!complete ||
              !result.serviceFit ||
              !result.locationFit ||
              result.category === 'Nurture')
          ? 'Contacted'
          : l.stage;
    this.save(leadId, {
      score: result.score,
      category: result.category,
      reasons: result.reasons,
      qualification: complete ? 'complete' : 'collecting',
      stage
    });
    this.s.run(
      'INSERT INTO score_evaluations(id,lead_id,rule_id,inputs,score,category,reasons,created_at) VALUES(?,?,?,?,?,?,?,?)',
      id(),
      leadId,
      l.rule_id,
      JSON.stringify(l.fields),
      result.score,
      result.category,
      JSON.stringify(result.reasons),
      this.clock()
    );
    const updated = this.lead(leadId);
    if (mayBook(updated, s) && updated.followup_type !== 'qualified_not_booked')
      this.beginWait(leadId, 'qualified_not_booked');
    return this.lead(leadId);
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
  cancelPending(leadId, reason) {
    const queued = this.s.all("SELECT * FROM actions WHERE lead_id=? AND state='pending'", leadId);
    for (const a of queued) {
      const op = a.operation_id
        ? this.s.get('SELECT * FROM operations WHERE id=?', a.operation_id)
        : null;
      if (op?.kind === 'access' && reason !== 'opt_out') continue;
      this.s.run(
        "UPDATE actions SET state='cancelled',error_code=?,updated_at=? WHERE id=?",
        reason,
        this.clock(),
        a.id
      );
      if (op?.state === 'pending') {
        this.s.run(
          "UPDATE operations SET state='cancelled',error_code=?,updated_at=? WHERE id=?",
          reason,
          this.clock(),
          op.id
        );
        if (op.kind === 'booking')
          this.s.run(
            "UPDATE appointments SET status='cancelled',updated_at=? WHERE operation_key=?",
            this.clock(),
            op.op_key
          );
        if (['booking', 'reschedule'].includes(op.kind))
          this.s.run("UPDATE reservations SET state='released' WHERE operation_key=?", op.op_key);
      }
    }
    this.save(leadId, { waiting_at: null, followup_run: null, followup_type: null });
  }
  handoff(leadId, reason) {
    this.bump(leadId, { owner: 'HUMAN', review_reason: reason, current_field: null });
    this.cancelPending(leadId, reason);
    const summary = this.summary(leadId);
    this.s.run(
      'INSERT INTO handoffs(id,lead_id,reason,summary,created_at) VALUES(?,?,?,?,?)',
      id(),
      leadId,
      reason,
      summary,
      this.clock()
    );
    this.message(
      leadId,
      'system',
      'Your conversation has been passed to our team. A team member will continue here during working hours.'
    );
    this.s.audit(leadId, 'handoff', { reason }, 'system', undefined, this.clock());
  }
  stop(contactId, source = 'chat') {
    return this.s.tx(() => {
      this.s.run('UPDATE contacts SET opt_out=1,opt_out_at=? WHERE id=?', this.clock(), contactId);
      for (const row of this.s.all('SELECT id FROM leads WHERE contact_id=?', contactId)) {
        this.bump(row.id);
        this.cancelPending(row.id, 'opt_out');
        this.s.audit(row.id, 'opt_out', { source }, 'visitor', undefined, this.clock());
      }
      return { unsubscribed: true };
    });
  }
  operation(kind, leadId, key, payload) {
    return operations.operation(this, kind, leadId, key, payload);
  }
  emailPayload(leadId, subject, body) {
    const l = this.lead(leadId);
    ensure(l.email, 'no_email');
    const access = this.auth.issue('chat', leadId, l.contact_id),
      unsubscribe = this.auth.issue('unsubscribe', leadId, l.contact_id);
    const link = `${this.c.origin}/chat#token=${access}`,
      optout = `${this.c.origin}/unsubscribe#token=${unsubscribe}`;
    return {
      from: this.c.emailFrom,
      to: l.email,
      reply_to: this.c.emailReplyTo,
      subject,
      text: `${body}\n\nContinue your conversation: ${link}\n\nUnsubscribe: ${optout}`,
      html: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(
        link
      )}">Continue your conversation</a></p><p><a href="${escapeHtml(optout)}">Unsubscribe</a></p>`
    };
  }
  invite(leadId, key = `invite:${leadId}`, first = true) {
    const l = this.lead(leadId);
    if (!l.email || !(first ? mayAutomate(l) : maySendAccess(l))) return;
    if (this.s.get('SELECT id FROM operations WHERE op_key=?', key)) return;
    const payload = {
      email: this.emailPayload(
        leadId,
        `Your enquiry with ${this.settings().company}`,
        first
          ? 'Thanks for your enquiry. Tell us a little about your project in your secure chat.'
          : 'Use the secure link below to return to your conversation.'
      ),
      first
    };
    const op = this.operation(first ? 'invitation' : 'access', leadId, key, payload);
    this.enqueue('email', leadId, `send:${key}`, {}, this.clock(), op.id);
  }
  intake(
    payload,
    { source = 'web_form', web = true, sessionLead = null, resolvedContactId = null } = {}
  ) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      payload = { invalid_payload: payload ?? null };
    const now = this.clock(),
      eventKey =
        typeof payload.event_key === 'string' && payload.event_key.length <= 128
          ? payload.event_key
          : `invalid:${hash(stable(payload))}`,
      sourceKey = String(source).slice(0, 64),
      digest = hash(stable(payload));
    return this.s.tx(() => {
      const previous = this.s.get(
        'SELECT * FROM intake_events WHERE source=? AND event_key=?',
        sourceKey,
        eventKey
      );
      if (previous && !resolvedContactId) {
        ensure(
          previous.payload_hash === digest,
          'idempotency_conflict',
          'Same event key, different payload',
          409
        );
        return this.intakeResponse(previous, web, sessionLead, false);
      }
      const eventId = previous?.id || id(),
        correlation = previous?.correlation_id || id();
      let v, validationError;
      try {
        allowKeys(payload, [
          'name',
          'email',
          'phone',
          'service_type',
          'event_key',
          'external_id',
          'source'
        ]);
        text(sourceKey, 64);
        text(payload.event_key, 128);
        v = {
          name: payload.name ? text(payload.name, 120) : 'New enquiry',
          email: email(payload.email),
          phone: phone(payload.phone),
          service: payload.service_type ? text(payload.service_type, 100).toLowerCase() : '',
          externalId: payload.external_id ? text(payload.external_id, 120) : null
        };
        ensure(
          v.email || v.phone,
          'contact_required',
          'An email or international phone number is required'
        );
      } catch (error) {
        validationError = error;
      }
      if (!previous)
        this.s.run(
          'INSERT INTO intake_events(id,source,event_key,payload_hash,payload,status,reason,correlation_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
          eventId,
          sourceKey,
          eventKey,
          digest,
          encrypt(payload, this.c.key),
          validationError ? 'rejected' : 'processing',
          validationError?.code || null,
          correlation,
          now
        );
      if (validationError) {
        this.s.audit(
          null,
          'intake_rejected',
          { eventId, reason: validationError.code },
          'source',
          correlation,
          now
        );
        return {
          status: 'rejected',
          reason: validationError.code,
          eventId,
          correlation_id: correlation
        };
      }
      const matches = new Map();
      for (const [column, value] of [
        ['email', v.email],
        ['phone', v.phone]
      ])
        if (value) {
          const contact = this.s.get(`SELECT * FROM contacts WHERE ${column}=?`, value);
          if (contact) matches.set(contact.id, contact);
        }
      if (v.externalId) {
        const existing = this.s.get(
          'SELECT c.* FROM identities i JOIN contacts c ON c.id=i.contact_id WHERE i.source=? AND i.external_id=?',
          sourceKey,
          v.externalId
        );
        if (existing) matches.set(existing.id, existing);
      }
      const resolution = (reason) => {
        this.s.run(
          "UPDATE intake_events SET status='needs_resolution',reason=? WHERE id=?",
          reason,
          eventId
        );
        this.s.audit(
          null,
          'intake_needs_resolution',
          { eventId, reason },
          'source',
          correlation,
          now
        );
        return { status: 'needs_resolution', eventId, correlation_id: correlation };
      };
      if (matches.size > 1 && !resolvedContactId) return resolution('contact_conflict');
      let contact = resolvedContactId
          ? this.s.get('SELECT * FROM contacts WHERE id=?', resolvedContactId)
          : [...matches.values()][0],
        newContact = !contact;
      if (resolvedContactId) ensure(contact, 'contact_not_found', 'Contact not found', 404);
      if (!contact) {
        const cid = id();
        this.s.run(
          'INSERT INTO contacts(id,name,email,phone,created_at) VALUES(?,?,?,?,?)',
          cid,
          v.name,
          v.email,
          v.phone,
          now
        );
        contact = this.s.get('SELECT * FROM contacts WHERE id=?', cid);
      }
      if (v.externalId) {
        const identity = this.s.get(
          'SELECT * FROM identities WHERE source=? AND external_id=?',
          sourceKey,
          v.externalId
        );
        if (identity && identity.contact_id !== contact.id)
          return resolution('external_identity_conflict');
        this.s.run(
          'INSERT OR IGNORE INTO identities(source,external_id,contact_id) VALUES(?,?,?)',
          sourceKey,
          v.externalId,
          contact.id
        );
      }
      // Never overwrite the trusted contact channels based on public deduplication.
      let active = this.s.all(
        "SELECT id,service_key FROM leads WHERE contact_id=? AND stage NOT IN ('Won','Lost') ORDER BY created_at DESC",
        contact.id
      );
      if (this.settings().deduplication === 'one_active_per_contact_service') {
        if (v.service) active = active.filter((l) => l.service_key === v.service || !l.service_key);
        if (active.length > 1) return resolution('ambiguous_active_deal');
      }
      let leadId = active[0]?.id;
      if (leadId) {
        this.s.audit(leadId, 're_engaged', { eventId }, 'source', correlation, now);
      } else {
        leadId = id();
        this.s.run(
          'INSERT INTO leads(id,contact_id,source,service_key,fields,rule_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
          leadId,
          contact.id,
          sourceKey,
          v.service,
          JSON.stringify(v.service ? { service_type: v.service } : {}),
          this.rules().id,
          now,
          now
        );
        this.s.run('INSERT INTO conversations(id,lead_id) VALUES(?,?)', id(), leadId);
        this.score(leadId);
        this.s.audit(
          leadId,
          'intake_accepted',
          { eventId, source: sourceKey },
          'source',
          correlation,
          now
        );
        if (contact.opt_out) {
          this.save(leadId, {
            first_contact_status: 'not_applicable',
            review_reason: 'opt_out',
            owner: 'HUMAN'
          });
        } else if (web && newContact) {
          this.askNext(leadId, true);
        } else if (contact.email) {
          this.askNext(leadId, false);
          this.invite(leadId);
        } else {
          this.handoff(leadId, 'no_automated_channel');
          this.save(leadId, { first_contact_status: 'not_applicable' });
        }
      }
      this.s.run(
        "UPDATE intake_events SET status='accepted',reason=NULL,contact_id=?,lead_id=? WHERE id=?",
        contact.id,
        leadId,
        eventId
      );
      const row = this.s.get('SELECT * FROM intake_events WHERE id=?', eventId);
      const response = this.intakeResponse(row, web, sessionLead, newContact);
      if (web && !newContact && sessionLead !== leadId) {
        if (contact.verified_email && !contact.opt_out && mayAutomate(this.lead(leadId)))
          this.invite(leadId);
      }
      return response;
    });
  }
  intakeResponse(row, web, sessionLead, newContact) {
    if (!web)
      return {
        status: row.status,
        eventId: row.id,
        leadId: row.lead_id,
        correlation_id: row.correlation_id,
        reason: row.reason
      };
    if (row.status === 'accepted' && (newContact || sessionLead === row.lead_id))
      return {
        status: 'accepted',
        session: this.auth.create('visitor', row.lead_id),
        leadId: row.lead_id
      };
    if (row.status === 'rejected') return { status: 'rejected', reason: row.reason };
    return {
      status: 'access_required',
      message:
        'Your enquiry has been received. Use your existing chat or a secure link sent to your verified email. Our team can help with access.'
    };
  }
  resolveIntake(eventId, contactId, actor) {
    const row = this.s.get(
      "SELECT * FROM intake_events WHERE id=? AND status='needs_resolution'",
      eventId
    );
    ensure(row, 'intake_not_pending', 'Intake is not awaiting resolution', 409);
    const result = this.intake(decrypt(row.payload, this.c.key), {
      source: row.source,
      web: false,
      resolvedContactId: contactId
    });
    this.s.audit(result.leadId || null, 'intake_resolved', { eventId, contactId }, actor);
    return result;
  }
  firstContact(leadId, channel) {
    const l = this.lead(leadId);
    if (l.first_contact_at) return;
    this.save(leadId, {
      first_contact_at: this.clock(),
      first_contact_channel: channel,
      first_contact_ms: this.clock() - l.created_at,
      first_contact_status: 'accepted',
      stage: l.stage === 'New' ? 'Contacted' : l.stage
    });
  }
  askNext(leadId, markFirst = false, prefix = '') {
    let l = this.lead(leadId);
    if (!mayAutomate(l)) return;
    const s = this.settings();
    l = this.score(leadId);
    let question = null;
    if (l.category === 'Unqualified') {
      this.message(
        leadId,
        'AI',
        `${prefix}Thank you for the details. This project is outside our current services or service area, so I cannot book it automatically. Your enquiry is saved for our team.`
      );
      this.save(leadId, { current_field: null });
    } else if (l.qualification === 'complete') {
      if (['Hot', 'Warm'].includes(l.category) && !l.email) {
        question = {
          field: 'email',
          text: 'What email address should we use for your consultation details?'
        };
      } else {
        this.message(
          leadId,
          'AI',
          `${prefix}${
            ['Hot', 'Warm'].includes(l.category)
              ? 'Thanks — I have the project details. Use “Choose a consultation time” below to see current availability.'
              : 'Thank you — your project details are saved. Our team can review the next steps with you.'
          }`
        );
        this.save(leadId, { current_field: null });
      }
    } else
      question = s.questions.find((q) => !known(l.fields, q.field) && !l.skipped.includes(q.field));
    if (question) {
      const asked = { ...l.asked, [question.field]: (l.asked[question.field] || 0) + 1 };
      this.message(leadId, 'AI', `${prefix}${question.text}`);
      this.save(leadId, { current_field: question.field, asked });
    }
    if (markFirst) this.firstContact(leadId, 'chat');
    if (question) this.beginWait(leadId, 'qualification_abandoned');
  }
  beginWait(leadId, type) {
    return followups.beginWait(this, leadId, type);
  }
  postMessage(leadId, body, key) {
    text(body, 4000);
    text(key, 128);
    return this.s.tx(() => {
      const l = this.lead(leadId),
        old = this.s.get(
          'SELECT id,body,author FROM messages WHERE conversation_id=? AND client_key=?',
          l.conversation_id,
          key
        );
      if (old) {
        ensure(
          old.body === body && old.author === 'lead',
          'idempotency_conflict',
          'Message key reused with different content',
          409
        );
        return { id: old.id, repeated: true };
      }
      const mid = this.message(leadId, 'lead', body, key);
      this.cancelPending(leadId, 'lead_replied');
      const current = this.bump(leadId, { last_lead_at: this.clock() });
      if (isStop(body)) {
        this.stop(l.contact_id);
        return { id: mid, stopped: true };
      }
      if (mayAutomate(current))
        this.enqueue('turn', leadId, `turn:${leadId}:${current.revision}`, {
          revision: current.revision
        });
      return { id: mid };
    });
  }
  async turn(leadId) {
    const l = this.lead(leadId);
    if (!mayAutomate(l)) return { cancelled: true };
    const messages = this.s.all(
      "SELECT * FROM messages WHERE conversation_id=? AND author='lead' AND seq>? ORDER BY seq",
      l.conversation_id,
      l.processed_seq
    );
    if (!messages.length) return { empty: true };
    const body = messages.map((m) => m.body).join('\n'),
      snapshot = l.revision,
      input = { body, settings: this.settings(), fields: l.fields, currentField: l.current_field };
    let result;
    try {
      result = validateExtraction(await this.llm.extract(input), input);
    } catch (error) {
      return this.s.tx(() => {
        const latest = this.lead(leadId);
        if (latest.revision === snapshot && mayAutomate(latest))
          this.handoff(leadId, error.code || 'llm_failure');
        return { handoff: true };
      });
    }
    return this.s.tx(() => {
      let latest = this.lead(leadId);
      if (latest.revision !== snapshot || !mayAutomate(latest)) {
        this.s.audit(leadId, 'stale_ai_discarded', {}, 'system', undefined, this.clock());
        return { stale: true };
      }
      const fields = { ...latest.fields },
        meta = { ...latest.meta },
        skipped = new Set(latest.skipped);
      let conflict = false;
      if (result.handoff) {
        this.save(leadId, { processed_seq: messages.at(-1).seq });
        this.handoff(leadId, result.handoff);
        return { handoff: true };
      }
      try {
        for (const update of result.updates) {
          const value = normalizeField(update.field, update.value),
            message = messages.find((m) =>
              m.body.toLowerCase().includes(update.evidence.toLowerCase())
            );
          ensure(message, 'llm_evidence');
          if (update.field === 'email') {
            if (latest.email && latest.email !== value) {
              conflict = true;
              continue;
            }
            if (value && !latest.email) {
              const other = this.s.get(
                'SELECT id FROM contacts WHERE email=? AND id<>?',
                value,
                latest.contact_id
              );
              if (other) {
                conflict = true;
                continue;
              }
              this.s.run(
                'UPDATE contacts SET email=?,verified_email=0 WHERE id=?',
                value,
                latest.contact_id
              );
            }
            continue;
          }
          if (stable(fields[update.field] ?? null) === stable(value)) continue;
          const locked = !!meta[update.field]?.locked;
          this.s.run(
            'INSERT INTO field_revisions(id,lead_id,field,old_value,new_value,actor,message_id,locked,proposed,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
            id(),
            leadId,
            update.field,
            JSON.stringify(fields[update.field] ?? null),
            JSON.stringify(value),
            'AI',
            message.id,
            locked ? 1 : 0,
            locked ? 1 : 0,
            this.clock()
          );
          if (locked) {
            conflict = true;
            continue;
          }
          fields[update.field] = value;
          meta[update.field] = {
            source: 'lead',
            messageId: message.id,
            at: this.clock(),
            locked: false
          };
          skipped.delete(update.field.startsWith('budget') ? 'budget' : update.field);
        }
        validateBudget(fields);
      } catch (error) {
        this.save(leadId, { processed_seq: messages.at(-1).seq });
        this.handoff(leadId, error.code || 'invalid_extraction');
        return { handoff: true };
      }
      for (const unknown of result.unknown) {
        const q = this.settings().questions.find((q) => q.field === unknown.field);
        if (q && !q.required && !known(fields, q.field)) {
          skipped.add(q.field);
          if (q.field === 'budget') {
            fields.budget_min = null;
            fields.budget_max = null;
          } else fields[q.field] = null;
        }
      }
      // Changing an active service cannot silently collide with another active deal.
      if (
        fields.service_type &&
        this.settings().deduplication === 'one_active_per_contact_service' &&
        this.s.get(
          "SELECT id FROM leads WHERE contact_id=? AND service_key=? AND id<>? AND stage NOT IN ('Won','Lost')",
          latest.contact_id,
          fields.service_type,
          leadId
        )
      )
        conflict = true;
      this.save(leadId, {
        fields,
        meta,
        skipped: [...skipped],
        processed_seq: messages.at(-1).seq,
        service_key: fields.service_type || latest.service_key
      });
      if (conflict) {
        this.score(leadId);
        this.handoff(leadId, 'locked_field_conflict');
        return { handoff: true };
      }
      const q =
        latest.current_field === 'email'
          ? { field: 'email', required: true }
          : this.settings().questions.find((q) => q.field === latest.current_field);
      const answered =
        q &&
        (q.field === 'email'
          ? !!this.lead(leadId).email
          : known(fields, q.field) || skipped.has(q.field));
      if (q && !answered && !result.faq_id && (latest.asked[q.field] || 0) >= 3) {
        if (q.required) {
          this.score(leadId);
          this.handoff(leadId, `required_${q.field}_unknown`);
          return { handoff: true };
        }
        skipped.add(q.field);
        if (q.field === 'budget') {
          fields.budget_min = null;
          fields.budget_max = null;
        } else fields[q.field] = null;
        this.save(leadId, { fields, skipped: [...skipped] });
      }
      this.bump(leadId);
      this.score(leadId);
      const faq = result.faq_id ? this.settings().faq.find((f) => f.id === result.faq_id) : null;
      // FAQ answers do not spend a clarification attempt or re-ask the current question.
      if (faq && q && !answered) {
        this.message(leadId, 'AI', faq.answer);
        this.beginWait(leadId, 'qualification_abandoned');
      } else this.askNext(leadId, false, faq ? `${faq.answer} ` : '');
      this.s.audit(
        leadId,
        'qualification_updated',
        { fields: result.updates.map((x) => x.field) },
        'AI',
        undefined,
        this.clock()
      );
      return { updated: true };
    });
  }
  publicState(leadId) {
    const l = this.lead(leadId),
      s = this.settings(),
      appointment = this.s.get(
        "SELECT start_at,end_at,timezone,status FROM appointments WHERE lead_id=? AND status IN ('pending','unknown','confirmed') ORDER BY created_at DESC LIMIT 1",
        leadId
      ),
      booking = this.s.get(
        "SELECT id,state,error_code FROM operations WHERE lead_id=? AND kind='booking' ORDER BY created_at DESC,rowid DESC LIMIT 1",
        leadId
      );
    return {
      company: s.company,
      name: l.name,
      timezone: s.timezone,
      owner: l.owner,
      paused: !!l.paused,
      stopped: !!l.opt_out,
      can_book: mayBook(l, s) && !appointment,
      appointment: appointment || null,
      booking_issue:
        !appointment && booking?.state === 'failed'
          ? {
              id: booking.id,
              message:
                booking.error_code === 'slot_taken'
                  ? 'Sorry, that time was taken before we could confirm your booking. No appointment was created.'
                  : ['stale_booking', 'outside_hours'].includes(booking.error_code)
                    ? 'That time is no longer available for this enquiry. No appointment was created.'
                    : 'We could not confirm your booking. No appointment was created.'
            }
          : null,
      messages: this.s.all(
        'SELECT id,author,body,created_at FROM messages WHERE conversation_id=? ORDER BY seq',
        l.conversation_id
      ),
      demo: this.c.mode === 'demo',
      providers: { llm: this.llm.name, calendar: this.calendar.name, email: this.email.name }
    };
  }
  list(options = {}) {
    allowKeys(options, ['q', 'filter', 'page', 'pageSize']);
    const q = options.q ?? '',
      filter = options.filter ?? 'all',
      pageSize = Number(options.pageSize ?? 50),
      requestedPage = Number(options.page ?? 1);
    ensure(
      typeof q === 'string' && q.length <= 200,
      'invalid_search',
      'Search must be at most 200 characters'
    );
    ensure(
      Number.isSafeInteger(requestedPage) &&
        requestedPage >= 1 &&
        Number.isInteger(pageSize) &&
        pageSize >= 1 &&
        pageSize <= 100,
      'invalid_pagination',
      'Use page >= 1 and pageSize between 1 and 100'
    );
    const filters = {
      all: '1',
      attention: "l.review_reason IS NOT NULL AND l.review_reason<>'' AND c.opt_out=0",
      ai: "l.owner='AI' AND l.paused=0 AND c.opt_out=0 AND (l.review_reason IS NULL OR l.review_reason='') AND l.stage NOT IN ('Booked','Proposal','Won','Lost')",
      human: "l.owner='HUMAN'",
      booked: "l.stage='Booked'",
      waiting: 'l.waiting_at IS NOT NULL'
    };
    ensure(
      typeof filter === 'string' && Object.hasOwn(filters, filter),
      'invalid_filter',
      'Unknown lead filter'
    );
    const from = 'FROM leads l JOIN contacts c ON c.id=l.contact_id';
    const where = `WHERE (${filters[filter]}) AND instr(lower(c.name||' '||coalesce(c.email,'')||' '||coalesce(c.phone,'')||' '||coalesce(json_extract(l.fields,'$.service_type'),'')),lower(?))>0`;
    const total = this.s.get(`SELECT count(*) AS n ${from} ${where}`, q.trim()).n;
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const stats = this.s.get(`SELECT count(*) AS total,
      coalesce(sum(l.stage NOT IN ('Won','Lost')),0) AS open,
      coalesce(sum(${filters.ai}),0) AS ai,
      coalesce(sum(${filters.attention}),0) AS attention,
      coalesce(sum(${filters.booked}),0) AS booked ${from}`);
    const items = this.s
      .all(
        `SELECT l.id ${from} ${where} ORDER BY l.updated_at DESC,l.id DESC LIMIT ? OFFSET ?`,
        q.trim(),
        pageSize,
        (page - 1) * pageSize
      )
      .map((row) => {
        const l = this.lead(row.id);
        return {
          ...l,
          last_message:
            this.s.get(
              'SELECT body,author FROM messages WHERE conversation_id=? ORDER BY seq DESC LIMIT 1',
              l.conversation_id
            ) || null
        };
      });
    return { items, total, page, pageSize, stats };
  }
  profile(leadId) {
    const l = this.lead(leadId);
    return {
      ...l,
      currency: this.rules(l.rule_id).data.currency,
      rule_version: this.rules(l.rule_id).version,
      messages: this.publicState(leadId).messages,
      appointments: this.s.all(
        'SELECT * FROM appointments WHERE lead_id=? ORDER BY created_at DESC',
        leadId
      ),
      revisions: this.s.all(
        'SELECT * FROM field_revisions WHERE lead_id=? ORDER BY created_at DESC',
        leadId
      ),
      evaluations: this.s
        .all(
          'SELECT * FROM score_evaluations WHERE lead_id=? ORDER BY created_at DESC LIMIT 30',
          leadId
        )
        .map((r) => ({ ...r, reasons: parse(r.reasons, []) })),
      timeline: this.s
        .all('SELECT * FROM audit_events WHERE lead_id=? ORDER BY seq DESC LIMIT 150', leadId)
        .map((r) => ({ ...r, details: parse(r.details) })),
      notes: this.s.all('SELECT * FROM notes WHERE lead_id=? ORDER BY created_at DESC', leadId),
      handoffs: this.s.all(
        'SELECT * FROM handoffs WHERE lead_id=? ORDER BY created_at DESC',
        leadId
      ),
      next_action:
        this.s.get(
          "SELECT kind,due_at FROM actions WHERE lead_id=? AND state='pending' ORDER BY due_at LIMIT 1",
          leadId
        ) || null
    };
  }
  control(leadId, command, body, actor) {
    return this.s.tx(() => {
      const l = this.lead(leadId);
      this.cancelPending(leadId, `staff_${command}`);
      if (command === 'takeover') this.bump(leadId, { owner: 'HUMAN', owner_id: actor.id });
      else if (command === 'return-to-ai') {
        ensure(
          !l.review_reason || (typeof body.reason === 'string' && body.reason.trim().length >= 3),
          'resolution_required',
          'Enter a reason resolving the review'
        );
        this.bump(leadId, { owner: 'AI', owner_id: null, review_reason: null });
      } else if (command === 'pause') this.bump(leadId, { paused: 1 });
      else if (command === 'resume') this.bump(leadId, { paused: 0 });
      else if (command === 'restore-consent') {
        ensure(actor.role === 'admin', 'forbidden', 'Administrator required', 403);
        text(body.reason, 1000);
        ensure(body.confirmed === true, 'consent_confirmation_required');
        this.s.run('UPDATE contacts SET opt_out=0,opt_out_at=NULL WHERE id=?', l.contact_id);
        for (const lead of this.s.all('SELECT id FROM leads WHERE contact_id=?', l.contact_id))
          this.bump(lead.id);
      } else if (command === 'stage') {
        ensure(
          ['New', 'Contacted', 'Qualified', 'Booked', 'Proposal', 'Won', 'Lost'].includes(
            body.stage
          ),
          'invalid_stage'
        );
        if (body.stage === 'Lost') text(body.reason, 1000);
        if (body.stage === 'Booked')
          ensure(
            this.s.get(
              "SELECT id FROM appointments WHERE lead_id=? AND status='confirmed'",
              leadId
            ),
            'no_confirmed_appointment',
            'Booked requires a confirmed calendar event',
            409
          );
        this.bump(leadId, {
          stage: body.stage,
          lost_reason: body.stage === 'Lost' ? body.reason : null
        });
      } else if (command === 'assign') {
        ensure(
          this.s.get('SELECT id FROM users WHERE id=? AND active=1', body.userId),
          'user_not_found'
        );
        this.bump(leadId, { owner_id: body.userId });
      } else if (command === 'recalculate') {
        this.bump(leadId, { rule_id: body.ruleId ? this.rules(body.ruleId).id : this.rules().id });
        this.score(leadId);
      } else throw new AppError('invalid_command', 'Unknown action', 404);
      this.s.audit(
        leadId,
        `staff_${command}`,
        { reason: body.reason || null, stage: body.stage || null },
        actor.id,
        undefined,
        this.clock()
      );
      if (['return-to-ai', 'resume'].includes(command)) {
        const updated = this.lead(leadId);
        if (mayAutomate(updated))
          this.enqueue('turn', leadId, `turn:${leadId}:${updated.revision}`, {
            revision: updated.revision
          });
      }
      return this.profile(leadId);
    });
  }
  manualMessage(leadId, body, key, actor) {
    text(body, 4000);
    text(key, 128);
    return this.s.tx(() => {
      const l = this.lead(leadId);
      ensure(!l.opt_out, 'opt_out', 'Contact has opted out. Do not bypass the refusal.', 409);
      const previous = this.s.get(
        'SELECT * FROM messages WHERE conversation_id=? AND client_key=?',
        l.conversation_id,
        key
      );
      if (previous) {
        ensure(
          previous.body === body && previous.author === 'manager',
          'idempotency_conflict',
          undefined,
          409
        );
        return { id: previous.id };
      }
      this.bump(leadId, { owner: 'HUMAN', owner_id: actor.id });
      this.cancelPending(leadId, 'manual_reply');
      const mid = this.message(leadId, 'manager', body, key);
      this.s.audit(leadId, 'manual_reply', { messageId: mid }, actor.id, undefined, this.clock());
      return { id: mid };
    });
  }
  editFields(leadId, body, actor) {
    allowKeys(body, ['fields', 'locked', 'unlock']);
    ensure(
      body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields),
      'invalid_fields'
    );
    return this.s.tx(() => {
      const l = this.lead(leadId),
        fields = { ...l.fields },
        meta = { ...l.meta };
      for (const [field, value] of Object.entries(body.fields)) {
        const v = normalizeField(field, value);
        ensure(
          field !== 'email',
          'contact_change_requires_verification',
          'Contact email cannot be changed through qualification fields'
        );
        fields[field] = v;
        meta[field] = {
          source: 'manager',
          userId: actor.id,
          locked: body.locked !== false,
          at: this.clock()
        };
        this.s.run(
          'INSERT INTO field_revisions(id,lead_id,field,old_value,new_value,actor,locked,created_at) VALUES(?,?,?,?,?,?,?,?)',
          id(),
          leadId,
          field,
          JSON.stringify(l.fields[field] ?? null),
          JSON.stringify(v),
          actor.id,
          body.locked !== false ? 1 : 0,
          this.clock()
        );
      }
      for (const field of body.unlock || []) {
        ensure(FIELDS.includes(field), 'invalid_field');
        meta[field] = { ...meta[field], locked: false };
      }
      validateBudget(fields);
      if (fields.service_type && this.settings().deduplication === 'one_active_per_contact_service')
        ensure(
          !this.s.get(
            "SELECT id FROM leads WHERE contact_id=? AND service_key=? AND id<>? AND stage NOT IN ('Won','Lost')",
            l.contact_id,
            fields.service_type,
            leadId
          ),
          'active_deal_conflict',
          undefined,
          409
        );
      this.bump(leadId, { fields, meta, service_key: fields.service_type || l.service_key });
      this.cancelPending(leadId, 'manual_data_change');
      this.score(leadId);
      this.s.audit(
        leadId,
        'manual_fields',
        { fields: Object.keys(body.fields), unlocked: body.unlock || [] },
        actor.id,
        undefined,
        this.clock()
      );
      return this.profile(leadId);
    });
  }
  addNote(leadId, body, actor) {
    this.lead(leadId);
    text(body, 4000);
    const nid = id();
    this.s.run(
      'INSERT INTO notes(id,lead_id,user_id,body,created_at) VALUES(?,?,?,?,?)',
      nid,
      leadId,
      actor.id,
      body,
      this.clock()
    );
    this.s.audit(leadId, 'note_added', { noteId: nid }, actor.id);
    return { id: nid };
  }
  async availability(leadId, reschedule = false) {
    return operations.availability(this, leadId, reschedule);
  }
  reserve(leadId, key, start, end, appointmentId = null) {
    return operations.reserve(this, leadId, key, start, end, appointmentId);
  }
  book(leadId, offerId, clientKey) {
    return operations.book(this, leadId, offerId, clientKey);
  }
  appointmentAction(appointmentId, kind, body, actor) {
    return operations.appointmentAction(this, appointmentId, kind, body, actor);
  }
  operationStatus(operationId) {
    return operations.operationStatus(this, operationId);
  }
  finishOperation(op, result) {
    return operations.finishOperation(this, op, result);
  }
  failOperation(op, error, unknown) {
    return operations.failOperation(this, op, error, unknown);
  }
  async executeOperation(operationId) {
    return operations.executeOperation(this, operationId);
  }
  async reconcile(operationId) {
    return operations.reconcile(this, operationId);
  }
  async followup(action) {
    return followups.followup(this, action);
  }
  async tick(max = 25) {
    if (this.ticking) return 0;
    this.ticking = true;
    const workerId = id();
    let processed = 0;
    try {
      const expired = this.s.all(
        "SELECT * FROM actions WHERE state='running' AND lease_until<?",
        this.clock()
      );
      for (const a of expired)
        this.s.tx(() => {
          const op = a.operation_id
            ? this.s.get('SELECT * FROM operations WHERE id=?', a.operation_id)
            : null;
          if (op && op.state === 'running') {
            this.failOperation(
              op,
              new AppError('worker_interrupted', 'Worker stopped after dispatch'),
              true
            );
            this.s.run(
              "UPDATE actions SET state='unknown',error_code='worker_interrupted',updated_at=? WHERE id=?",
              this.clock(),
              a.id
            );
          } else if (op && op.state === 'confirmed')
            this.s.run(
              "UPDATE actions SET state='done',updated_at=? WHERE id=?",
              this.clock(),
              a.id
            );
          else
            this.s.run(
              "UPDATE actions SET state='pending',lease_until=NULL,updated_at=? WHERE id=?",
              this.clock(),
              a.id
            );
        });
      while (processed < max) {
        const action = this.s.tx(() => {
          const row = this.s.get(
            "SELECT * FROM actions WHERE state='pending' AND due_at<=? ORDER BY due_at,created_at LIMIT 1",
            this.clock()
          );
          if (!row) return null;
          this.s.run(
            "UPDATE actions SET state='running',attempts=attempts+1,lease_until=?,lease_owner=?,updated_at=? WHERE id=?",
            this.clock() + 90000,
            workerId,
            this.clock(),
            row.id
          );
          return row;
        });
        if (!action) break;
        processed++;
        try {
          if (action.kind === 'turn') await this.turn(action.lead_id);
          else if (action.kind === 'followup') await this.followup(action);
          else await this.executeOperation(action.operation_id);
          this.s.tx(() => {
            const current = this.s.get('SELECT * FROM actions WHERE id=?', action.id);
            if (current.state === 'running') {
              const op = current.operation_id
                ? this.s.get(
                    'SELECT state,error_code FROM operations WHERE id=?',
                    current.operation_id
                  )
                : null;
              this.s.run(
                'UPDATE actions SET state=?,error_code=?,lease_until=NULL,updated_at=? WHERE id=?',
                op && ['unknown', 'failed', 'cancelled'].includes(op.state) ? op.state : 'done',
                op?.error_code || null,
                this.clock(),
                action.id
              );
            }
          });
        } catch (error) {
          this.s.run(
            "UPDATE actions SET state='failed',error_code=?,lease_until=NULL,updated_at=? WHERE id=?",
            error.code || 'action_failed',
            this.clock(),
            action.id
          );
          this.s.audit(action.lead_id, 'action_failed', {
            actionId: action.id,
            code: error.code || 'action_failed'
          });
        }
      }
    } finally {
      this.ticking = false;
    }
    return processed;
  }
  retry(actionId, actor) {
    return operations.retry(this, actionId, actor);
  }
  runs() {
    return {
      actions: this.s.all(
        'SELECT a.id,a.kind,a.lead_id,a.operation_id,a.state,a.attempts,a.due_at,a.created_at,a.updated_at,a.error_code,o.external_id,o.state AS operation_state FROM actions a LEFT JOIN operations o ON o.id=a.operation_id ORDER BY a.created_at DESC LIMIT 250'
      ),
      intake: this.s.all(
        'SELECT id,source,status,reason,lead_id,correlation_id,created_at FROM intake_events ORDER BY created_at DESC LIMIT 100'
      ),
      audit: this.s
        .all('SELECT * FROM audit_events ORDER BY seq DESC LIMIT 100')
        .map((r) => ({ ...r, details: parse(r.details) }))
    };
  }
  requestAccess(address) {
    const normalized = email(address);
    ensure(normalized, 'invalid_email');
    this.s.limit(`access:${hash(normalized)}`, 3, 3600000, this.clock());
    this.s.tx(() => {
      const contact = this.s.get(
        'SELECT * FROM contacts WHERE email=? AND verified_email=1 AND opt_out=0',
        normalized
      );
      if (!contact) return;
      const lead = this.s.get(
        "SELECT id FROM leads WHERE contact_id=? AND stage NOT IN ('Won','Lost') ORDER BY updated_at DESC LIMIT 1",
        contact.id
      );
      if (lead) this.invite(lead.id, `access:${lead.id}:${id()}`, false);
    });
    return {
      message:
        'If an eligible verified conversation exists, a new secure link will be sent. Otherwise please contact our team.'
    };
  }
  demoOutbox() {
    ensure(
      this.c.mode === 'demo',
      'not_available',
      'Mock outbox is available only in demo mode',
      403
    );
    return this.s
      .all('SELECT * FROM outbox ORDER BY created_at DESC LIMIT 100')
      .map((r) => ({ ...r, payload: decrypt(r.payload, this.c.key) }));
  }
}
