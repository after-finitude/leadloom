import type { LeadFields } from './types.ts';
import { value } from './format.ts';

export const EDITABLE_FIELDS = [
  'service_type',
  'location',
  'budget_min',
  'budget_max',
  'timeline',
  'decision_maker',
  'preferred_contact'
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];
type FieldValue = string | number | boolean | null;

// Reads the "Project details" form: blank means unknown, and only fields whose value
// differs from the lead are sent, so untouched fields keep their source and lock.
export function diffLeadFields(current: LeadFields, data: FormData) {
  const fields: Partial<Record<EditableField, FieldValue>> = {},
    unlock: EditableField[] = [];
  for (const field of EDITABLE_FIELDS) {
    const raw = value(data, field),
      next: FieldValue =
        raw === ''
          ? null
          : ['budget_min', 'budget_max', 'timeline'].includes(field)
            ? Number(raw)
            : field === 'decision_maker'
              ? raw === 'true'
              : raw;
    if (JSON.stringify(current[field] ?? null) !== JSON.stringify(next)) fields[field] = next;
    if (data.has(`unlock_${field}`)) unlock.push(field);
  }
  return { fields, unlock };
}
