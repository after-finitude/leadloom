<script lang="ts">
  import type { Lead, LeadFields } from '../lib/types.ts';
  import { money, dateTime } from '../lib/format.ts';
  import Icon from './Icon.svelte';
  let { lead }: { lead: Lead } = $props();
  const fields = $derived<[string, keyof LeadFields, string | number | null | undefined][]>([
    ['Service', 'service_type', lead.fields.service_type],
    ['Location', 'location', lead.fields.location],
    [
      'Budget',
      'budget_min',
      lead.fields.budget_min != null || lead.fields.budget_max != null
        ? `${money(lead.fields.budget_min, lead.currency)} – ${money(lead.fields.budget_max, lead.currency)}`
        : null
    ],
    [
      'Timeline',
      'timeline',
      lead.fields.timeline != null
        ? `Within ${Number(lead.fields.timeline.toFixed(1))} months`
        : null
    ],
    [
      'Decision maker',
      'decision_maker',
      lead.fields.decision_maker == null
        ? null
        : lead.fields.decision_maker
          ? 'Yes, can approve'
          : 'No'
    ],
    ['Preferred contact', 'preferred_contact', lead.fields.preferred_contact]
  ]);
</script>

<div class="field-list">
  {#each fields as [label, key, value] (key)}
    {@const sourceKeys = key === 'budget_min' ? (['budget_min', 'budget_max'] as const) : [key]}
    <div class="field-row">
      <span class="field-label">{label}</span>
      <div class="field-value">
        {#if sourceKeys.some((field) => lead.meta[field])}
          <details class="field-source" data-field={key}>
            <summary aria-label={`Source for ${label}`}>
              {#if value == null}<span class="muted">Unknown</span>{:else}{value}{/if}
              <span class="field-origin">
                <Icon name={lead.meta[key]?.locked ? 'lock' : 'check'} /> View source
                {#if lead.meta[key]}
                  · {dateTime(lead.meta[key]?.at, true)}{/if}
              </span>
            </summary>
            <div class="field-evidence">
              {#each sourceKeys as field (field)}
                {@const meta = lead.meta[field]}
                {@const message = lead.messages.find(
                  (message) => message.id === meta?.messageId && message.author === 'lead'
                )}
                <section class="field-attribution">
                  {#if key === 'budget_min'}<strong>
                      {field === 'budget_min' ? 'Minimum' : 'Maximum'} · {money(
                        lead.fields[field] as number | null | undefined,
                        lead.currency
                      )}
                    </strong>{/if}
                  {#if meta}
                    <p class="field-origin">
                      <Icon name={meta.locked ? 'lock' : 'check'} />
                      {meta.source === 'manager' ? 'Team edit' : 'From lead'} · {dateTime(meta.at)}
                    </p>
                    {#if meta.source === 'manager'}
                      <p>Entered manually by a team member.</p>
                    {:else if message}
                      <blockquote>{message.body}</blockquote>
                      <time datetime={new Date(message.created_at).toISOString()}>
                        {lead.name} · {dateTime(message.created_at)}
                      </time>
                    {:else}<p>The original message is unavailable.</p>{/if}
                  {:else}<p class="muted">No message source recorded.</p>{/if}
                </section>
              {/each}
            </div>
          </details>
        {:else}
          {#if value == null}<span class="muted">Unknown</span>{:else}{value}
            <span class="field-origin">No message source recorded</span>{/if}
        {/if}
      </div>
    </div>{/each}
</div>

<style>
  summary {
    cursor: pointer;
  }
  summary:hover,
  summary .field-origin {
    color: var(--green);
  }
  summary .field-origin {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  summary:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 3px;
  }
  .field-evidence {
    margin-top: 10px;
    text-align: left;
    line-height: 1.6;
  }
  .field-attribution + .field-attribution {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  blockquote {
    margin: 8px 0;
    white-space: pre-wrap;
  }
  time {
    color: var(--muted);
  }
</style>
