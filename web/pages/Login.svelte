<script lang="ts">
  import Field from '../components/Field.svelte';
  import Icon from '../components/Icon.svelte';
  import { ApiError, errorMessage, post, security, pendingKey, clearPending } from '../lib/api.ts';
  import { ui, submit, navigate, notify } from '../lib/workspace.svelte.ts';
  import { value } from '../lib/format.ts';
  let { enquiry = false }: { enquiry?: boolean } = $props();
  const services = $derived(ui.meta?.services || []);
  let error = $state('');
  let errorField = $state('');
  async function save(event: SubmitEvent) {
    error = '';
    errorField = '';
    await submit(
      event,
      async (data) => {
        if (!enquiry) {
          const result = await post<{ csrf: string }>('/auth/login', {
            email: value(data, 'email'),
            password: value(data, 'password')
          });
          security.staff = result.csrf;
          navigate('/');
          return;
        }
        const payload = {
          name: value(data, 'name'),
          email: value(data, 'email'),
          phone: value(data, 'phone'),
          service_type: value(data, 'service_type')
        };
        if (!payload.email.trim() && !payload.phone.trim()) {
          throw new ApiError({ reason: 'contact_required' }, 400);
        }
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
        errorField =
          cause instanceof ApiError
            ? cause.code === 'invalid_phone'
              ? 'phone'
              : ['invalid_email', 'contact_required'].includes(cause.code || '')
                ? 'email'
                : ''
            : '';
      }
    );
  }
</script>

<div class="login-layout">
  <section class="login-hero">
    <a href="/" class="brand"><span class="brand-mark">L</span>leadloom</a>
    <div class="hero-copy">
      <p class="eyebrow">{enquiry ? 'Acme Home Improvements' : 'Leadloom workspace'}</p>
      <h1>
        {#if enquiry}Your next project<br />starts here.{:else}Every enquiry.<br />A clear next
          step.{/if}
      </h1>
      <p>
        {enquiry
          ? 'Tell us what you have in mind. We’ll ask a few questions, find the right next step, and help you arrange a consultation.'
          : 'Qualify enquiries, reply to clients and book consultations from one workspace.'}
      </p>
      {#if enquiry}<div class="enquiry-services">
          {#each services as service (service)}<span>{service}</span>{/each}
        </div>{:else}<div class="hero-mini">
          <div class="avatar"><Icon name="spark" /></div>
          <div>
            <strong class="small">Your team stays in control.</strong>
            <p>Review the details, take over a conversation or pause automation at any time.</p>
          </div>
        </div>{/if}
    </div>
    <div class="hero-footer"><span>Enquiries · Conversations · Consultations</span></div>
  </section>
  <section class="login-form-side">
    <div class="login-form">
      <h2>{enquiry ? 'Let’s talk about your project.' : 'Welcome back.'}</h2>
      <p>
        {enquiry
          ? 'A few details to get started. Your conversation is private and saved as you go.'
          : 'Sign in to your workspace and pick up where the conversation left off.'}
      </p>
      <form onsubmit={save}>
        {#if enquiry}<Field label="Your name" name="name" />{/if}<Field
          label="Email address"
          name="email"
          type="email"
          required={!enquiry}
          error={errorField === 'email' ? error : ''}
        />
        {#if enquiry}<Field
            label="Phone (optional, international format)"
            name="phone"
            type="tel"
            error={errorField === 'phone' ? error : ''}
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
          </div>{:else}<Field label="Password" name="password" type="password" required />{/if}
        {#if error && !errorField}<p class="form-error" role="alert">{error}</p>{/if}
        <button type="submit" class="btn primary large full" disabled={ui.busy}
          >{enquiry ? 'Start my conversation' : 'Sign in to workspace'}
          <Icon name="arrow" /></button
        >
      </form>
      {#if !enquiry && ui.meta?.demo}<div class="demo-credentials">
          <strong>Demo workspace</strong><br />Sign in with the credentials provided by your
          administrator.<br />Providers: AI {ui.meta.providers.llm}, calendar {ui.meta.providers
            .calendar}, email {ui.meta.providers.email}. Mock meetings stay in this demo; mock
          emails appear in Outbox.
        </div>{/if}
      <p class="login-footer">
        {#if enquiry}<Icon name="lock" /> Secure chat · No unsolicited outreach{:else}Visiting as a
          customer? <a class="link" href="/enquire">Start an enquiry ↗</a>{/if}
      </p>
    </div>
  </section>
</div>
