<script lang="ts">
  import { untrack } from 'svelte';
  import type { Rule, ScoringRules } from '../../lib/types.ts';
  import { post, errorMessage } from '../../lib/api.ts';
  import { submit, busy, notify } from '../../lib/workspace.svelte.ts';
  import { dateTime } from '../../lib/format.ts';
  import { WEIGHTS, readScoring } from '../../lib/settings-form.ts';
  import Field from '../Field.svelte';
  let {
    rules,
    draft = $bindable(),
    onpublished
  }: {
    rules: Rule[];
    // Unpublished edits; kept by the page so they survive tab switches.
    draft: ScoringRules | null;
    onpublished: () => Promise<void>;
  } = $props();
  // Read once: re-rendering from the draft on each keystroke would rewrite the input.
  const shown = untrack(() => draft ?? rules[0]?.data);
  let error = $state('');
  async function publish(event: SubmitEvent) {
    error = '';
    await submit(
      event,
      'settings',
      async (data) => {
        await post('/rules', readScoring(data, rules[0].data));
        draft = null;
        await onpublished();
        notify('New rules version published');
      },
      (cause) => {
        error = errorMessage(cause);
      }
    );
  }
</script>

{#if shown}<form
    onsubmit={publish}
    oninput={(event) => {
      draft = readScoring(new FormData(event.currentTarget), rules[0].data);
    }}
  >
    <h2>Explain every score</h2>
    <p class="description">
      Publish a new immutable version. Existing leads keep their current rules until you explicitly
      recalculate them.
    </p>
    <div class="form-grid">
      {#each WEIGHTS as key (key)}<Field
          label={`${key[0].toUpperCase() + key.slice(1)} weight`}
          name={key}
          type="number"
          value={shown.weights[key]}
        />{/each}<Field
        label="Demo budget threshold"
        name="threshold"
        type="number"
        value={shown.threshold}
      /><Field label="Hot threshold" name="hot" type="number" value={shown.hot} /><Field
        label="Warm threshold"
        name="warm"
        type="number"
        value={shown.warm}
      />
    </div>
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    <div class="form-footer">
      <button class="btn primary" disabled={busy('settings')}
        >Publish rules v{(rules[0]?.version || 0) + 1}</button
      >
    </div>
  </form>{/if}
<hr class="form-divider" />
<h3>Published versions</h3>
{#each rules as rule (rule.id)}<div class="timeline-item">
    <span class="timeline-dot"></span>
    <div>
      <p>Version {rule.version}</p>
      <small>{dateTime(rule.created_at)} · {rule.content_hash.slice(0, 16)}</small>
    </div>
  </div>{/each}
