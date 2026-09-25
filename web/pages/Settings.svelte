<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { api, errorMessage } from '../lib/api.ts';
  import { ui, submit, busy, notify } from '../lib/workspace.svelte.ts';
  import { resource } from '../lib/resource.svelte.ts';
  import type { CompanySettings, Rule, ScoringRules } from '../lib/types.ts';
  import {
    SEQUENCES,
    REPLIES,
    readSettingsTab,
    changed,
    type SettingsTab
  } from '../lib/settings-form.ts';
  import { tabKeydown } from '../lib/tabs.ts';
  import Heading from '../components/Heading.svelte';
  import Field from '../components/Field.svelte';
  import Badge from '../components/Badge.svelte';
  import Icon from '../components/Icon.svelte';
  import ScoringForm from '../components/settings/ScoringForm.svelte';
  type Saved = CompanySettings & { revision: number };
  type Tab = SettingsTab | 'scoring';
  const tabs: [Tab, string][] = [
    ['company', 'Company & availability'],
    ['questions', 'Qualification'],
    ['faq', 'Knowledge & safety'],
    ['replies', 'Assistant replies'],
    ['scoring', 'Scoring rules'],
    ['followup', 'Email follow-up']
  ];
  // Suggestions only: the browser list has no UTC alias, and the server accepts any zone
  // that Intl understands.
  const timezones = ['UTC', ...Intl.supportedValuesOf('timeZone')];
  const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' });
  const currencyCodes = Intl.supportedValuesOf('currency');
  const saved = resource<Saved>('/settings'),
    rules = resource<Rule[]>('/rules');
  let tab = $state<Tab>('company');
  // Each tab keeps its own unsaved edits until that tab is saved.
  let drafts = $state<Partial<Record<SettingsTab, Partial<CompanySettings>>>>({});
  let scoring = $state<ScoringRules | null>(null);
  // What the open form displays: taken when the tab opens or its layout changes, not on
  // every keystroke, so normalising a draft never rewrites what is being typed.
  let shown = $state<Saved | null>(null);
  // A saved code the browser does not know stays selectable until it is changed.
  const currencies = $derived(
    shown && !currencyCodes.includes(shown.currency)
      ? [shown.currency, ...currencyCodes]
      : currencyCodes
  );
  let form = $state<HTMLFormElement>();
  let saveError = $state('');
  const error = $derived(saved.error || rules.error);
  onMount(() => {
    if (ui.user?.role !== 'admin') return;
    const stopSettings = saved.mount(),
      stopRules = rules.mount();
    return () => {
      stopSettings();
      stopRules();
    };
  });
  function show() {
    if (saved.data) shown = { ...saved.data, ...(tab === 'scoring' ? {} : drafts[tab]) };
  }
  $effect(() => {
    if (saved.data) untrack(show);
  });
  function edit() {
    if (form && shown && tab !== 'scoring')
      drafts[tab] = readSettingsTab(tab, new FormData(form), shown);
  }
  const dirty = (key: Tab) =>
    key === 'scoring' ? changed(scoring, rules.data?.[0]?.data) : changed(drafts[key], saved.data);
  function select(key: Tab) {
    tab = key;
    saveError = '';
    show();
  }
  function move(index: number) {
    edit();
    if (!shown) return;
    const questions = [...(drafts.questions?.questions ?? shown.questions)];
    [questions[index - 1], questions[index]] = [questions[index], questions[index - 1]];
    drafts.questions = { questions };
    show();
  }
  function addFaq() {
    edit();
    if (!shown) return;
    const faq = [
      ...(drafts.faq?.faq ?? shown.faq),
      { id: crypto.randomUUID(), question: '', answer: '', keywords: [] }
    ];
    drafts.faq = { ...drafts.faq, faq };
    show();
  }
  async function save(event: SubmitEvent) {
    saveError = '';
    if (tab === 'scoring') return;
    const current = tab;
    await submit(
      event,
      'settings',
      async (data) => {
        if (!saved.data || !shown) return;
        const draft = readSettingsTab(current, data, shown);
        saved.data = await api<Saved>('/settings', {
          method: 'PUT',
          body: { ...saved.data, ...draft }
        });
        delete drafts[current];
        notify('Workspace settings saved');
      },
      (cause) => {
        saveError = errorMessage(cause);
      }
    );
  }
</script>

<Heading
  title="Workspace settings"
  description="Manage services, qualification rules and follow-ups."
