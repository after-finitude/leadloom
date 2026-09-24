<script lang="ts">
  import { onMount } from 'svelte';
  import { ui, start, navigate, follow, run, busy } from './lib/workspace.svelte.ts';
  import { post, security } from './lib/api.ts';
  import { initials } from './lib/format.ts';
  import Icon from './components/Icon.svelte';
  import Modal from './components/Modal.svelte';
  import Empty from './components/Empty.svelte';
  import Login from './pages/Login.svelte';
  import Enquiry from './pages/Enquiry.svelte';
  import PublicChat from './pages/PublicChat.svelte';
  import Inbox from './pages/Inbox.svelte';
  import Leads from './pages/Leads.svelte';
  import Profile from './pages/Profile.svelte';
  import Settings from './pages/Settings.svelte';
  import Activity from './pages/Activity.svelte';
  import Outbox from './pages/Outbox.svelte';
  const nav = [
    ['/', 'inbox', 'Inbox'],
    ['/leads', 'users', 'Leads'],
    ['/activity', 'activity', 'Activity'],
    ['/settings', 'settings', 'Settings']
  ];
  const section = $derived(
    ui.route.startsWith('/leads/') ? '/leads' : ui.route === '/conversations' ? '/' : ui.route
  );
  const title = $derived(
    ui.route.startsWith('/leads/')
      ? 'Lead profile'
      : section === '/'
        ? 'Conversations'
        : section === '/outbox'
          ? 'Outbox'
          : nav.find(([path]) => path === section)?.[2] || 'Leadloom'
  );
  onMount(start);
  // After a route change, move focus to the new page so screen readers announce it.
  let main = $state<HTMLElement>();
  let shownRoute = '';
  $effect(() => {
    if (!main || ui.navigating || ui.route === shownRoute) return;
    if (shownRoute) main.focus();
    shownRoute = ui.route;
  });
  async function logout() {
    await run('logout', async () => {
      await post('/auth/logout');
      security.staff = null;
      ui.user = null;
      navigate('/login');
    });
  }
</script>

<svelte:head><title>{ui.user ? title : 'Leadloom'} · Client workspace</title></svelte:head>
{#if !ui.ready}<div class="loading-screen" role="status">
    <span class="brand-mark">L</span>
    <p>Opening your workspace…</p>
  </div>
{:else if ui.error && !ui.user}<div class="access-box">
    <span class="brand-mark">L</span>
    <h2>Unable to open this page</h2>
    <p role="alert">{ui.error}</p>
    <button class="btn" onclick={() => navigate(ui.route)}>Try again</button>
  </div>
{:else if ui.route === '/login'}<Login />
{:else if ui.route === '/enquire'}<Enquiry />
{:else if ui.route === '/chat' || ui.route === '/unsubscribe'}{#key ui.route}<PublicChat />{/key}
{:else if ui.user}<aside class="sidebar">
    <a href="/" class="sidebar-brand" aria-label="Leadloom home" onclick={follow}
      ><span class="brand-mark">L</span><span>Leadloom</span></a
    >
    <nav class="rail-nav" aria-label="Main">
      {#each nav as [path, icon, label] (path)}<a
          class="rail-link"
          class:active={section === path}
          href={path}
          aria-current={section === path ? 'page' : undefined}
          title={label}
          aria-label={label}
          onclick={follow}><Icon name={icon} /><span>{label}</span></a
        >{/each}{#if ui.meta?.demo && ui.user.role === 'admin'}<a
          class="rail-link"
          class:active={section === '/outbox'}
          href="/outbox"
          aria-current={section === '/outbox' ? 'page' : undefined}
          title="Outbox"
          aria-label="Outbox"
          onclick={follow}><Icon name="mail" /><span>Outbox</span></a
        >{/if}
    </nav>
    <div class="rail-bottom">
      <a
        href="/enquire"
        target="_blank"
        rel="noopener"
        class="rail-link"
        title="Open lead form"
        aria-label="New lead"><Icon name="plus" /><span>New lead</span></a
      ><button
        class="rail-link"
        title="Sign out"
        aria-label="Sign out"
        disabled={busy('logout')}
        onclick={logout}><Icon name="logout" /><span>Sign out</span></button
      >
    </div>
  </aside>
  <div class="workspace" class:inbox-workspace={section === '/'}>
    <header class="topbar">
      <div class="breadcrumbs">
        {#if section === '/'}<h1>{title}</h1>{:else}<strong>{title}</strong>{/if}
      </div>
      <div class="header-tools">
        {#if section === '/'}<a
            class="btn primary new-enquiry"
            href="/enquire"
            target="_blank"
            rel="noopener"
            aria-label="New enquiry"><Icon name="plus" /><span>New enquiry</span></a
          >{/if}
        <span class="demo-label"
          >{ui.meta?.demo ? 'Demo workspace' : 'Local edition'} · {ui.meta?.providers.llm}</span
        ><span class="row small muted"
          ><i class="status-dot" class:offline={!ui.connected}></i><span
            >{ui.connected ? 'Connected' : 'Reconnecting…'}</span
          ></span
        ><span class="user-name">{ui.user.name}</span>
        <div class="avatar">{initials(ui.user.name)}</div>
      </div>
    </header>
    <main
      id="main"
      bind:this={main}
      tabindex="-1"
      class:inbox-main={section === '/'}
      aria-busy={ui.navigating}
    >
      {#if ui.error}<div class="access-box">
          <h2>Unable to open this page</h2>
          <p role="alert">{ui.error}</p>
          <button class="btn" onclick={() => navigate(location.pathname + location.search)}
            >Try again</button
          >
        </div>
      {:else if ui.navigating}<p class="page-loading" role="status">Loading page…</p>
      {:else if section === '/'}<Inbox />{:else if ui.route === '/leads'}<Leads
        />{:else if ui.route.startsWith('/leads/')}<Profile
        />{:else if ui.route === '/settings'}<Settings
        />{:else if ui.route === '/activity'}<Activity
        />{:else if ui.route === '/outbox' && ui.user.role === 'admin' && ui.meta?.demo}<Outbox
        />{:else}<Empty
          title="Page not found"
          description="Choose a page from the navigation."
        />{/if}
    </main>
  </div>{/if}
<div
  id="toast"
  class:visible={!!ui.toast}
  class:error={ui.toastError}
  role={ui.toastError ? 'alert' : 'status'}
  aria-live={ui.toastError ? 'assertive' : 'polite'}
>
  {ui.toast}
</div>
{#if ui.modal}{#key ui.modal}<Modal modal={ui.modal} />{/key}{/if}
