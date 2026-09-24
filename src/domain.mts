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
