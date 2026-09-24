import {
  id,
  hash,
  stable,
  encrypt,
  decrypt,
  text,
  email,
  phone,
  ensure,
  allowKeys
} from './util.mjs';
import { mayAutomate } from './rules.mts';
import { CLOSED_STAGES, sqlList } from './domain.mts';
import { score } from './qualification.mjs';
import { remindIfBookable } from './followups.mjs';
import { askNext, invite, handoff } from './conversation.mjs';

// Accepts an enquiry idempotently by (source, event_key). Matches or creates the contact,
// reuses the open deal or opens a new lead, and starts the chat or email outreach.
// Ambiguous matches are parked for staff instead of being merged.
export function intake(
  ctx,
  payload,
  { source = 'web_form', web = true, sessionLead = null, resolvedContactId = null } = {}
) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    payload = { invalid_payload: payload ?? null };
  const now = ctx.clock(),
    eventKey =
      typeof payload.event_key === 'string' && payload.event_key.length <= 128
        ? payload.event_key
        : `invalid:${hash(stable(payload))}`,
    sourceKey = String(source).slice(0, 64),
    digest = hash(stable(payload));
  return ctx.store.tx(() => {
    const previous = ctx.store.get(
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
      return intakeResponse(ctx, previous, web, sessionLead, false);
    }
    const event = {
      id: previous?.id || id(),
      correlation: previous?.correlation_id || id(),
      source: sourceKey,
      now
    };
    let v, validationError;
    try {
      v = validate(payload, sourceKey);
    } catch (error) {
      validationError = error;
    }
    if (!previous)
      ctx.store.run(
        'INSERT INTO intake_events(id,source,event_key,payload_hash,payload,status,reason,correlation_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        event.id,
        sourceKey,
        eventKey,
        digest,
        encrypt(payload, ctx.config.key),
        validationError ? 'rejected' : 'processing',
        validationError?.code || null,
        event.correlation,
        now
      );
    if (validationError) {
      audit(ctx, event, null, 'intake_rejected', {
        eventId: event.id,
        reason: validationError.code
      });
      return {
        status: 'rejected',
        reason: validationError.code,
        eventId: event.id,
        correlation_id: event.correlation
      };
    }
    const matches = matchContacts(ctx, v, sourceKey);
    if (matches.size > 1 && !resolvedContactId)
      return needsResolution(ctx, event, 'contact_conflict');
    let contact = resolvedContactId
        ? ctx.store.get('SELECT * FROM contacts WHERE id=?', resolvedContactId)
        : [...matches.values()][0],
      newContact = !contact;
    if (resolvedContactId) ensure(contact, 'contact_not_found', 'Contact not found', 404);
    if (!contact) contact = createContact(ctx, v, now);
    if (v.externalId && !linkIdentity(ctx, sourceKey, v.externalId, contact.id))
      return needsResolution(ctx, event, 'external_identity_conflict');
    // Never overwrite the trusted contact channels based on public deduplication.
    let active = ctx.store.all(
      `SELECT id,service_key FROM leads WHERE contact_id=? AND stage NOT IN (${sqlList(CLOSED_STAGES)}) ORDER BY created_at DESC`,
      contact.id
    );
    if (ctx.workspace.settings().deduplication === 'one_active_per_contact_service') {
      if (v.service) active = active.filter((l) => l.service_key === v.service || !l.service_key);
      if (active.length > 1) return needsResolution(ctx, event, 'ambiguous_active_deal');
    }
    let leadId = active[0]?.id;
    if (leadId) audit(ctx, event, leadId, 're_engaged', { eventId: event.id });
    else leadId = openLead(ctx, event, contact, v, web && newContact);
    ctx.store.run(
      "UPDATE intake_events SET status='accepted',reason=NULL,contact_id=?,lead_id=? WHERE id=?",
      contact.id,
      leadId,
      event.id
    );
    const row = ctx.store.get('SELECT * FROM intake_events WHERE id=?', event.id);
    const response = intakeResponse(ctx, row, web, sessionLead, newContact);
    // A returning visitor gets a secure link instead of a session for someone else's chat.
    if (web && !newContact && sessionLead !== leadId) {
      if (contact.verified_email && !contact.opt_out && mayAutomate(ctx.leads.get(leadId)))
        invite(ctx, leadId);
    }
    return response;
  });
}

