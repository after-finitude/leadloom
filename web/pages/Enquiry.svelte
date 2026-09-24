<script lang="ts">
  import AuthLayout from '../components/AuthLayout.svelte';
  import Field from '../components/Field.svelte';
  import Icon from '../components/Icon.svelte';
  import {
    ApiError,
    errorMessage,
    errorField,
    post,
    pendingKey,
    clearPending
  } from '../lib/api.ts';
  import { ui, submit, busy, navigate, notify } from '../lib/workspace.svelte.ts';
  import { value } from '../lib/format.ts';
  const services = $derived(ui.meta?.services || []);
  let error = $state('');
  let field = $state('');
  async function save(event: SubmitEvent) {
    error = '';
    field = '';
    await submit(
      event,
      'enquiry',
      async (data) => {
        const payload = {
          name: value(data, 'name'),
          email: value(data, 'email'),
          phone: value(data, 'phone'),
          service_type: value(data, 'service_type')
        };
        if (!payload.email.trim() && !payload.phone.trim())
          throw new ApiError({ reason: 'contact_required' }, 400);
        // The same form contents reuse one event key, so a retry cannot open a second lead.
        const result = await post<{ status: string; message?: string; reason?: string }>(
          '/public/intake',
          { ...payload, event_key: pendingKey('intake', JSON.stringify(payload)) },
          true
        );
        if (result.status === 'accepted') {
          clearPending('intake');
          navigate('/chat');
        } else if (result.status === 'access_required') {
          notify(result.message || 'Use your secure chat link.');
          navigate('/chat');
        } else throw new ApiError({ reason: result.reason, message: result.message }, 400);
      },
      (cause) => {
        error = errorMessage(cause);
        field = errorField(cause);
      }
    );
  }
</script>

<AuthLayout
  eyebrow={ui.meta?.company || ''}
  description="Tell us what you have in mind. We’ll ask a few questions, find the right next step, and help you arrange a consultation."
  formTitle="Let’s talk about your project."
  formDescription="A few details to get started. Your conversation is private and saved as you go."
>
  {#snippet headline()}Your next project<br />starts here.{/snippet}
  {#snippet hero()}<div class="enquiry-services">
      {#each services as service (service)}<span>{service}</span>{/each}
    </div>{/snippet}
  {#snippet footer()}<Icon name="lock" /> Secure chat · No unsolicited outreach{/snippet}
  <form onsubmit={save}>
    <Field label="Your name" name="name" /><Field
      label="Email address"
      name="email"
      type="email"
      error={field === 'email' ? error : ''}
    />
    <Field
      label="Phone (optional, international format)"
      name="phone"
      type="tel"
      error={field === 'phone' ? error : ''}
    />
    <div class="field">
      <label for="service_type">What are you planning?</label><select
        name="service_type"
        id="service_type"
        ><option value="">I’ll tell you in the chat</option
        >{#each services as service (service)}<option value={service}
            >{service[0].toUpperCase() + service.slice(1)}</option
          >{/each}</select
      >
    </div>
    {#if error && !field}<p class="form-error" role="alert">{error}</p>{/if}
    <button type="submit" class="btn primary large full" disabled={busy('enquiry')}
      >Start my conversation <Icon name="arrow" /></button
    >
  </form>
</AuthLayout>

<style>
  .enquiry-services {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 25px;
  }
  .enquiry-services span {
    color: var(--ink);
    padding: 7px 0;
    margin-right: 12px;
    font-size: 12px;
  }
</style>
