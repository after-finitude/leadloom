<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    eyebrow,
    headline,
    description,
    formTitle,
    formDescription,
    hero,
    footer,
    children
  }: {
    eyebrow: string;
    headline: Snippet;
    description: string;
    formTitle: string;
    formDescription: string;
    hero: Snippet;
    footer: Snippet;
    children: Snippet;
  } = $props();
</script>

<div class="login-layout">
  <section class="login-hero">
    <a href="/" class="brand"><span class="brand-mark">L</span>leadloom</a>
    <div class="hero-copy">
      <p class="eyebrow">{eyebrow}</p>
      <h1>{@render headline()}</h1>
      <p>{description}</p>
      {@render hero()}
    </div>
    <div class="hero-footer"><span>Enquiries · Conversations · Consultations</span></div>
  </section>
  <section class="login-form-side">
    <div class="login-form">
      <h2>{formTitle}</h2>
      <p>{formDescription}</p>
      {@render children()}
      <p class="login-footer">{@render footer()}</p>
    </div>
  </section>
</div>
