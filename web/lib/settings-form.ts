import type { CompanySettings, Replies, ScoringRules } from './types.ts';
import { value, list } from './format.ts';

export const SETTINGS_TABS = ['company', 'questions', 'faq', 'replies', 'followup'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const WEIGHTS = ['service', 'location', 'budget', 'urgency', 'authority'] as const;
export const SEQUENCES = ['qualification_abandoned', 'qualified_not_booked'] as const;
// Label and, where needed, a hint for each chat reply, in the order of a conversation.
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

// Reads one settings tab and returns only the settings that tab edits. `shown` is what the
// form displays, for the question order and FAQ ids.
export function readSettingsTab(
  tab: SettingsTab,
  data: FormData,
  shown: CompanySettings
): Partial<CompanySettings> {
  if (tab === 'company')
    return {
      company: value(data, 'company'),
      timezone: value(data, 'timezone'),
      currency: value(data, 'currency'),
      brandVoice: value(data, 'brandVoice'),
      deduplication: value(data, 'deduplication') as CompanySettings['deduplication'],
      services: list(value(data, 'services')).map((s) => s.toLowerCase()),
      areas: list(value(data, 'areas'), '\n'),
      hours: {
        start: value(data, 'hours_start'),
        end: value(data, 'hours_end'),
        days: [0, 1, 2, 3, 4, 5, 6].filter((day) => data.has(`day_${day}`))
      },
      duration: Number(value(data, 'duration')),
      buffer: Number(value(data, 'buffer')),
      horizon: Number(value(data, 'horizon')),
      minimumNotice: Number(value(data, 'minimumNotice'))
    };
  if (tab === 'questions')
    return {
      questions: shown.questions.map((q, i) => ({
        ...q,
        text: value(data, `question_${i}`),
        required: ['service_type', 'location'].includes(q.field) || data.has(`required_${i}`)
      }))
    };
  if (tab === 'faq')
    return {
      faq: shown.faq.map((faq, i) => ({
        ...faq,
        question: value(data, `faq_question_${i}`),
        answer: value(data, `faq_answer_${i}`),
        keywords: list(value(data, `faq_keywords_${i}`))
      })),
      bannedTopics: list(value(data, 'bannedTopics'), '\n')
    };
  if (tab === 'replies')
    return {
      replies: Object.fromEntries(
        Object.keys(REPLIES).map((key) => [key, value(data, `reply_${key}`)])
      ) as unknown as Replies
    };
  return {
    followup: {
      qualification_abandoned: [0, 1, 2].map((i) =>
        Number(value(data, `qualification_abandoned_${i}`))
      ),
      qualified_not_booked: [0, 1, 2].map((i) => Number(value(data, `qualified_not_booked_${i}`))),
      subject: value(data, 'subject'),
      text: value(data, 'text')
    }
  };
}

export function readScoring(data: FormData, base: ScoringRules): ScoringRules {
  // A JSON copy, because `base` may be a Svelte state proxy that structuredClone rejects.
  const next: ScoringRules = JSON.parse(JSON.stringify(base));
  for (const key of WEIGHTS) next.weights[key] = Number(value(data, key));
  for (const key of ['threshold', 'hot', 'warm'] as const) next[key] = Number(value(data, key));
  return next;
}

// True when a draft differs from the saved values it would replace.
export function changed<T extends object>(
  draft: Partial<T> | null | undefined,
  saved: T | null | undefined
) {
  if (!draft || !saved) return false;
  return Object.entries(draft).some(
    ([key, next]) => JSON.stringify(next) !== JSON.stringify(saved[key as keyof T])
  );
}
