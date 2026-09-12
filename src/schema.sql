PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS rule_versions(id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE, data TEXT NOT NULL, content_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager')), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT UNIQUE, verified_email INTEGER NOT NULL DEFAULT 0, opt_out INTEGER NOT NULL DEFAULT 0, opt_out_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS identities(source TEXT NOT NULL, external_id TEXT NOT NULL, contact_id TEXT NOT NULL REFERENCES contacts(id), PRIMARY KEY(source, external_id));
CREATE TABLE IF NOT EXISTS leads(
  id TEXT PRIMARY KEY, contact_id TEXT NOT NULL REFERENCES contacts(id), source TEXT NOT NULL, service_key TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'New', owner TEXT NOT NULL DEFAULT 'AI' CHECK(owner IN ('AI','HUMAN')), owner_id TEXT REFERENCES users(id),
  paused INTEGER NOT NULL DEFAULT 0, review_reason TEXT, lost_reason TEXT,
  revision INTEGER NOT NULL DEFAULT 0, fields TEXT NOT NULL DEFAULT '{}', meta TEXT NOT NULL DEFAULT '{}', asked TEXT NOT NULL DEFAULT '{}', skipped TEXT NOT NULL DEFAULT '[]', current_field TEXT,
  qualification TEXT NOT NULL DEFAULT 'collecting', score INTEGER NOT NULL DEFAULT 0, category TEXT NOT NULL DEFAULT 'Nurture', reasons TEXT NOT NULL DEFAULT '[]', rule_id TEXT NOT NULL REFERENCES rule_versions(id),
  processed_seq INTEGER NOT NULL DEFAULT 0, last_lead_at INTEGER, waiting_at INTEGER, followup_run TEXT, followup_type TEXT, followup_suppressed INTEGER NOT NULL DEFAULT 0,
  first_contact_at INTEGER, first_contact_channel TEXT, first_contact_ms INTEGER, first_contact_status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_contact_stage ON leads(contact_id,stage);
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id));
CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, conversation_id TEXT NOT NULL REFERENCES conversations(id), author TEXT NOT NULL CHECK(author IN ('lead','AI','manager','system')), body TEXT NOT NULL, client_key TEXT, created_at INTEGER NOT NULL, UNIQUE(conversation_id,client_key));
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,seq);
CREATE TABLE IF NOT EXISTS intake_events(id TEXT PRIMARY KEY, source TEXT NOT NULL, event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, reason TEXT, contact_id TEXT REFERENCES contacts(id), lead_id TEXT REFERENCES leads(id), correlation_id TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(source,event_key));
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('staff','visitor')), subject_id TEXT NOT NULL, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS access_tokens(token_hash TEXT PRIMARY KEY, purpose TEXT NOT NULL CHECK(purpose IN ('chat','unsubscribe')), contact_id TEXT NOT NULL REFERENCES contacts(id), lead_id TEXT NOT NULL REFERENCES leads(id), expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE TABLE IF NOT EXISTS field_revisions(id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), field TEXT NOT NULL, old_value TEXT, new_value TEXT, actor TEXT NOT NULL, message_id TEXT, locked INTEGER NOT NULL, proposed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS score_evaluations(id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), rule_id TEXT NOT NULL, inputs TEXT NOT NULL, score INTEGER NOT NULL, category TEXT NOT NULL, reasons TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), user_id TEXT REFERENCES users(id), body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS handoffs(id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), reason TEXT NOT NULL, summary TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS slot_offers(id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), revision INTEGER NOT NULL, settings_revision INTEGER NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS appointments(id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), operation_key TEXT NOT NULL UNIQUE, external_id TEXT UNIQUE, external_url TEXT, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, timezone TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_active ON appointments(lead_id) WHERE status IN ('pending','confirmed','unknown');
CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY, operation_key TEXT NOT NULL UNIQUE, lead_id TEXT NOT NULL REFERENCES leads(id), appointment_id TEXT, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, buffer_ms INTEGER NOT NULL, state TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS reservations_interval ON reservations(state,start_at,end_at);
CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, op_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, lead_id TEXT REFERENCES leads(id), input_hash TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, external_id TEXT, error_code TEXT, created_at INTEGER NOT NULL, started_at INTEGER, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY, action_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, lead_id TEXT REFERENCES leads(id), operation_id TEXT REFERENCES operations(id), data TEXT NOT NULL DEFAULT '{}', state TEXT NOT NULL DEFAULT 'pending', due_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER, lease_owner TEXT, error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS actions_due ON actions(state,due_at);
CREATE TABLE IF NOT EXISTS audit_events(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, lead_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL, correlation_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'audit is append only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'audit is append only'); END;
CREATE TRIGGER IF NOT EXISTS rules_no_update BEFORE UPDATE ON rule_versions BEGIN SELECT RAISE(ABORT,'rules are immutable'); END;
CREATE TRIGGER IF NOT EXISTS rules_no_delete BEFORE DELETE ON rule_versions BEGIN SELECT RAISE(ABORT,'rules are immutable'); END;
CREATE TABLE IF NOT EXISTS calendar_events(id TEXT PRIMARY KEY, operation_key TEXT NOT NULL UNIQUE, lead_id TEXT NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, operation_key TEXT NOT NULL UNIQUE, lead_id TEXT, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS runtime_locks(name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
INSERT OR IGNORE INTO migrations(version,applied_at) VALUES(1,CAST(strftime('%s','now') AS INTEGER)*1000);

CREATE TABLE IF NOT EXISTS app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
