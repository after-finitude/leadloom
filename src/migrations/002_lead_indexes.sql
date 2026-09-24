-- Per-lead lookups used by the profile, queue and booking paths, plus expiry cleanup.
DROP TABLE IF EXISTS runtime_locks;
CREATE INDEX IF NOT EXISTS audit_events_lead ON audit_events(lead_id,seq);
CREATE INDEX IF NOT EXISTS field_revisions_lead ON field_revisions(lead_id,created_at);
CREATE INDEX IF NOT EXISTS score_evaluations_lead ON score_evaluations(lead_id,created_at);
CREATE INDEX IF NOT EXISTS notes_lead ON notes(lead_id,created_at);
CREATE INDEX IF NOT EXISTS handoffs_lead ON handoffs(lead_id,created_at);
CREATE INDEX IF NOT EXISTS appointments_lead ON appointments(lead_id,created_at);
CREATE INDEX IF NOT EXISTS operations_lead ON operations(lead_id,kind,state);
CREATE INDEX IF NOT EXISTS actions_lead ON actions(lead_id,state,due_at);
CREATE INDEX IF NOT EXISTS actions_operation ON actions(operation_id);
CREATE INDEX IF NOT EXISTS reservations_appointment ON reservations(appointment_id);
CREATE INDEX IF NOT EXISTS slot_offers_expiry ON slot_offers(expires_at);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS access_tokens_expiry ON access_tokens(expires_at);
