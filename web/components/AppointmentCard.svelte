<script lang="ts">
  import type { Appointment } from '../lib/types.ts';
  import { appointmentTime } from '../lib/format.ts';
  let {
    appointment,
    calendar,
    publicView = false
  }: {
    appointment: Pick<Appointment, 'start_at' | 'timezone' | 'status'>;
    calendar?: string;
    publicView?: boolean;
  } = $props();
  const title = $derived(
    appointment.status === 'confirmed'
      ? publicView
        ? 'Your consultation is confirmed'
        : 'Consultation booked'
      : appointment.status === 'pending'
        ? publicView
          ? 'Your booking is being processed'
          : 'Booking in progress'
        : publicView
          ? 'Our team is checking your booking'
          : 'Booking needs review'
  );
</script>

<div class="appointment-card">
  <strong>{title}</strong>
  <p>{appointmentTime(appointment.start_at, appointment.timezone)}</p>
  <p>{appointment.timezone} · {calendar} calendar</p>
</div>

<style>
  .appointment-card {
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--appointment-surface);
    padding: 12px;
    color: var(--muted);
  }
  .appointment-card strong {
    font-size: 12px;
    color: var(--ink);
    display: block;
    margin-bottom: 7px;
  }
  .appointment-card p {
    font-size: 12px;
    line-height: 1.6;
  }
</style>
