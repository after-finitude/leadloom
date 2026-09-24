import { ensure, text, email } from './util.mjs';
import type {
  CompanySettings,
  LeadEligibility,
  LeadFields,
  ScoreReason,
  ScoreResult,
  ScoringRules
} from './types.ts';
import { BOOKABLE_CATEGORIES, CLOSED_STAGES, NO_AUTOMATION_STAGES } from './domain.mts';

export const FIELDS: (keyof LeadFields)[] = [
  'service_type',
  'location',
  'budget_min',
  'budget_max',
  'timeline',
  'decision_maker',
  'preferred_contact'
];
export function known(fields: LeadFields, field: keyof LeadFields | 'budget') {
  return field === 'budget'
    ? fields.budget_min != null || fields.budget_max != null
    : fields[field] !== null && fields[field] !== undefined;
}
export function normalizeField(
  field: keyof LeadFields,
  value: unknown
): string | number | boolean | null {
  ensure([...FIELDS, 'email'].includes(field), 'invalid_field');
  if (value === null) return null;
  if (field === 'email') return email(value);
  if (['budget_min', 'budget_max', 'timeline'].includes(field)) {
    ensure(
      typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= (field === 'timeline' ? 1200 : 1000000000),
      'invalid_field_value'
    );
    return value;
  }
  if (field === 'decision_maker') {
    ensure(typeof value === 'boolean', 'invalid_field_value');
    return value;
  }
  const v = text(value, 200);
  if (field === 'preferred_contact')
    ensure(['chat', 'email', 'phone'].includes(v), 'invalid_field_value');
  return field === 'service_type' ? v.toLowerCase() : v;
}
export function validateBudget(fields: LeadFields) {
  ensure(
    fields.budget_min == null ||
      fields.budget_max == null ||
      fields.budget_min <= fields.budget_max,
    'invalid_budget',
    'Minimum budget must not exceed maximum'
  );
}
const matches = (items: string[], value: string | null | undefined) =>
  value == null ? null : items.some((x) => x.toLowerCase() === String(value).trim().toLowerCase());
