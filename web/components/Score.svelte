<script lang="ts">
  import type { Lead } from '../lib/types.ts';
  import Badge from './Badge.svelte';
  let { lead }: { lead: Lead } = $props();
</script>

<div class="score-head">
  <div class="score-disc">{lead.score}<small>/100</small></div>
  <div>
    <Badge value={lead.category} />
    <div class="score-sub">
      {lead.qualification === 'complete' ? 'Qualification complete' : 'Collecting project details'}
    </div>
  </div>
</div>
{#each lead.reasons as reason (reason.factor)}<div class="factor" title={reason.reason}>
    <div class="between">
      <span>{reason.factor}</span><strong>{reason.points} / {reason.max}</strong>
    </div>
    <progress value={reason.points} max={Math.max(1, reason.max)} aria-label={reason.factor}
      >{reason.points}</progress
    >
  </div>{/each}
<div class="score-footer">Rules v{lead.rule_version || '?'} · Calculated by code, not AI</div>
