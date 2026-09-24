<script lang="ts">
  import { ui } from '../lib/workspace.svelte.ts';
  import ChatAccess from './chat/ChatAccess.svelte';
  import ChatRoom from './chat/ChatRoom.svelte';
</script>

{#if ui.unsubscribed}
  <div class="access-box">
    <span class="brand-mark">L</span>
    <h2>You’re unsubscribed.</h2>
    <p>Automated outreach is stopped. Any existing appointment remains unchanged.</p>
    <a class="btn" href="/chat">Back to your chat</a>
  </div>
{:else if ui.token || ui.route === '/unsubscribe' || !ui.chat}
  <ChatAccess />
{:else}
  <ChatRoom chat={ui.chat} />
{/if}
