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

export type LeadCategory = 'Hot' | 'Warm' | 'Nurture' | 'Unqualified';
export type LeadStage = 'New' | 'Contacted' | 'Qualified' | 'Booked' | 'Proposal' | 'Won' | 'Lost';

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

export interface TimeInterval {
  start: number;
  end: number;
  buffer?: number;
}
