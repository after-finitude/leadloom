import { DEFAULT_SETTINGS, newRules } from '../src/defaults.mts';
import { scoreLead, mayAutomate } from '../src/rules.mts';
import { overlaps } from '../src/time.mts';

// Compiled by typecheck, never executed. Unused @ts-expect-error directives fail the check.
export function rejectedContracts() {
  const rules = newRules(DEFAULT_SETTINGS);
  // @ts-expect-error Budget must be numeric, not text from an unvalidated request.
  scoreLead({ budget_min: '10000' }, rules);
  // @ts-expect-error Decision authority must be boolean or unknown.
  scoreLead({ decision_maker: 'yes' }, rules);
  // @ts-expect-error Persisted timestamps must be numbers.
  overlaps({ start: '2026-09-14', end: 1000 }, { start: 2000, end: 3000 });
  // @ts-expect-error Only AI or HUMAN may own automation.
  mayAutomate({ owner: 'BOT', stage: 'New', paused: 0, opt_out: 0, review_reason: null });
}
