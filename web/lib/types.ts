import type { Appointment, Contact, Lead, OutboxMessage, Slot } from '../../src/types.ts';
export type * from '../../src/types.ts';
export type Modal =
  | { kind: 'fields' | 'stage' | 'note' | 'return-to-ai' | 'restore-consent'; lead: Lead }
  | { kind: 'cancel' | 'reschedule'; appointment: Appointment; slots?: Slot[]; timezone?: string }
  | { kind: 'resolve'; eventId: string; contacts: Contact[] }
  | { kind: 'email'; email: OutboxMessage };
