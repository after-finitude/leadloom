<script lang="ts">
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { Message } from '../lib/types.ts';
  import {
    dateTime,
    initials,
    messageDay,
    sameMessageDay,
    sameMessageGroup
  } from '../lib/format.ts';
  import Icon from './Icon.svelte';
  let {
    messages,
    name,
    publicView = false,
    children
  }: { messages: Message[]; name: string; publicView?: boolean; children?: Snippet } = $props();
  let container = $state<HTMLDivElement>();
  let initialized = false;
  $effect.pre(() => {
    void messages.length;
    const scroll =
      !initialized ||
      !container ||
      container.scrollHeight - container.scrollTop - container.clientHeight < 90;
    void tick().then(() => {
      if (container && scroll) {
        container.scrollTop = container.scrollHeight;
        initialized = true;
      }
    });
  });
</script>

<div class="chat-scroll" bind:this={container}>
  {#if !messages.length}<div class="date-divider">Your conversation</div>{/if}
  {#each messages as message, index (message.id)}
    {@const continuation = sameMessageGroup(messages[index - 1], message)}
    {@const continues = sameMessageGroup(message, messages[index + 1])}
    {#if !index || !sameMessageDay(messages[index - 1].created_at, message.created_at)}
      <div class="date-divider">{messageDay(message.created_at)}</div>
    {/if}
    {#if message.author === 'system'}<div class="system-message">
        <Icon name="check" />{message.body}
      </div>
    {:else}
      <div
        class="message"
        class:continues
        class:mine={publicView ? message.author === 'lead' : message.author !== 'lead'}
      >
        <div class="avatar" class:group-avatar-hidden={continuation} aria-hidden="true">
          {#if message.author === 'AI'}<Icon
              name="spark"
            />{:else if message.author === 'manager'}TM{:else}{initials(name)}{/if}
        </div>
        <div class="message-content">
          {#if !continuation}<div class="message-author">
              {message.author === 'AI'
                ? 'Leadloom assistant'
                : message.author === 'manager'
                  ? 'Team member'
                  : publicView
                    ? 'You'
                    : name}
            </div>{/if}
          <div class="message-bubble" title={dateTime(message.created_at)}>{message.body}</div>
          {#if !continues}<div class="message-time">
              <time datetime={new Date(message.created_at).toISOString()}
                >{dateTime(message.created_at, true)}</time
              >{message.author !== 'lead' ? ' · Delivered' : ''}
            </div>{/if}
        </div>
      </div>
    {/if}
  {/each}
  {#if children}{@render children()}{/if}
</div>
