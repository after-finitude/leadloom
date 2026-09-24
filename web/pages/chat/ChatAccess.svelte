<script lang="ts">
  import { post, security, errorMessage } from '../../lib/api.ts';
  import { ui, run, busy, submit, notify, refreshPublic } from '../../lib/workspace.svelte.ts';
  import { value } from '../../lib/format.ts';
  import Field from '../../components/Field.svelte';
  import Icon from '../../components/Icon.svelte';
  const unsubscribe = $derived(ui.route === '/unsubscribe');
  let error = $state('');
  // The emailed token is exchanged only on an explicit click, never by a link preview.
  async function access() {
    error = '';
    await run(
      'access',
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
        error = errorMessage(cause);
      }
    );
  }
  async function requestLink(event: SubmitEvent) {
    error = '';
    await submit(
      event,
      'access',
      async (data) => {
        const result = await post<{ message: string }>(
          '/public/chat/request-access',
          { email: value(data, 'email') },
          true
        );
        notify(result.message);
      },
      (cause) => {
        error = errorMessage(cause);
      }
    );
  }
</script>

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
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    {#if ui.token}<button class="btn primary large full" disabled={busy('access')} onclick={access}
        >{unsubscribe ? 'Unsubscribe' : 'Continue securely'} <Icon name="lock" /></button
      >{:else if unsubscribe}<a class="btn" href="/chat">Go to your chat</a>{:else}<form
        onsubmit={requestLink}
      >
        <Field label="Email address" name="email" type="email" required /><button
          class="btn primary full"
          disabled={busy('access')}>Request a new link</button
        >
      </form>
      <div class="form-footer">
        <a class="link small" href="/enquire">Start a new enquiry ↗</a>
      </div>{/if}
  </section>
</div>
