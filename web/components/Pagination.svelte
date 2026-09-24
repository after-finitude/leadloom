<script lang="ts">
  import { ui, report, loadLeads } from '../lib/workspace.svelte.ts';
  const pages = $derived(Math.max(1, Math.ceil(ui.total / ui.pageSize)));
</script>

{#if pages > 1}
  <nav class="pagination" aria-label="Lead pages">
    <button
      class="btn"
      aria-label="Previous page"
      disabled={ui.loading || ui.page <= 1}
      onclick={() => loadLeads({ page: ui.page - 1 }).catch(report)}>Previous</button
    ><span>Page {ui.page} / {pages}</span><button
      class="btn"
      aria-label="Next page"
      disabled={ui.loading || ui.page >= pages}
      onclick={() => loadLeads({ page: ui.page + 1 }).catch(report)}>Next</button
    >
  </nav>
{/if}

<style>
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .pagination .btn {
    padding: 8px;
    min-height: 44px;
  }
</style>
