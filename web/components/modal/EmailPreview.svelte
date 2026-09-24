<script lang="ts">
  import type { OutboxMessage } from '../../lib/types.ts';
  import Icon from '../Icon.svelte';
  import ModalShell from './ModalShell.svelte';
  let { email }: { email: OutboxMessage } = $props();
</script>

<ModalShell title="Mock email preview" wide>
  <p class="small muted">To {email.payload.to} · Saved locally, not delivered</p>
  <h3 class="faq-item">{email.payload.subject}</h3>
  <pre>{email.payload.text}</pre>
  <div class="form-footer">
    {#each email.payload.text.match(/https?:\/\/\S+/g) || [] as url, i (i)}<a
        class="btn"
        class:primary={i === 0}
        href={url}
        target="_blank"
        rel="noopener">{i ? 'Open unsubscribe' : 'Open secure chat'} <Icon name="arrow" /></a
      >{/each}
  </div>
</ModalShell>
