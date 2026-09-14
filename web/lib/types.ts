import type {
  CompanySettings,
  LeadEligibility,
  LeadFields,
  ScoreReason,
  ScoringRules
} from '../../src/types.ts';
export type { CompanySettings, LeadFields, ScoringRules };
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager';
}
export interface Meta {
  demo: boolean;
  services: string[];
  providers: { llm: string; calendar: string; email: string };
}
export interface Message {
  id: string;
  author: 'lead' | 'AI' | 'manager' | 'system';
  body: string;
  created_at: number;
}
export interface Appointment {
  id: string;
  start_at: number;
  end_at: number;
  timezone: string;
  status: string;
  external_id: string | null;
  external_url: string | null;
}
export interface FieldMeta {
  source: string;
  at: number;
  locked: boolean;
}
export interface AuditEvent {
  id: string;
  action: string;
  created_at: number;
  correlation_id: string;
  details: unknown;
}
export interface Lead extends LeadEligibility {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  score: number;
  updated_at: number;
  fields: LeadFields;
  meta: Partial<Record<keyof LeadFields, FieldMeta>>;
  reasons: ScoreReason[];
  currency: string;
  rule_version: number;
  messages: Message[];
  appointments: Appointment[];
  revisions: {
    id: string;
    field: string;
    old_value: string;
    new_value: string;
    proposed: boolean;
    locked: boolean;
    created_at: number;
  }[];
  evaluations: { id: string; score: number; category: string; created_at: number }[];
  timeline: AuditEvent[];
  notes: { id: string; body: string; created_at: number }[];
  handoffs: { id: string; summary: string }[];
  next_action: { kind: string; due_at: number } | null;
  first_contact_ms: number | null;
  first_contact_channel: string | null;
  first_contact_status: string;
  last_message?: { body: string } | null;
}
export type LeadSummary = Pick<
  Lead,
  | 'id'
  | 'name'
  | 'phone'
  | 'email'
  | 'source'
  | 'score'
  | 'updated_at'
  | 'fields'
  | 'owner'
  | 'paused'
  | 'opt_out'
  | 'stage'
  | 'category'
  | 'review_reason'
  | 'last_message'
>;
export interface LeadList {
  items: LeadSummary[];
  total: number;
  page: number;
  pageSize: number;
  stats: { total: number; open: number; ai: number; attention: number; booked: number };
}
export interface PublicChat {
  company: string;
  name: string;
  timezone: string;
  owner: 'AI' | 'HUMAN';
  paused: boolean;
  stopped: boolean;
  can_book: boolean;
  appointment: Pick<Appointment, 'start_at' | 'end_at' | 'timezone' | 'status'> | null;
  messages: Message[];
  demo: boolean;
  providers: { calendar: string; email: string };
  csrf: string;
}
export interface Slot {
  id: string;
  label: string;
}
export interface Availability {
  slots: Slot[];
  timezone: string;
}
export interface Rule {
  id: string;
  data: ScoringRules;
  version: number;
  created_at: number;
  content_hash: string;
}
export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}
export interface OutboxMessage {
  id: string;
  created_at: number;
  payload: { to: string; subject: string; text: string };
}
export interface Runs {
  actions: {
    id: string;
    kind: string;
    error_code: string | null;
    state: string;
    lead_id: string | null;
    attempts: number;
    updated_at: number;
    operation_state: string | null;
    operation_id: string | null;
  }[];
  intake: {
    id: string;
    source: string;
    status: string;
    reason: string | null;
    correlation_id: string;
  }[];
}
export type Modal =
  | { kind: 'fields' | 'stage' | 'note' | 'return-to-ai' | 'restore-consent'; lead: Lead }
  | { kind: 'cancel' | 'reschedule'; appointment: Appointment; slots?: Slot[]; timezone?: string }
  | { kind: 'resolve'; eventId: string; contacts: Contact[] }
  | { kind: 'email'; email: OutboxMessage };