function validate(payload, sourceKey) {
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
  const v = {
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
  return v;
}

function audit(ctx, event, leadId, action, details) {
  ctx.audit.add(leadId, action, details, {
    actor: 'source',
    correlation: event.correlation,
    at: event.now
  });
}

function needsResolution(ctx, event, reason) {
  ctx.store.run(
    "UPDATE intake_events SET status='needs_resolution',reason=? WHERE id=?",
    reason,
    event.id
  );
  audit(ctx, event, null, 'intake_needs_resolution', { eventId: event.id, reason });
  return { status: 'needs_resolution', eventId: event.id, correlation_id: event.correlation };
}

// Contacts matching any trusted channel: email, phone or the source's external id.
function matchContacts(ctx, v, sourceKey) {
  const matches = new Map();
  for (const [column, value] of [
    ['email', v.email],
    ['phone', v.phone]
  ])
    if (value) {
      const contact = ctx.store.get(`SELECT * FROM contacts WHERE ${column}=?`, value);
      if (contact) matches.set(contact.id, contact);
    }
  if (v.externalId) {
    const existing = ctx.store.get(
      'SELECT c.* FROM identities i JOIN contacts c ON c.id=i.contact_id WHERE i.source=? AND i.external_id=?',
      sourceKey,
      v.externalId
    );
    if (existing) matches.set(existing.id, existing);
  }
  return matches;
}

function createContact(ctx, v, now) {
  const cid = id();
  ctx.store.run(
    'INSERT INTO contacts(id,name,email,phone,created_at) VALUES(?,?,?,?,?)',
    cid,
    v.name,
    v.email,
    v.phone,
    now
  );
  return ctx.store.get('SELECT * FROM contacts WHERE id=?', cid);
}

// Returns false when the external id already belongs to another contact.
function linkIdentity(ctx, sourceKey, externalId, contactId) {
  const identity = ctx.store.get(
    'SELECT * FROM identities WHERE source=? AND external_id=?',
    sourceKey,
    externalId
  );
  if (identity && identity.contact_id !== contactId) return false;
  ctx.store.run(
    'INSERT OR IGNORE INTO identities(source,external_id,contact_id) VALUES(?,?,?)',
    sourceKey,
    externalId,
    contactId
  );
  return true;
}

// Opens a lead and picks the first channel: the web chat for a new visitor, email for a
// known address, otherwise a person.
function openLead(ctx, event, contact, v, chat) {
  const leadId = id();
  ctx.store.run(
    'INSERT INTO leads(id,contact_id,source,service_key,fields,rule_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    leadId,
    contact.id,
    event.source,
    v.service,
    JSON.stringify(v.service ? { service_type: v.service } : {}),
    ctx.workspace.rules().id,
    event.now,
    event.now
  );
  ctx.store.run('INSERT INTO conversations(id,lead_id) VALUES(?,?)', id(), leadId);
  remindIfBookable(ctx, score(ctx, leadId));
  audit(ctx, event, leadId, 'intake_accepted', { eventId: event.id, source: event.source });
  if (contact.opt_out) {
    ctx.leads.update(leadId, {
      first_contact_status: 'not_applicable',
      review_reason: 'opt_out',
      owner: 'HUMAN'
    });
  } else if (chat) {
    askNext(ctx, leadId, true);
  } else if (contact.email) {
    askNext(ctx, leadId, false);
    invite(ctx, leadId);
  } else {
    handoff(ctx, leadId, 'no_automated_channel');
    ctx.leads.update(leadId, { first_contact_status: 'not_applicable' });
  }
  return leadId;
}

function intakeResponse(ctx, row, web, sessionLead, newContact) {
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
      session: ctx.auth.create('visitor', row.lead_id),
      leadId: row.lead_id
    };
  if (row.status === 'rejected') return { status: 'rejected', reason: row.reason };
  return {
    status: 'access_required',
    message:
      'Your enquiry has been received. Use your existing chat or a secure link sent to your verified email. Our team can help with access.'
  };
}

export function resolveIntake(ctx, eventId, contactId, actor) {
  const row = ctx.store.get(
    "SELECT * FROM intake_events WHERE id=? AND status='needs_resolution'",
    eventId
  );
  ensure(row, 'intake_not_pending', 'Intake is not awaiting resolution', 409);
  const result = intake(ctx, decrypt(row.payload, ctx.config.key), {
    source: row.source,
    web: false,
    resolvedContactId: contactId
  });
  ctx.audit.add(result.leadId || null, 'intake_resolved', { eventId, contactId }, { actor });
  return result;
}

// Always answers the same way, so the response does not reveal whether an address is known.
export function requestAccess(ctx, address) {
  const normalized = email(address);
  ensure(normalized, 'invalid_email');
  ctx.store.limit(`access:${hash(normalized)}`, 3, 3600000, ctx.clock());
  ctx.store.tx(() => {
    const contact = ctx.store.get(
      'SELECT * FROM contacts WHERE email=? AND verified_email=1 AND opt_out=0',
      normalized
    );
    if (!contact) return;
    const lead = ctx.store.get(
      `SELECT id FROM leads WHERE contact_id=? AND stage NOT IN (${sqlList(CLOSED_STAGES)}) ORDER BY updated_at DESC LIMIT 1`,
      contact.id
    );
    if (lead) invite(ctx, lead.id, `access:${lead.id}:${id()}`, false);
  });
  return {
    message:
      'If an eligible verified conversation exists, a new secure link will be sent. Otherwise please contact our team.'
  };
}
