<script lang="ts">
  import Icon from './Icon.svelte';
  let { title, description }: { title: string; description: string } = $props();
</script>

<div class="empty-state">
  <Icon name="inbox" />
  <h3>{title}</h3>
  <p class="small">{description}</p>
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 50px 25px;
    color: var(--muted);
    gap: 12px;
    height: 100%;
  }
  .empty-state h3 {
    color: var(--ink);
  }
</style>
