<script lang="ts">
  import Icon from './Icon.svelte';
  let { title, description }: { title: string; description: string } = $props();
</script>

<div class="empty-state">
  <Icon name="inbox" />
  <h3>{title}</h3>
  <p class="small">{description}</p>
</div>
