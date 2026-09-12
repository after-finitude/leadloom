export const DEFAULT_SETTINGS = {
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
  bannedTopics: ['weapons', 'illegal drugs', 'money laundering']
};
export function newRules(settings, weights = {}) {
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