export function scoreLead(fields: LeadFields, rules: ScoringRules): ScoreResult {
  const reasons: ScoreReason[] = [];
  const add = (
    factor: string,
    value: ScoreReason['value'] | undefined,
    points: number,
    max: number,
    reason: string
  ) => reasons.push({ factor, value: value ?? null, points, max, reason });
  const w = rules.weights;
  const serviceFit = matches(rules.services, fields.service_type);
  const locationFit = matches(rules.areas, fields.location);
  add(
    'Service fit',
    fields.service_type,
    serviceFit ? w.service : 0,
    w.service,
    serviceFit === null
      ? 'Unknown service'
      : serviceFit
        ? 'Supported service'
        : 'Service not supported'
  );
  add(
    'Location fit',
    fields.location,
    locationFit ? w.location : 0,
    w.location,
    locationFit === null
      ? 'Unknown location'
      : locationFit
        ? 'Within service area'
        : 'Outside service area'
  );
  let budget = 0,
    budgetReason = 'Unknown budget';
  if (fields.budget_min != null && fields.budget_min >= rules.threshold) {
    budget = w.budget;
    budgetReason = 'Known lower bound meets demo threshold';
  } else if (fields.budget_max != null && fields.budget_max >= rules.threshold) {
    budget = Math.round(w.budget * 0.4);
    budgetReason = 'Range may meet demo threshold';
  } else if (fields.budget_min != null || fields.budget_max != null)
    budgetReason =
      fields.budget_max != null ? 'Below demo threshold' : 'Only a lower bound is known';
  add(
    'Budget fit',
    known(fields, 'budget')
      ? { min: fields.budget_min ?? null, max: fields.budget_max ?? null }
      : null,
    budget,
    w.budget,
    budgetReason
  );
  const urgency =
    fields.timeline == null
      ? 0
      : fields.timeline <= 3
        ? w.urgency
        : fields.timeline <= 6
          ? Math.round((w.urgency * 2) / 3)
          : Math.round(w.urgency / 3);
  add(
    'Urgency',
    fields.timeline,
    urgency,
    w.urgency,
    fields.timeline == null
      ? 'Unknown timeline'
      : `Conservative upper bound: ${fields.timeline} months`
  );
  add(
    'Decision authority',
    fields.decision_maker,
    fields.decision_maker === true ? w.authority : 0,
    w.authority,
    fields.decision_maker == null
      ? 'Unknown authority'
      : fields.decision_maker
        ? 'Can approve the project'
        : 'Not the decision maker'
  );
  const score = reasons.reduce((sum, r) => sum + r.points, 0);
  const category =
    serviceFit === false || locationFit === false
      ? 'Unqualified'
      : score >= rules.hot
        ? 'Hot'
        : score >= rules.warm
          ? 'Warm'
          : 'Nurture';
  return { score, category, reasons, serviceFit, locationFit };
}
export function mayAutomate(
  lead: Pick<LeadEligibility, 'opt_out' | 'owner' | 'paused' | 'review_reason' | 'stage'>
) {
  return (
    !lead.opt_out &&
    lead.owner === 'AI' &&
    !lead.paused &&
    !lead.review_reason &&
    !NO_AUTOMATION_STAGES.includes(lead.stage)
  );
}
export const maySendAccess = (
  lead: Pick<LeadEligibility, 'email' | 'verified_email' | 'opt_out' | 'stage'>
) => !!lead.email && !!lead.verified_email && !lead.opt_out && !CLOSED_STAGES.includes(lead.stage);
export function mayBook(lead: LeadEligibility, settings: CompanySettings) {
  return (
    mayAutomate(lead) &&
    lead.qualification === 'complete' &&
    BOOKABLE_CATEGORIES.includes(lead.category) &&
    !!lead.email &&
    lead.stage !== 'Booked' &&
    matches(settings.services, lead.fields.service_type) === true &&
    matches(settings.areas, lead.fields.location) === true &&
    settings.questions.filter((q) => q.required).every((q) => known(lead.fields, q.field))
  );
}
// Staff move an already confirmed appointment, so ownership, pause and the Booked stage do not block it.
export function mayReschedule(
  lead: Pick<LeadEligibility, 'category' | 'fields'>,
  settings: CompanySettings
) {
  return (
    BOOKABLE_CATEGORIES.includes(lead.category) &&
    matches(settings.services, lead.fields.service_type) === true &&
    matches(settings.areas, lead.fields.location) === true
  );
}
export function validateSettings(s: CompanySettings): CompanySettings {
  ensure(s && typeof s === 'object' && !Array.isArray(s), 'invalid_settings');
  for (const k of ['company', 'timezone', 'currency', 'brandVoice'] as const)
    text(s[k], k === 'brandVoice' ? 2000 : 200);
  try {
    new Intl.DateTimeFormat('en', { timeZone: s.timezone }).format(new Date());
  } catch {
    ensure(false, 'invalid_timezone');
  }
  ensure(/^[A-Z]{3}$/.test(s.currency), 'invalid_currency');
  for (const k of ['services', 'areas', 'bannedTopics'] as const) {
    ensure(
      Array.isArray(s[k]) && s[k].length <= 100 && (k === 'bannedTopics' || s[k].length > 0),
      'invalid_settings'
    );
    s[k].forEach((x) => text(x, 200));
  }
  ensure(
    s.hours &&
      Array.isArray(s.hours.days) &&
      s.hours.days.length &&
      s.hours.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    'invalid_hours'
  );
  for (const v of [s.hours.start, s.hours.end])
    ensure(/^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'invalid_hours');
  ensure(s.hours.start < s.hours.end, 'invalid_hours', 'Overnight schedules are not supported');
  for (const [key, min, max] of [
    ['duration', 15, 180],
    ['buffer', 0, 120],
    ['horizon', 1, 30],
    ['minimumNotice', 0, 1440]
  ] as const)
    ensure(Number.isInteger(s[key]) && s[key] >= min && s[key] <= max, 'invalid_settings');
  ensure(
    ['one_active_per_contact', 'one_active_per_contact_service'].includes(s.deduplication),
    'invalid_deduplication'
  );
  ensure(
    Array.isArray(s.questions) && s.questions.length >= 2 && s.questions.length <= 6,
    'invalid_questions'
  );
  const seen = new Set();
  for (const q of s.questions) {
    ensure(
      [
        'service_type',
        'location',
        'budget',
        'timeline',
        'decision_maker',
        'preferred_contact'
      ].includes(q.field) && !seen.has(q.field),
      'invalid_questions'
    );
    seen.add(q.field);
    text(q.text, 500);
    ensure(typeof q.required === 'boolean', 'invalid_questions');
    ensure(
      (q.text.match(/\?/g) || []).length === 1,
      'invalid_questions',
      'Each question must have exactly one question mark'
    );
  }
  ensure(
    s.questions.some((q) => q.field === 'service_type' && q.required) &&
      s.questions.some((q) => q.field === 'location' && q.required),
    'critical_questions_required'
  );
  ensure(Array.isArray(s.faq) && s.faq.length <= 30, 'invalid_faq');
  const faqIds = new Set();
  for (const f of s.faq) {
    for (const k of ['id', 'question', 'answer'] as const) text(f[k], 2000);
    ensure(!faqIds.has(f.id), 'duplicate_faq');
    faqIds.add(f.id);
    ensure(Array.isArray(f.keywords) && f.keywords.length <= 20, 'invalid_faq');
    f.keywords.forEach((k) => text(k, 200));
  }
  for (const type of ['qualification_abandoned', 'qualified_not_booked'] as const) {
    const steps = s.followup?.[type];
    ensure(
      Array.isArray(steps) &&
        steps.length === 3 &&
        steps.every(
          (v, i) => Number.isInteger(v) && v >= 1 && v <= 43200 && (i === 0 || v > steps[i - 1])
        ),
      'invalid_followup',
      'Use three ascending delays in minutes'
    );
  }
  text(s.followup.subject, 200);
  text(s.followup.text, 2000);
  return s;
}
export function validateRules(r: ScoringRules): ScoringRules {
  ensure(r && r.weights && Array.isArray(r.services) && Array.isArray(r.areas), 'invalid_rules');
  for (const key of ['service', 'location', 'budget', 'urgency', 'authority'] as const)
    ensure(
      Number.isInteger(r.weights[key]) && r.weights[key] >= 0 && r.weights[key] <= 100,
      'invalid_rules'
    );
  ensure(
    Object.values(r.weights).reduce((a, b) => a + b, 0) === 100,
    'invalid_rules',
    'Weights must sum to 100'
  );
  ensure(Number.isFinite(r.threshold) && r.threshold >= 0 && r.threshold <= 1e9, 'invalid_rules');
  ensure(
    Number.isInteger(r.hot) &&
      Number.isInteger(r.warm) &&
      r.hot <= 100 &&
      r.warm > 0 &&
      r.hot > r.warm,
    'invalid_rules'
  );
  return r;
}
