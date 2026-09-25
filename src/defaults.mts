import type { CompanySettings, ScoringRules } from './types.ts';

export const DEFAULT_SETTINGS: CompanySettings = {
  company: 'Acme Home Improvements',
  timezone: 'Etc/UTC',
  currency: 'USD',
  services: ['roofing', 'extensions', 'pool installation', 'concrete works'],
  areas: ['Demo City A', 'Demo City B'],
  hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
  duration: 30,
  buffer: 15,
  horizon: 14,
  minimumNotice: 30,
  deduplication: 'one_active_per_contact',
  brandVoice: 'Warm, helpful and concise. Do not quote prices or guarantees.',
  questions: [
    {
      field: 'service_type',
      required: true,
      text: 'What home improvement service are you looking for?'
    },
    { field: 'location', required: true, text: 'Which city will the work take place in?' },
    { field: 'budget', required: false, text: 'What budget range in USD do you have in mind?' },
    { field: 'timeline', required: false, text: 'When would you like to start the project?' },
    {
      field: 'decision_maker',
      required: false,
      text: 'Are you the person who will approve the project?'
    }
  ],
  faq: [
    {
      id: 'services',
      question: 'What services do you offer?',
      keywords: ['services do you', 'what do you offer'],
      answer: 'We help with roofing, extensions, pool installation and concrete works.'
    },
    {
      id: 'hours',
      question: 'What are your opening hours?',
      keywords: ['opening hours', 'working hours', 'when are you open'],
      answer: 'Our team works Monday to Friday, 9 am to 6 pm in the company time zone.'
    },
    {
      id: 'consultation',
      question: 'How long is a consultation?',
      keywords: ['how long is', 'consultation length'],
      answer: 'An initial consultation takes 30 minutes.'
    }
  ],
  followup: {
    qualification_abandoned: [60, 1440, 4320],
    qualified_not_booked: [1440, 4320, 10080],
    subject: 'Your home improvement enquiry',
    text: 'Ready to continue? You can return to your secure conversation using the link below.'
  },
  bannedTopics: ['weapons', 'illegal drugs', 'money laundering'],
  replies: {
    not_understood: "Sorry, I didn't catch that.",
    service_options: 'We offer {services}.',
    area_options: 'We currently work in {areas}.',
    service_unsupported: 'Sorry, that is not a service we offer.',
    area_unsupported: 'Sorry, that location is outside our service area.',
    out_of_scope:
      'If your project fits, just tell me and we will continue. Otherwise your enquiry is saved for our team.',
    question_for_team:
      'I cannot answer that here, so I have passed your question to our team. A team member will reply in this chat.',
    email_question: 'What email address should we use for your consultation details?',
    ready_to_book:
      'Thanks — I have the project details. Use “Choose a consultation time” below to see current availability.',
    details_saved:
      'Thank you — your project details are saved. Our team can review the next steps with you.',
    handoff:
      'Your conversation has been passed to our team. A team member will continue here during working hours.',
    booking_confirmed: 'Your consultation is confirmed for {time}.'
  }
};
export function newRules(
  settings: CompanySettings,
  weights: Partial<ScoringRules['weights']> = {}
): ScoringRules {
  return {
    services: settings.services,
    areas: settings.areas,
    threshold: 10000,
    currency: settings.currency,
    weights: { service: 25, location: 25, budget: 25, urgency: 15, authority: 10, ...weights },
    hot: 80,
    warm: 60
  };
}
