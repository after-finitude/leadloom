<script lang="ts">
  import {
    api,
    ApiError,
    post,
    security,
    pendingKey,
    clearPending,
    errorMessage
  } from '../lib/api.ts';
  import { readDraft, writeDraft } from '../lib/drafts.ts';
  import { ui, run, submit, notify, refreshPublic } from '../lib/workspace.svelte.ts';
  import type { Availability, Slot } from '../lib/types.ts';
  import { appointmentTime, value } from '../lib/format.ts';
  import Field from '../components/Field.svelte';
  import Icon from '../components/Icon.svelte';
  import Messages from '../components/Messages.svelte';
  let body = $state('');
  let slots = $state<Slot[] | null>(null);
  let sendError = $state('');
  let accessError = $state('');
  let bookingError = $state('');
  let handledBookingIssue = $state('');
  let draftSaved = $state(true);
  const unsubscribe = $derived(ui.route === '/unsubscribe');
  const chat = $derived(ui.chat);
  const draftScope = $derived(chat ? `visitor:${chat.messages[0]?.id || chat.csrf}` : '');
  $effect(() => {
    body = draftScope ? readDraft(draftScope) : '';
    sendError = '';
  });
  $effect(() => {
    const issue = chat?.booking_issue;
    if (!issue || !chat?.can_book || ui.busy || issue.id === handledBookingIssue) return;
    handledBookingIssue = issue.id;
    clearPending('booking');
    slots = null;
    void availability();
  });
  function updateDraft(next: string) {
    body = next;
    if (draftScope) draftSaved = writeDraft(draftScope, next);
  }
  async function access() {
    accessError = '';
    await run(
      async () => {
        if (unsubscribe) {
          await post('/public/unsubscribe', { token: ui.token }, true);
          ui.token = null;
          ui.unsubscribed = true;
          return;
        }
        const data = await post<{ csrf: string }>('/public/chat/access', { token: ui.token }, true);
        ui.token = null;
        security.visitor = data.csrf;
        await refreshPublic();
      },
      (cause) => {
        accessError = errorMessage(cause);
      }
    );
  }
  async function send(event: SubmitEvent) {
    sendError = '';
    const sent = await submit(
      event,
      async () => {
        const sent = body;
        if (!sent.trim()) throw new Error('Write a message before sending.');
        await post(
          '/public/chat/messages',
          { body: sent, key: pendingKey('visitor-message', sent) },
          true
        );
        clearPending('visitor-message');
        if (body === sent) updateDraft('');
        slots = null;
      },
      (cause) => {
        sendError = errorMessage(cause);
      }
    );
    if (sent) await run(refreshPublic);
  }
  async function loadAvailability() {
    const data = await api<Availability>('/public/chat/availability');
    slots = data.slots;
    await refreshPublic();
    if (!slots.length) notify('No slots found; your enquiry has been passed to the team.');
  }
  async function availability() {
    bookingError = '';
    await run(loadAvailability, (cause) => {
      bookingError = errorMessage(cause);
    });
  }
  async function book(offerId: string) {
    bookingError = '';
    await run(
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

{#if ui.unsubscribed}
  <div class="access-box">
    <span class="brand-mark">L</span>
    <h2>You’re unsubscribed.</h2>
    <p>Automated outreach is stopped. Any existing appointment remains unchanged.</p>
    <a class="btn" href="/chat">Back to your chat</a>
  </div>
{:else if ui.token || unsubscribe || !chat}
  <div class="public-shell">
    <div class="public-header">
      <a class="brand" href="/enquire"><span class="brand-mark">L</span>leadloom</a><span
        class="small muted">Secure conversation</span
      >
    </div>
    <section class="access-box">
      <span class="brand-mark">L</span>
      <h2>
        {unsubscribe
          ? ui.token
            ? 'Stop automated outreach'
            : 'Unsubscribe link required'
          : ui.token
            ? 'Continue your conversation'
            : 'Welcome to your secure chat'}
      </h2>
      <p>
        {unsubscribe
          ? ui.token
            ? 'Confirm below to stop automated messages. Your existing appointment will not be cancelled.'
            : 'Open the unsubscribe link in your email, or type STOP in your existing chat. No preferences have been changed.'
          : ui.token
            ? 'This private link is exchanged only when you press Continue. Your email preview has not used it.'
            : 'Start a new enquiry or request a fresh link for a previously verified email address.'}
      </p>
      {#if accessError}<p class="form-error" role="alert">{accessError}</p>{/if}
      {#if ui.token}<button class="btn primary large full" disabled={ui.busy} onclick={access}
          >{unsubscribe ? 'Unsubscribe' : 'Continue securely'} <Icon name="lock" /></button
        >{:else if unsubscribe}<a class="btn" href="/chat">Go to your chat</a>{:else}<form
          onsubmit={(event) => {
            accessError = '';
            return submit(
              event,
              async (data) => {
                const result = await post<{ message: string }>(
                  '/public/chat/request-access',
                  { email: value(data, 'email') },
                  true
                );
                notify(result.message);
              },
              (cause) => {
                accessError = errorMessage(cause);
              }
            );
          }}
        >
          <Field label="Email address" name="email" type="email" required /><button
            class="btn primary full"
            disabled={ui.busy}>Request a new link</button
          >
        </form>
        <div class="form-footer">
          <a class="link small" href="/enquire">Start a new enquiry ↗</a>
        </div>{/if}
    </section>
  </div>
{:else}
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
      <Messages messages={chat.messages} name={chat.name} publicView
        >{#if chat.appointment}<div class="appointment-card">
            <strong
              >{chat.appointment.status === 'confirmed'
                ? 'Your consultation is confirmed'
                : chat.appointment.status === 'pending'
                  ? 'Your booking is being processed'
                  : 'Our team is checking your booking'}</strong
            >
            <p>{appointmentTime(chat.appointment.start_at, chat.appointment.timezone)}</p>
            <p>{chat.appointment.timezone} · {chat.providers.calendar} calendar</p>
          </div>{/if}</Messages
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
                  disabled={ui.busy}
                  onclick={() => book(slot.id)}><Icon name="calendar" /> {slot.label}</button
                >{/each}
            </div>
            <div class="form-footer">
              <button class="btn" disabled={ui.busy} onclick={availability}
                >Refresh available times</button
              >
            </div>{:else}<div class="form-footer">
              <button class="btn primary" disabled={ui.busy} onclick={availability}
                >Choose a consultation time</button
              >
            </div>{/if}
        </div>{/if}
      <form class="composer" onsubmit={send}>
        <textarea
          value={body}
          oninput={(event) => updateDraft(event.currentTarget.value)}
          aria-label="Your message"
          aria-invalid={sendError ? 'true' : undefined}
          aria-describedby={sendError ? 'message-error' : undefined}
          placeholder="Tell us a little about your project…"
          maxlength="4000"
          required></textarea>
        {#if sendError}<p id="message-error" class="form-error" role="alert">{sendError}</p>{/if}
        {#if body && !draftSaved}<p class="form-error" role="status">
            Browser storage is unavailable. Keep this tab open to retain your draft.
          </p>{/if}
        <div class="composer-footer">
          <span class="composer-hint"
            ><Icon name="lock" /> Private and saved. Type STOP to opt out.</span
          ><button class="btn primary" type="submit" disabled={ui.busy}
            >Send message <Icon name="send" /></button
          >
        </div>
      </form>
    </div>
    <footer class="public-footer">
      Powered by <strong>leadloom</strong>{chat.demo
        ? ' · Demo providers are not real deliveries'
        : ''}
    </footer>
  </div>
{/if}
