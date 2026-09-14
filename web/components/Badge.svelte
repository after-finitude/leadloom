<script lang="ts">
  let { value }: { value: string | null | undefined } = $props();
</script>

<span class={`badge ${(value || '').toLowerCase()}`}>{value || 'Unknown'}</span>
