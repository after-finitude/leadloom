import type { Replies } from './types.ts';

// Lead vocabulary shared by SQL, rules and the browser.
export const STAGES = [
  'New',
  'Contacted',
  'Qualified',
  'Booked',
  'Proposal',
  'Won',
  'Lost'
] as const;
export const CATEGORIES = ['Hot', 'Warm', 'Nurture', 'Unqualified'] as const;
export type LeadStage = (typeof STAGES)[number];
export type LeadCategory = (typeof CATEGORIES)[number];

// A closed deal no longer counts as active for deduplication or access recovery.
export const CLOSED_STAGES: readonly LeadStage[] = ['Won', 'Lost'];
// Automation stops once a proposal is out.
export const NO_AUTOMATION_STAGES: readonly LeadStage[] = ['Proposal', 'Won', 'Lost'];
export const BOOKABLE_CATEGORIES: readonly LeadCategory[] = ['Hot', 'Warm'];

export const LIST_FILTERS = ['all', 'attention', 'ai', 'human', 'booked', 'waiting'] as const;
export type ListFilter = (typeof LIST_FILTERS)[number];

// For the constants above only: renders them as an SQL `IN (...)` list.
export const sqlList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(',');

// Label and, where needed, a hint for each configurable chat reply, in the order of a
// conversation. The settings form shows them and validation errors name the label.
export const REPLIES: Record<keyof Replies, [label: string, hint?: string]> = {
  service_options: [
    'Services on offer',
    'Added to the service question and to the unsupported-service reply. {services} becomes the list.'
  ],
  area_options: [
    'Service area',
    'Added to the location question and to the outside-area reply. {areas} becomes the list.'
  ],
  not_understood: ['Before a repeated question'],
  service_unsupported: ['Service not offered'],
  area_unsupported: ['Location outside the service area'],
  out_of_scope: ['After an unsupported service or location'],
  question_for_team: ['Question the FAQ cannot answer'],
  email_question: ['Asking for an email before booking'],
  ready_to_book: ['Qualification complete, booking available'],
  details_saved: ['Qualification complete, no automatic booking'],
  handoff: ['Conversation passed to the team'],
  booking_confirmed: ['Consultation confirmed', '{time} becomes the date, time and time zone.']
};
