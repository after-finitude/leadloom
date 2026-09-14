<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    title,
    description = '',
    count,
    children
  }: { title: string; description?: string; count?: number; children?: Snippet } = $props();
</script>

<div class="page-heading">
  <div>
    <h1>
      {title}{#if count !== undefined}<span class="heading-count">{count}</span>{/if}
    </h1>
    {#if description}<p>{description}</p>{/if}
  </div>
  {#if children}<div class="row">{@render children()}</div>{/if}
</div>