/>
<div class="settings-layout">
  <div
    class="settings-nav"
    role="tablist"
    aria-label="Settings sections"
    tabindex="-1"
    onkeydown={(event) =>
      tabKeydown(
        event,
        tabs.map(([key]) => key),
        tab,
        select
      )}
  >
    {#each tabs as [key, label] (key)}<button
        role="tab"
        id={`settings-tab-${key}`}
        data-tab={key}
        aria-selected={tab === key}
        aria-controls="settings-panel"
        tabindex={tab === key ? 0 : -1}
        class:active={tab === key}
        onclick={() => select(key)}
        >{label}{#if dirty(key)}<span class="unsaved">· unsaved</span>{/if}</button
      >{/each}
  </div>
  <div>
    <div class="provider-grid">
      {#each Object.entries(ui.meta?.providers || {}) as [key, provider] (key)}<div
          class="provider-card"
        >
          <h3>{key.toUpperCase()}</h3>
          <Badge value={provider === 'mock' ? 'Mock' : provider} />
          <p class="table-sub">Configured via environment</p>
        </div>{/each}
    </div>
    <div
      class="settings-card"
      role="tabpanel"
      id="settings-panel"
      aria-labelledby={`settings-tab-${tab}`}
    >
      {#if ui.user?.role !== 'admin'}<div class="attention">
          An administrator is required to edit settings.
        </div>{:else if error}<p class="attention" role="alert">
          {error}
        </p>{:else if !shown || !rules.data}<p class="muted" role="status">
          Loading settings…
        </p>{:else if tab === 'scoring'}<ScoringForm
          rules={rules.data}
          bind:draft={scoring}
          onpublished={rules.load}
        />{:else}
        {#key tab}<form bind:this={form} onsubmit={save} oninput={edit}>
            {#if tab === 'company'}<h2>Make it your workspace</h2>
              <p class="description">
                Company details, service coverage and consultation availability. Demo cities and
                budget thresholds are synthetic.
              </p>
              <div class="form-grid">
                <Field label="Company name" name="company" value={shown.company} /><Field
                  label="IANA time zone"
                  name="timezone"
                  value={shown.timezone}
                  list="timezones"
                  help="Start typing a region or city, for example Asia/Manila or America/New_York"
                />
                <datalist id="timezones">
                  {#each timezones as zone (zone)}<option value={zone}></option>{/each}
                </datalist>
                <div class="field">
                  <label for="currency">Currency</label><select
                    id="currency"
                    name="currency"
                    value={shown.currency}
                    >{#each currencies as code (code)}<option value={code}
                        >{code} — {currencyNames.of(code)}</option
                      >{/each}</select
                  >
                </div>
                <Field
                  label="Services, comma-separated"
                  name="services"
                  value={shown.services.join(', ')}
                />
                <div class="field full-width">
                  <label for="areas">Service cities / postcodes, one per line</label><textarea
                    id="areas"
                    name="areas"
                    value={shown.areas.join('\n')}></textarea>
                </div>
                <Field
                  label="Working day begins"
                  name="hours_start"
                  type="time"
                  value={shown.hours.start}
                /><Field
                  label="Working day ends"
                  name="hours_end"
                  type="time"
                  value={shown.hours.end}
                />
                <div class="field full-width">
                  <span>Working days</span>
                  <div class="day-list">
                    {#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as day, i (day)}<label
                        class="check-row"
                        ><input
                          type="checkbox"
                          name={`day_${i}`}
                          checked={shown.hours.days.includes(i)}
                        />{day}</label
                      >{/each}
                  </div>
                </div>
                <Field
                  label="Consultation duration (minutes)"
                  name="duration"
                  type="number"
                  value={shown.duration}
                /><Field
                  label="Buffer between meetings (minutes)"
                  name="buffer"
                  type="number"
                  value={shown.buffer}
                /><Field
                  label="Booking horizon (days)"
                  name="horizon"
                  type="number"
                  value={shown.horizon}
                /><Field
                  label="Minimum notice (minutes)"
                  name="minimumNotice"
                  type="number"
                  value={shown.minimumNotice}
                />
                <div class="field full-width">
                  <label for="deduplication">Active deal policy</label><select
                    id="deduplication"
                    name="deduplication"
                    value={shown.deduplication}
                    ><option value="one_active_per_contact">One active deal per contact</option
                    ><option value="one_active_per_contact_service"
                      >One active deal per contact and service</option
                    ></select
                  >
                </div>
                <div class="field full-width">
                  <label for="brandVoice">Brand voice</label><textarea
                    id="brandVoice"
                    name="brandVoice"
                    value={shown.brandVoice}></textarea>
                </div>
              </div>
            {:else if tab === 'questions'}<h2>Qualification questions</h2>
              <p class="description">
                One question at a time. Service and location are always required. Unknown optional
                answers are never invented.
              </p>
              {#each shown.questions as question, i (question.field)}<div class="question-item">
                  <div class="between">
                    <span class="micro muted">{i + 1} · {question.field.replaceAll('_', ' ')}</span
                    ><label class="check-row"
                      ><input
                        type="checkbox"
                        name={`required_${i}`}
                        checked={question.required}
                        disabled={['service_type', 'location'].includes(question.field)}
                      />Required</label
                    >
                  </div>
                  <input
                    aria-label={`Question ${i + 1}`}
                    name={`question_${i}`}
                    value={question.text}
                  />
                  <div class="form-footer">
                    {#if i}<button type="button" class="btn subtle" onclick={() => move(i)}
                        >Move up ↑</button
                      >{/if}
                  </div>
                </div>{/each}
            {:else if tab === 'faq'}<h2>Answers grounded in your business</h2>
              <p class="description">
                Only these approved answers are used. Questions beyond the FAQ are flagged for the
                team while the assistant continues.
              </p>
              {#each shown.faq as faq, i (faq.id)}<div class="faq-item">
                  <Field
                    label={`Question ${i + 1}`}
                    name={`faq_question_${i}`}
                    value={faq.question}
                  />
                  <div class="field">
                    <label for={`faq_answer_${i}`}>Approved answer</label><textarea
                      id={`faq_answer_${i}`}
                      name={`faq_answer_${i}`}
                      value={faq.answer}></textarea>
                  </div>
                  <Field
                    label="Matching phrases, comma-separated"
                    name={`faq_keywords_${i}`}
                    value={faq.keywords.join(', ')}
                  />
                </div>{/each}
              <div class="field">
                <label for="bannedTopics">Topics that require a person, one per line</label
                ><textarea
                  id="bannedTopics"
                  name="bannedTopics"
                  value={shown.bannedTopics.join('\n')}></textarea>
              </div>
            {:else if tab === 'replies'}<h2>What the assistant says</h2>
              <p class="description">
                Fixed messages in the customer chat. Questions and FAQ answers are edited in their
                own sections.
              </p>
              {#each Object.entries(REPLIES) as [key, [label, hint]] (key)}<div class="field">
                  <label for={`reply_${key}`}>{label}</label><textarea
                    id={`reply_${key}`}
                    name={`reply_${key}`}
                    value={shown.replies[key as keyof typeof REPLIES]}></textarea>
                  {#if hint}<p class="help">{hint}</p>{/if}
                </div>{/each}
            {:else if tab === 'followup'}<h2>Follow up, without overstepping</h2>
              <p class="description">
                Three touches per sequence, per lead. Replies, takeover, booking, pause and opt-out
                stop pending outreach. Times below are minutes from the start of a waiting period.
              </p>
              {#each SEQUENCES as sequence (sequence)}<h3>
                  {sequence === 'qualification_abandoned'
                    ? 'Unfinished qualification'
                    : 'Qualified, not yet booked'}
                </h3>
                <div class="form-grid faq-item">
                  {#each shown.followup[sequence] as minutes, i (i)}<Field
                      label={`Touch ${i + 1} (minutes)`}
                      name={`${sequence}_${i}`}
                      value={minutes}
                      type="number"
                    />{/each}
                </div>{/each}<Field
                label="Email subject"
                name="subject"
                value={shown.followup.subject}
              />
              <div class="field">
                <label for="followup-text">Message</label><textarea
                  id="followup-text"
                  name="text"
                  value={shown.followup.text}></textarea>
                <p class="help">
                  A secure return link and a separate unsubscribe link are added automatically.
                </p>
              </div>{/if}

            {#if saveError}<p class="form-error" role="alert">{saveError}</p>{/if}
            <div class="form-footer">
              {#if tab === 'faq'}<button
                  class="btn"
                  type="button"
                  disabled={busy('settings')}
                  onclick={addFaq}><Icon name="plus" /> Add FAQ</button
                >{/if}<button class="btn primary" disabled={busy('settings')}
                >{{
                  company: 'Save company settings',
                  questions: 'Save questions',
                  faq: 'Save knowledge',
                  replies: 'Save replies',
                  followup: 'Save follow-up settings'
                }[tab]}</button
              >
            </div>
          </form>{/key}
      {/if}
    </div>
  </div>
</div>
