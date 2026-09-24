<script lang="ts">
  let { value }: { value: string | null | undefined } = $props();
</script>

<span class={`badge ${(value || '').toLowerCase()}`}>{value || 'Unknown'}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 0;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    color: var(--muted);
  }
  .badge::before {
    content: '';
    width: 6px;
    height: 6px;
    margin-right: 3px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }
  .badge.hot,
  .badge.confirmed,
  .badge.done,
  .badge.accepted {
    color: var(--tone-accepted);
  }
  .badge.warm,
  .badge.pending {
    color: var(--tone-pending);
  }
  .badge.nurture,
  .badge.contacted {
    color: var(--tone-contacted);
  }
  .badge.unqualified,
  .badge.failed,
  .badge.rejected,
  .badge.unknown {
    color: var(--alert-ink);
  }
  .badge.human {
    color: var(--tone-human);
  }
  .badge.booked {
    color: var(--tone-booked);
  }
  .badge.ai {
    color: var(--tone-ai);
  }
  .badge.stopped {
    color: var(--tone-stopped);
  }
</style>
