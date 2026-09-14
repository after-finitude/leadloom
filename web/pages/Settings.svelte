<script lang="ts">
  import { onMount } from 'svelte';
  import { api, post, errorMessage } from '../lib/api.ts';
  import { ui, submit, notify } from '../lib/workspace.svelte.ts';
  import type { CompanySettings, Rule, ScoringRules } from '../lib/types.ts';
  import { value, list, dateTime } from '../lib/format.ts';
  import Heading from '../components/Heading.svelte';
  import Field from '../components/Field.svelte';
  import Badge from '../components/Badge.svelte';
  import Icon from '../components/Icon.svelte';
  let settings = $state<CompanySettings | null>(null),
    rules = $state<Rule[]>([]),
    error = $state(''),
    tab = $state('company');
  let form = $state<HTMLFormElement>();
  let saveError = $state('');
  const weights = ['service', 'location', 'budget', 'urgency', 'authority'] as const;
  const sequences = ['qualification_abandoned', 'qualified_not_booked'] as const;
  onMount(() => {
    let active = true;
    if (ui.user?.role === 'admin')
      Promise.all([api<CompanySettings>('/settings'), api<Rule[]>('/rules')])
        .then(([s, r]) => {
          if (active) {
            settings = s;
            rules = r;
          }
        })
        .catch((e) => {
          if (active) error = e.message;
        });
    return () => {
      active = false;
    };
  });
  function draft(data: FormData) {
    if (!settings) return;
    if (tab === 'company') {
      for (const key of ['company', 'timezone', 'currency', 'brandVoice'] as const)
        settings[key] = value(data, key);
      settings.deduplication = value(data, 'deduplication') as CompanySettings['deduplication'];
      settings.services = list(value(data, 'services')).map((s) => s.toLowerCase());
      settings.areas = list(value(data, 'areas'), '\n');
      settings.hours = {
        start: value(data, 'hours_start'),
        end: value(data, 'hours_end'),
        days: [0, 1, 2, 3, 4, 5, 6].filter((day) => data.has(`day_${day}`))
      };
      for (const key of ['duration', 'buffer', 'horizon', 'minimumNotice'] as const)
        settings[key] = Number(value(data, key));
    } else if (tab === 'questions') {
      settings.questions = settings.questions.map((q, i) => ({
        ...q,
        text: value(data, `question_${i}`),
        required: ['service_type', 'location'].includes(q.field) || data.has(`required_${i}`)
      }));
    } else if (tab === 'faq') {
      settings.faq = settings.faq.map((faq, i) => ({
        ...faq,
        question: value(data, `faq_question_${i}`),
        answer: value(data, `faq_answer_${i}`),
        keywords: list(value(data, `faq_keywords_${i}`))
      }));
      settings.bannedTopics = list(value(data, 'bannedTopics'), '\n');
    } else if (tab === 'followup') {
      for (const sequence of sequences)
        settings.followup[sequence] = [0, 1, 2].map((i) => Number(value(data, `${sequence}_${i}`)));
      settings.followup.subject = value(data, 'subject');
      settings.followup.text = value(data, 'text');
    }
  }
  function move(index: number) {
    if (form) draft(new FormData(form));
    if (!settings) return;
    [settings.questions[index - 1], settings.questions[index]] = [
      settings.questions[index],
      settings.questions[index - 1]
    ];
  }
  function addFaq() {
    if (form) draft(new FormData(form));
    settings?.faq.push({ id: crypto.randomUUID(), question: '', answer: '', keywords: [] });
  }
  async function save(event: SubmitEvent) {
    saveError = '';
    await submit(
      event,
      async (data) => {
        if (!settings) return;
        if (tab === 'scoring') {
          const next: ScoringRules = JSON.parse(JSON.stringify(rules[0].data));
          for (const key of weights) next.weights[key] = Number(value(data, key));
          for (const key of ['threshold', 'hot', 'warm'] as const)
            next[key] = Number(value(data, key));
          await post('/rules', next);
          rules = await api<Rule[]>('/rules');
          notify('New rules version published');
        } else {
          draft(data);
          settings = await api<CompanySettings>('/settings', { method: 'PUT', body: settings });
          notify('Workspace settings saved');
        }
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
  <nav class="settings-nav" aria-label="Settings sections">
    {#each [['company', 'Company & availability'], ['questions', 'Qualification'], ['faq', 'Knowledge & safety'], ['scoring', 'Scoring rules'], ['followup', 'Email follow-up']] as [key, label] (key)}<button
        class:active={tab === key}
        disabled={ui.busy}
        aria-pressed={tab === key}
        onclick={() => {
          if (form) draft(new FormData(form));
          tab = key;
          saveError = '';
        }}>{label}</button
      >{/each}
  </nav>
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
    <section class="settings-card">
      {#if ui.user?.role !== 'admin'}<div class="attention">
          An administrator is required to edit settings.
        </div>{:else if error}<p class="attention" role="alert">{error}</p>{:else if !settings}<p
          class="muted"
          role="status"
        >
          Loading settings…
        </p>{:else}
        {#key tab}<form bind:this={form} onsubmit={save}>
            {#if tab === 'company'}<h2>Make it your workspace</h2>
              <p class="description">
                Company details, service coverage and consultation availability. Demo cities and
                budget thresholds are synthetic.
              </p>
              <div class="form-grid">
                <Field label="Company name" name="company" value={settings.company} /><Field
                  label="IANA time zone"
                  name="timezone"
                  value={settings.timezone}
                  help="For example Asia/Manila or America/New_York"
                /><Field label="Currency" name="currency" value={settings.currency} /><Field
                  label="Services, comma-separated"
                  name="services"
                  value={settings.services.join(', ')}
                />
                <div class="field full-width">
                  <label for="areas">Service cities / postcodes, one per line</label><textarea
                    id="areas"
                    name="areas"
                    value={settings.areas.join('\n')}></textarea>
                </div>
                <Field
                  label="Working day begins"
                  name="hours_start"
                  type="time"
                  value={settings.hours.start}
                /><Field
                  label="Working day ends"
                  name="hours_end"
                  type="time"
                  value={settings.hours.end}
                />
                <div class="field full-width">
                  <span>Working days</span>
                  <div class="day-list">
                    {#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as day, i (day)}<label
                        class="check-row"
                        ><input
                          type="checkbox"
                          name={`day_${i}`}
                          checked={settings.hours.days.includes(i)}
                        />{day}</label
                      >{/each}
                  </div>
                </div>
                <Field
                  label="Consultation duration (minutes)"
                  name="duration"
                  type="number"
                  value={settings.duration}
                /><Field
                  label="Buffer between meetings (minutes)"
                  name="buffer"
                  type="number"
                  value={settings.buffer}
                /><Field
                  label="Booking horizon (days)"
                  name="horizon"
                  type="number"
                  value={settings.horizon}
                /><Field
                  label="Minimum notice (minutes)"
                  name="minimumNotice"
                  type="number"
                  value={settings.minimumNotice}
                />
                <div class="field full-width">
                  <label for="deduplication">Active deal policy</label><select
                    id="deduplication"
                    name="deduplication"
                    value={settings.deduplication}
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
                    value={settings.brandVoice}></textarea>
                </div>
              </div>
            {:else if tab === 'questions'}<h2>Qualification questions</h2>
              <p class="description">
                One question at a time. Service and location are always required. Unknown optional
                answers are never invented.
              </p>
              {#each settings.questions as question, i (question.field)}<div class="question-item">
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
                Only these approved answers are used. Questions beyond the FAQ are passed to a
                person.
              </p>
              {#each settings.faq as faq, i (faq.id)}<div class="faq-item">
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
                  value={settings.bannedTopics.join('\n')}></textarea>
              </div>
            {:else if tab === 'scoring' && rules.length}<h2>Explain every score</h2>
              <p class="description">
                Publish a new immutable version. Existing leads keep their current rules until you
                explicitly recalculate them.
              </p>
              <div class="form-grid">
                {#each weights as key (key)}<Field
                    label={`${key[0].toUpperCase() + key.slice(1)} weight`}
                    name={key}
                    type="number"
                    value={rules[0].data.weights[key]}
                  />{/each}<Field
                  label="Demo budget threshold"
                  name="threshold"
                  type="number"
                  value={rules[0].data.threshold}
                /><Field
                  label="Hot threshold"
                  name="hot"
                  type="number"
                  value={rules[0].data.hot}
                /><Field
                  label="Warm threshold"
                  name="warm"
                  type="number"
                  value={rules[0].data.warm}
                />
              </div>
            {:else if tab === 'followup'}<h2>Follow up, without overstepping</h2>
              <p class="description">
                Three touches per sequence, per lead. Replies, takeover, booking, pause and opt-out
                stop pending outreach. Times below are minutes from the start of a waiting period.
              </p>
              {#each sequences as sequence (sequence)}<h3>
                  {sequence === 'qualification_abandoned'
                    ? 'Unfinished qualification'
                    : 'Qualified, not yet booked'}
                </h3>
                <div class="form-grid faq-item">
                  {#each settings.followup[sequence] as minutes, i (i)}<Field
                      label={`Touch ${i + 1} (minutes)`}
                      name={`${sequence}_${i}`}
                      value={minutes}
                      type="number"
                    />{/each}
                </div>{/each}<Field
                label="Email subject"
                name="subject"
                value={settings.followup.subject}
              />
              <div class="field">
                <label for="followup-text">Message</label><textarea
                  id="followup-text"
                  name="text"
                  value={settings.followup.text}></textarea>
                <p class="help">
                  A secure return link and a separate unsubscribe link are added automatically.
                </p>
              </div>{/if}
            {#if saveError}<p class="form-error" role="alert">{saveError}</p>{/if}
            <div class="form-footer">
              {#if tab === 'faq'}<button
                  class="btn"
                  type="button"
                  disabled={ui.busy}
                  onclick={addFaq}><Icon name="plus" /> Add FAQ</button
                >{/if}<button
                class="btn primary"
                disabled={ui.busy || (tab === 'scoring' && !rules.length)}
                >{tab === 'scoring'
                  ? `Publish rules v${(rules[0]?.version || 0) + 1}`
                  : {
                      company: 'Save company settings',
                      questions: 'Save questions',
                      faq: 'Save knowledge',
                      followup: 'Save follow-up settings'
                    }[tab as 'company' | 'questions' | 'faq' | 'followup']}</button
              >
            </div>
          </form>{/key}
        {#if tab === 'scoring'}<hr class="form-divider" />
          <h3>Published versions</h3>
          {#each rules as rule (rule.id)}<div class="timeline-item">
              <span class="timeline-dot"></span>
              <div>
                <p>Version {rule.version}</p>
                <small>{dateTime(rule.created_at)} · {rule.content_hash.slice(0, 16)}</small>
              </div>
            </div>{/each}{/if}
      {/if}
    </section>
  </div>
</div>
