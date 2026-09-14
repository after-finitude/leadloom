<script lang="ts">
  import { ui, run, loadLeads } from '../lib/workspace.svelte.ts';
  const pages = $derived(Math.max(1, Math.ceil(ui.total / ui.pageSize)));
</script>

{#if pages > 1}
  <nav class="pagination" aria-label="Lead pages">
    <button
      class="btn"
      aria-label="Previous page"
      disabled={ui.busy || ui.loading || ui.page <= 1}
      onclick={() =>
        run(async () => {
          ui.page--;
          await loadLeads();
        })}>Previous</button
    ><span>Page {ui.page} / {pages}</span><button
      class="btn"
      aria-label="Next page"
      disabled={ui.busy || ui.loading || ui.page >= pages}
      onclick={() =>
        run(async () => {
          ui.page++;
          await loadLeads();
        })}>Next</button
    >
  </nav>
{/if}
