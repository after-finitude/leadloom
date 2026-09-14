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
  {#each fields as [label, key, value] (key)}<div class="field-row">
      <span class="field-label">{label}</span><span class="field-value"
        >{#if value == null}<span class="muted">Unknown</span
          >{:else}{value}{/if}{#if lead.meta[key]}<span class="field-origin"
            ><Icon name={lead.meta[key]?.locked ? 'lock' : 'check'} />
            {lead.meta[key]?.source || 'lead'} · {dateTime(lead.meta[key]?.at, true)}</span
          >{/if}</span
      >
    </div>{/each}
</div>
