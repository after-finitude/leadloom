<script lang="ts">
  import { ui, run, loadLeads, search, refresh } from '../lib/workspace.svelte.ts';
  import Icon from './Icon.svelte';
  let { compact = false }: { compact?: boolean } = $props();
  const filters = [
    ['all', 'All'],
    ['attention', 'Needs attention'],
    ['ai', 'AI active'],
    ['human', 'Human'],
    ['booked', 'Booked']
  ];
  async function filter(key: string) {
    await run(async () => {
      ui.filter = key;
      ui.page = 1;
      await loadLeads();
    });
  }
</script>

<div class="list-top" class:compact>
  <div class="search-box">
    <Icon name="search" /><input
      id="lead-search"
      placeholder="Search conversations"
      aria-label="Search conversations"
      maxlength="200"
      value={ui.search}
      oninput={(event) => search(event.currentTarget.value)}
    />
  </div>
  {#if compact}
    <div class="list-filter-row">
      <select
        aria-label="Filter conversations"
        value={ui.filter}
        disabled={ui.busy}
        onchange={(event) => filter(event.currentTarget.value)}
      >
        {#each filters as [key, label] (key)}<option value={key}
            >{label}{key === ui.filter ? ` (${ui.total})` : ''}</option
          >{/each}
      </select>
      <button
        class="icon-btn"
        aria-label="Refresh conversations"
        title="Refresh conversations"
        disabled={ui.busy || ui.loading}
        onclick={() => run(refresh)}><Icon name="refresh" /></button
      >
    </div>
  {:else}
    <div class="filters">
      {#each filters as [key, label] (key)}<button
          class="filter"
          class:active={ui.filter === key}
          aria-pressed={ui.filter === key}
          onclick={() => filter(key)}>{key === 'all' ? 'All' : label}</button
        >{/each}
    </div>
  {/if}
</div>
