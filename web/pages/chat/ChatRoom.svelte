<script lang="ts">
  import { api, ApiError, post, pendingKey, clearPending, errorMessage } from '../../lib/api.ts';
  import { ui, run, busy, notify, report, refreshPublic } from '../../lib/workspace.svelte.ts';
  import type { Availability, PublicChat, Slot } from '../../lib/types.ts';
  import Icon from '../../components/Icon.svelte';
  import Messages from '../../components/Messages.svelte';
  import Composer from '../../components/Composer.svelte';
  import AppointmentCard from '../../components/AppointmentCard.svelte';
  let { chat }: { chat: PublicChat } = $props();
  let slots = $state<Slot[] | null>(null);
  let bookingError = $state('');
  let handledBookingIssue = $state('');
  const draftScope = $derived(`visitor:${chat.messages[0]?.id || chat.csrf}`);
  // A failed booking offers fresh times once, without a second click.
  $effect(() => {
    const issue = chat.booking_issue;
    if (!issue || !chat.can_book || busy('booking') || issue.id === handledBookingIssue) return;
    handledBookingIssue = issue.id;
    clearPending('booking');
    slots = null;
    void availability();
  });
  // While the assistant is replying, check for its answer every second instead of every three.
  $effect(() => {
    if (!chat.typing) return;
    const timer = setInterval(() => {
      if (!document.hidden) refreshPublic().catch(report);
    }, 1000);
    return () => clearInterval(timer);
  });
  async function send(body: string) {
    await post('/public/chat/messages', { body, key: pendingKey('visitor-message', body) }, true);
    clearPending('visitor-message');
    slots = null;
  }
  async function loadAvailability() {
    const data = await api<Availability>('/public/chat/availability');
    slots = data.slots;
    await refreshPublic();
    if (!slots.length) notify('No slots found; your enquiry has been passed to the team.');
  }
  async function availability() {
    bookingError = '';
    await run('booking', loadAvailability, (cause) => {
      bookingError = errorMessage(cause);
    });
  }
  async function book(offerId: string) {
    bookingError = '';
    await run(
      'booking',
      async () => {
        try {
          await post(
            '/public/chat/appointments',
            { offerId, key: pendingKey('booking', offerId) },
            true
          );
          clearPending('booking');
          slots = null;
          notify('Your choice is saved. Checking the calendar…');
          await refreshPublic();
        } catch (error) {
          if (
            error instanceof ApiError &&
            ['stale_offer', 'slot_taken'].includes(error.code || '')
          ) {
            slots = null;
            clearPending('booking');
            bookingError =
              error.code === 'slot_taken'
                ? 'Sorry, that time was just taken. Please choose another time below.'
                : 'Those times have expired. Please choose a new time below.';
            await refreshPublic();
            if (ui.chat?.can_book) await loadAvailability();
            return;
          }
          throw error;
        }
      },
      (cause) => {
        bookingError = errorMessage(cause);
      }
    );
  }
</script>

<div class="public-shell">
  <header class="public-header">
    <div class="row">
      <span class="brand-mark">L</span>
      <div>
        <div class="brand">{chat.company}</div>
        <p>Your project enquiry</p>
      </div>
    </div>
    <span class="small muted"><Icon name="lock" /> Private chat</span>
  </header>
  <div class="public-card">
    <div class="public-status">
      <Icon
        name={chat.stopped ? 'pause' : chat.owner === 'HUMAN' ? 'users' : 'spark'}
      />{chat.stopped
        ? 'Automation is stopped. New messages will not restore consent.'
        : chat.owner === 'HUMAN'
          ? 'A team member will continue here during working hours.'
          : chat.paused
            ? 'Automation is paused. Your messages are saved.'
            : 'Your project assistant is here. You can ask for a person at any time.'}
    </div>
    {#if chat.demo && !chat.stopped && (chat.owner === 'HUMAN' || chat.question_pending)}<div
        class="public-status demo-note"
      >
        <Icon name="users" />Demo: no one monitors this chat. In a live setup, a team member replies
        here.
      </div>{/if}
    <Messages messages={chat.messages} name={chat.name} publicView
      >{#if chat.typing}<div class="message typing" role="status">
          <div class="avatar" aria-hidden="true"><Icon name="spark" /></div>
          <div class="message-content">
            <div class="message-bubble">
              <span class="visually-hidden">The assistant is typing</span><span
                class="typing-dots"
                aria-hidden="true"><i></i><i></i><i></i></span
              >
            </div>
          </div>
        </div>{/if}{#if chat.appointment}<AppointmentCard
          appointment={chat.appointment}
          calendar={chat.providers.calendar}
          publicView
        />{/if}</Messages
    >
    {#if chat.booking_issue}<p class="attention" role="alert">
        {chat.booking_issue.message}
      </p>{/if}
    {#if chat.can_book}<div class="slots-panel">
        <h3>Your next step</h3>
        <p>
          {chat.booking_issue ? 'Please choose another time. ' : ''}Times are shown in
          {chat.timezone} and checked again when you book.
        </p>
        {#if bookingError}<p class="form-error" role="alert">{bookingError}</p>{/if}
        {#if slots}<div class="slot-grid">
            {#each slots as slot (slot.id)}<button
                class="slot-button"
                data-book-slot={slot.id}
                disabled={busy('booking')}
                onclick={() => book(slot.id)}><Icon name="calendar" /> {slot.label}</button
              >{/each}
          </div>
          <div class="form-footer">
            <button class="btn" disabled={busy('booking')} onclick={availability}
              >Refresh available times</button
            >
          </div>{:else}<div class="form-footer">
            <button class="btn primary" disabled={busy('booking')} onclick={availability}
              >Choose a consultation time</button
            >
          </div>{/if}
      </div>{/if}
    {#key draftScope}<Composer
        draft={draftScope}
        lock="message"
        label="Your message"
        placeholder="Tell us a little about your project…"
        submitLabel="Send message"
        {send}
        sent={() => refreshPublic().catch(report)}
      >
        {#snippet hint()}<Icon name="lock" /> Private and saved. Type STOP to opt out.{/snippet}
      </Composer>{/key}
  </div>
  <footer class="public-footer">
    Powered by <strong>leadloom</strong>{chat.demo
      ? ' · Demo providers are not real deliveries'
      : ''}
  </footer>
</div>
