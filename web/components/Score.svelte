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

<style>
  .score-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 17px;
  }
  .score-disc {
    min-width: 80px;
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    justify-content: flex-start;
    color: var(--ink);
    font-size: 32px;
    font-weight: 600;
    letter-spacing: -0.025em;
    font-variant-numeric: tabular-nums;
  }
  .score-disc small {
    font-size: 12px;
    letter-spacing: 0;
    color: var(--muted);
    margin-left: 2px;
  }
  .score-sub {
    font-size: 12px;
    color: var(--muted);
    margin-top: 7px;
  }
  .factor {
    margin: 12px 0;
  }
  .factor .between {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 5px;
  }
  .factor strong {
    color: var(--score-ink);
    font-weight: 650;
  }
  .factor progress {
    width: 100%;
    height: 4px;
    appearance: none;
    border: 0;
    border-radius: 4px;
    background: var(--line);
    display: block;
  }
  .factor progress::-webkit-progress-bar {
    background: var(--line);
    border-radius: 4px;
  }
  .factor progress::-webkit-progress-value {
    background: var(--score-bar);
    border-radius: 4px;
  }
  .factor progress::-moz-progress-bar {
    background: var(--score-bar);
    border-radius: 4px;
  }
  .score-footer {
    font-size: 12px;
    color: var(--muted);
    margin-top: 15px;
  }
</style>
