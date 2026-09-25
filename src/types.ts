export interface LeadFields {
  service_type?: string | null;
  location?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  timeline?: number | null;
  decision_maker?: boolean | null;
  preferred_contact?: 'chat' | 'email' | 'phone' | null;
  email?: string | null;
}

export type QuestionField =
  'service_type' | 'location' | 'budget' | 'timeline' | 'decision_maker' | 'preferred_contact';

export interface AvailabilitySettings {
  timezone: string;
  hours: { days: number[]; start: string; end: string };
  duration: number;
  buffer: number;
  horizon: number;
  minimumNotice: number;
}

export interface CompanySettings extends AvailabilitySettings {
  company: string;
  currency: string;
  services: string[];
  areas: string[];
  deduplication: 'one_active_per_contact' | 'one_active_per_contact_service';
  brandVoice: string;
  questions: { field: QuestionField; required: boolean; text: string }[];
  faq: { id: string; question: string; keywords: string[]; answer: string }[];
  followup: {
    qualification_abandoned: number[];
    qualified_not_booked: number[];
    subject: string;
    text: string;
  };
  bannedTopics: string[];
}

export interface ScoringRules {
  services: string[];
  areas: string[];
  threshold: number;
  currency: string;
  weights: {
    service: number;
    location: number;
    budget: number;
    urgency: number;
    authority: number;
  };
  hot: number;
  warm: number;
}

import type { LeadCategory, LeadStage } from './domain.mts';
export type { LeadCategory, LeadStage };

export interface LeadEligibility {
  fields: LeadFields;
  owner: 'AI' | 'HUMAN';
  paused: boolean | 0 | 1;
  opt_out: boolean | 0 | 1;
  verified_email: boolean | 0 | 1;
  review_reason: string | null;
  stage: LeadStage;
  qualification: 'collecting' | 'complete';
  category: LeadCategory;
  email: string | null;
}

export interface ScoreReason {
  factor: string;
  value: string | number | boolean | null | { min: number | null; max: number | null };
  points: number;
  max: number;
  reason: string;
}

export interface ScoreResult {
  score: number;
  category: LeadCategory;
  reasons: ScoreReason[];
  serviceFit: boolean | null;
  locationFit: boolean | null;
}

// Fields the model extracted from one visitor message, validated by validateExtraction.
export interface Extraction {
  updates: { field: string; value: unknown; evidence: string }[];
  unknown: { field: string; evidence: string }[];
  handoff:
    'human_requested' | 'negative_sentiment' | 'outside_faq' | 'banned_topic' | 'ambiguous' | null;
  faq_id: string | null;
}

export interface TimeInterval {
  start: number;
  end: number;
  buffer?: number;
}

// API responses, shared with the browser app through web/lib/types.ts.
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager';
}
export interface Providers {
  llm: string;
  calendar: string;
  email: string;
}
export interface Meta {
  demo: boolean;
  company: string;
  services: string[];
  timezone: string;
  providers: Providers;
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
  messageId?: string;
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
  booking_issue: { id: string; message: string } | null;
  messages: Message[];
  // The assistant has an unanswered visitor message and will reply.
  typing: boolean;
  demo: boolean;
  providers: Providers;
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
  audit: AuditEvent[];
}
