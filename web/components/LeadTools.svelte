<script lang="ts">
  import { ui, report, loadLeads, search, refresh } from '../lib/workspace.svelte.ts';
  import Icon from './Icon.svelte';
  import type { ListFilter } from '../../src/domain.mts';
  let { compact = false }: { compact?: boolean } = $props();
  const filters: [ListFilter, string][] = [
    ['all', 'All'],
    ['attention', 'Needs attention'],
    ['ai', 'AI active'],
    ['human', 'Human'],
    ['booked', 'Booked']
  ];
  function filter(key: ListFilter) {
    loadLeads({ filter: key, page: 1 }).catch(report);
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
        onchange={(event) => filter(event.currentTarget.value as ListFilter)}
      >
        {#each filters as [key, label] (key)}<option value={key}
            >{label}{key === ui.filter ? ` (${ui.total})` : ''}</option
          >{/each}
      </select>
      <button
        class="icon-btn"
        aria-label="Refresh conversations"
        title="Refresh conversations"
        disabled={ui.loading}
        onclick={() => refresh().catch(report)}><Icon name="refresh" /></button
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
