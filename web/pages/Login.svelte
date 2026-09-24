<script lang="ts">
  import AuthLayout from '../components/AuthLayout.svelte';
  import Field from '../components/Field.svelte';
  import Icon from '../components/Icon.svelte';
  import { errorMessage, post, security } from '../lib/api.ts';
  import { ui, submit, busy, navigate } from '../lib/workspace.svelte.ts';
  import { value } from '../lib/format.ts';
  let error = $state('');
  async function save(event: SubmitEvent) {
    error = '';
    await submit(
      event,
      'login',
      async (data) => {
        const result = await post<{ csrf: string }>('/auth/login', {
          email: value(data, 'email'),
          password: value(data, 'password')
        });
        security.staff = result.csrf;
        navigate('/');
      },
      (cause) => {
        error = errorMessage(cause);
      }
    );
  }
</script>

<AuthLayout
  eyebrow="Leadloom workspace"
  description="Qualify enquiries, reply to clients and book consultations from one workspace."
  formTitle="Welcome back."
  formDescription="Sign in to your workspace and pick up where the conversation left off."
>
  {#snippet headline()}Every enquiry.<br />A clear next step.{/snippet}
  {#snippet hero()}<div class="hero-mini">
      <div class="avatar"><Icon name="spark" /></div>
      <div>
        <strong class="small">Your team stays in control.</strong>
        <p>Review the details, take over a conversation or pause automation at any time.</p>
      </div>
    </div>{/snippet}
  {#snippet footer()}Visiting as a customer? <a class="link" href="/enquire">Start an enquiry ↗</a
    >{/snippet}
  <form onsubmit={save}>
    <Field label="Email address" name="email" type="email" required /><Field
      label="Password"
      name="password"
      type="password"
      required
    />
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    <button type="submit" class="btn primary large full" disabled={busy('login')}
      >Sign in to workspace <Icon name="arrow" /></button
    >
  </form>
  {#if ui.meta?.demo}<div class="demo-credentials">
      <strong>Demo workspace</strong><br />Sign in with the credentials provided by your
      administrator.<br />Providers: AI {ui.meta.providers.llm}, calendar {ui.meta.providers
        .calendar}, email {ui.meta.providers.email}. Mock meetings stay in this demo; mock emails
      appear in Outbox.
    </div>{/if}
</AuthLayout>
