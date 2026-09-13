import { api, post, security, esc, uid } from './api.js';
const root = document.querySelector('#app'),
  state = {
    user: null,
    leads: [],
    page: 1,
    pageSize: 50,
    total: 0,
    stats: { total: 0, open: 0, ai: 0, attention: 0, booked: 0 },
    profile: null,
    leadId: null,
    filter: 'all',
    search: '',
    view: 'conversations',
    tab: 'timeline',
    settingsTab: 'company',
    settings: null,
    rules: [],
    meta: null,
    public: null,
    slots: null,
    linkToken: null
  };
const paths = {
  inbox: 'M4 4h16v16H4z M4 13h5l2 3h2l2-3h5',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  mail: 'M3 5h18v14H3z M3 5l9 8 9-8',
  arrow: 'M7 17L17 7 M7 7h10v10',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  send: 'M22 2L9 15 M22 2l-7 20-6-7-7-6z',
  spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  calendar: 'M4 5h16v16H4z M16 3v4 M8 3v4 M4 11h16',
  check: 'M5 12l4 4L19 6',
  clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  pause: 'M8 4v16 M16 4v16',
  play: 'M6 3l14 9-14 9z',
  edit: 'M4 16L16 4l4 4L8 20H4z M14 6l4 4',
  lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
  logout: 'M9 21H3V3h6 M16 17l5-5-5-5 M21 12H9',
  chevron: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12 M6 18L18 6',
  back: 'M19 12H5 M12 5l-7 7 7 7',
  plus: 'M12 5v14 M5 12h14',
  note: 'M5 3h10l4 4v14H5z M15 3v5h4 M8 12h8 M8 16h6',
  refresh: 'M20 8a8 8 0 0 0-14-3L3 8 M3 3v5h5 M4 16a8 8 0 0 0 14 3l3-3 M21 21v-5h-5'
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${
    paths[name] || paths.spark
  }"/></svg>`;
const initials = (name) =>
  esc(
    (name || '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join('')
      .toUpperCase()
  );
const badge = (value, extra = '') =>
  `<span class="badge ${esc(String(value || '').toLowerCase())} ${extra}">${esc(value)}</span>`;
const dt = (ms, short = false, timeZone) =>
  ms
    ? new Intl.DateTimeFormat('en-GB', {
        ...(short
          ? { hour: '2-digit', minute: '2-digit' }
          : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        timeZone
      }).format(new Date(ms))
    : '—';
const money = (v, c = 'USD') =>
  v == null
    ? 'Unknown'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: c,
        maximumFractionDigits: 0
      }).format(v);
const heading = (title, sub, actions = '') =>
  `<div class="page-heading"><div><h1>${title}</h1><p>${sub}</p></div><div class="row">${actions}</div></div>`;
const empty = (title, description) =>
  `<div class="empty-state">${icon('inbox')}<h3>${esc(title)}</h3><p class="small">${esc(
    description
  )}</p></div>`;
let toastTimer,
  searchTimer,
  listRequest = 0,
  listLoads = 0;
function toast(message, error = false) {
  const e = document.querySelector('#toast');
  e.textContent = message;
  e.className = 'visible' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (e.className = ''), 6000);
}
function patch(id, html) {
  const el = document.getElementById(id);
  if (!el || el._html === html) return;
  const saved = [...el.querySelectorAll('[data-persist]')].map((x) => ({
    key: x.dataset.persist,
    value: x.value,
    checked: x.checked,
    active: x === document.activeElement,
    start: x.selectionStart,
    end: x.selectionEnd
  }));
  const scroll = el.querySelector('.chat-scroll'),
    scrollTop = scroll?.scrollTop || 0,
    atBottom = !scroll || scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 90;
  el.innerHTML = html;
  el._html = html;
  for (const item of saved) {
    const input = [...el.querySelectorAll('[data-persist]')].find(
      (x) => x.dataset.persist === item.key
    );
    if (input) {
      input.value = item.value;
      if (input.type === 'checkbox') input.checked = item.checked;
      if (item.active) {
        input.focus({ preventScroll: true });
        if (typeof item.start === 'number') input.setSelectionRange(item.start, item.end);
      }
    }
  }
  const next = el.querySelector('.chat-scroll');
  if (next) next.scrollTop = atBottom ? next.scrollHeight : scrollTop;
}
function modal(title, body, wide = false) {
  document.querySelector('#modal-root').innerHTML =
    `<div class="modal-backdrop"><section class="modal ${
      wide ? 'wide' : ''
    }" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h3>${esc(
      title
    )}</h3><button class="icon-btn" data-close-modal aria-label="Close">${icon(
      'close'
    )}</button></div><div class="modal-body">${body}</div></section></div>`;
  setTimeout(
    () => document.querySelector('.modal input,.modal textarea,.modal button')?.focus(),
    0
  );
}
function closeModal() {
  document.querySelector('#modal-root').innerHTML = '';
}
function shell() {
  const nav = [
    ['conversations', 'inbox', 'Inbox'],
    ['leads', 'users', 'Leads'],
    ['activity', 'activity', 'Activity'],
    ['settings', 'settings', 'Settings']
  ];
  if (state.meta.demo && state.user.role === 'admin') nav.push(['outbox', 'mail', 'Outbox']);
  root.innerHTML = `<aside class="sidebar"><a href="/" class="brand-mark" aria-label="Leadloom home">L</a>${nav
    .map(
      ([key, ico, name]) =>
        `<button data-nav="${key}" class="rail-link ${
          state.view === key ? 'active' : ''
        }" title="${name}">${icon(ico)}<span>${name}</span></button>`
    )
    .join(
      ''
    )}<div class="rail-bottom"><a href="/enquire" target="_blank" rel="noopener" class="rail-link" title="Open lead form">${icon(
    'plus'
  )}<span>New lead</span></a><button class="rail-link" data-logout title="Sign out">${icon(
    'logout'
  )}<span>Sign out</span></button><div class="avatar">${initials(
    state.user.name
  )}</div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumbs"><span>Acme workspace</span><span>/</span><strong id="breadcrumb">${esc(
    state.view === 'conversations'
      ? 'Conversations'
      : state.view === 'profile'
        ? 'Lead profile'
        : state.view[0].toUpperCase() + state.view.slice(1)
  )}</strong></div><div class="header-tools"><span class="demo-label">${
    state.meta.demo ? 'DEMO WORKSPACE' : 'LOCAL EDITION'
  } · ${esc(
    state.meta.providers.llm === 'mock' ? 'Mock AI' : 'OpenAI'
  )}</span><span class="row small muted"><i class="status-dot"></i><span id="connection-status">Connected</span></span><span class="user-name">${esc(
    state.user.name
  )}</span><div class="avatar">${initials(
    state.user.name
  )}</div></div></header><main id="main"></main></div>`;
}
async function navigate(view, leadId = null, push = true) {
  clearTimeout(searchTimer);
  listRequest++;
  state.view = view;
  state.leadId = leadId || state.leadId;
  if (push)
    history.pushState(
      {},
      '',
      view === 'profile' ? `/leads/${state.leadId}` : view === 'conversations' ? '/' : '/' + view
    );
  shell();
  await renderView();
}
function kpis() {
  const s = state.stats;
  return `<div class="kpi-strip">${[
    ['Open conversations', s.open, 'inbox'],
    ['AI is assisting', s.ai, 'spark'],
    ['Need your attention', s.attention, 'users'],
    ['Consultations booked', s.booked, 'calendar']
  ]
    .map(
      ([label, n, ico]) =>
        `<div class="kpi"><div><div class="kpi-label">${label}</div><div class="kpi-number">${n}</div></div>${icon(
          ico
        )}</div>`
    )
    .join('')}</div>`;
}
function leadTools() {
  return `<div class="list-top"><div class="search-box">${icon(
    'search'
  )}<input id="lead-search" data-persist="search" placeholder="Search conversations" aria-label="Search conversations" maxlength="200" value="${esc(
    state.search
  )}"></div><div class="filters">${[
    ['all', 'All'],
    ['attention', 'Needs attention'],
    ['ai', 'AI active'],
    ['human', 'Human'],
    ['booked', 'Booked']
  ]
    .map(
      ([key, label]) =>
        `<button class="filter ${state.filter === key ? 'active' : ''}" aria-pressed="${
          state.filter === key
        }" data-filter="${key}">${label}</button>`
    )
    .join('')}</div></div>`;
}
function pagination() {
  const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
  return `<nav class="list-summary pagination" aria-label="Lead pages"><button class="btn" data-persist="page-previous" data-page="${
    state.page - 1
  }" aria-label="Previous page" ${state.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${
    state.page
  } / ${pages}</span><button class="btn" data-persist="page-next" data-page="${
    state.page + 1
  }" aria-label="Next page" ${state.page >= pages ? 'disabled' : ''}>Next</button></nav>`;
}
function conversationList() {
  const ls = state.leads;
  return `${leadTools()}<div class="list-summary"><span>${
    state.total
  } conversations</span><span>Recent activity ↓</span></div><div class="list-scroll">${
    ls
      .map(
        (l) =>
          `<button class="lead-card ${state.leadId === l.id ? 'active' : ''}" data-lead="${esc(
            l.id
          )}"><div class="row gap8"><div class="avatar">${initials(
            l.name
          )}</div><div class="flex"><div class="between"><strong>${esc(l.name)}</strong><time>${dt(
            l.updated_at,
            true
          )}</time></div><div class="lead-preview">${esc(
            l.fields.service_type || l.source
          )}</div></div></div><p class="lead-preview">${esc(
            l.last_message?.body || 'New enquiry'
          )}</p><div class="lead-meta"><span class="owner-mini">${icon(
            l.owner === 'AI' ? 'spark' : 'users'
          )}${
            l.opt_out
              ? 'Opted out'
              : l.paused
                ? 'Paused'
                : l.owner === 'AI'
                  ? 'AI assistant'
                  : 'Team member'
          }</span>${badge(
            l.stage === 'Booked' ? 'Booked' : l.review_reason && !l.opt_out ? 'Human' : l.category
          )}</div></button>`
      )
      .join('') ||
    empty('No matching conversations', 'Try a different search or filter, or start a new enquiry.')
  }</div>${pagination()}`;
}
function messagesHtml(messages, publicView = false) {
  return `<div class="date-divider">${
    messages.length
      ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(
          new Date(messages[0].created_at)
        )
      : 'Your conversation'
  }</div>${messages
    .map((m) =>
      m.author === 'system'
        ? `<div class="system-message">${icon('check')}${esc(m.body)}</div>`
        : `<div class="message ${
            (publicView ? m.author === 'lead' : m.author !== 'lead') ? 'mine' : ''
          }"><div class="avatar">${
            m.author === 'AI'
              ? icon('spark')
              : m.author === 'manager'
                ? 'TM'
                : initials(state.profile?.name || state.public?.name || 'You')
          }</div><div class="message-content"><div class="message-author">${
            m.author === 'AI'
              ? 'Leadloom assistant'
              : m.author === 'manager'
                ? 'Team member'
                : publicView
                  ? 'You'
                  : esc(state.profile?.name || 'Visitor')
          }</div><div class="message-bubble">${esc(m.body)}</div><div class="message-time">${dt(
            m.created_at,
            true
          )}${m.author !== 'lead' ? ' · Delivered' : ''}</div></div></div>`
    )
    .join('')}`;
}
function chatPanel() {
  const l = state.profile;
  if (!l)
    return empty('Select a conversation', 'Your messages and project details will appear here.');
  return `<div class="conversation-head"><div class="between"><div class="row"><button class="icon-btn mobile-back" data-back-list aria-label="Back to list">${icon(
    'back'
  )}</button><div class="avatar">${initials(l.name)}</div><div><h3>${esc(l.name)}</h3><p>${esc(
    l.fields.service_type || 'New project'
  )} &nbsp; · &nbsp; ${esc(
    l.source === 'web_form' ? 'Website enquiry' : l.source
  )}</p></div></div><div>${badge(
    l.stage
  )}</div></div></div><div class="conversation-actions"><div class="row gap8"><button class="btn" data-control="${
    l.owner === 'AI' ? 'takeover' : 'return-to-ai'
  }">${icon(l.owner === 'AI' ? 'users' : 'spark')}${
    l.owner === 'AI' ? 'Take over' : 'Return to AI'
  }</button><button class="btn subtle" data-control="${l.paused ? 'resume' : 'pause'}">${icon(
    l.paused ? 'play' : 'pause'
  )}${l.paused ? 'Resume' : 'Pause'}</button></div><button class="btn subtle" data-profile="${esc(
    l.id
  )}">Open lead ${icon('arrow')}</button></div><div class="chat-scroll">${
    l.opt_out
      ? '<div class="attention red">This contact has opted out. Automated and manual outreach are blocked.</div>'
      : l.review_reason
        ? `<div class="attention">Needs a team member · ${esc(
            l.review_reason.replaceAll('_', ' ')
          )}</div>`
        : ''
  }${messagesHtml(
    l.messages
  )}</div><form class="composer" data-form="manager-message"><textarea name="body" data-persist="composer-${esc(
    l.id
  )}" placeholder="Write a personal reply…" aria-label="Manager reply" maxlength="4000" ${
    l.opt_out ? 'disabled' : ''
  } required></textarea><div class="composer-footer"><span class="composer-hint">${icon(
    'lock'
  )} Sending a reply takes over from AI.</span><button class="btn primary" type="submit" ${
    l.opt_out ? 'disabled' : ''
  }>Send reply ${icon('send')}</button></div></form>`;
}
function fieldsHtml(l) {
  const f = l.fields;
  const fields = [
    ['Service', 'service_type', f.service_type],
    ['Location', 'location', f.location],
    [
      'Budget',
      'budget_min',
      f.budget_min != null || f.budget_max != null
        ? `${money(f.budget_min, l.currency || 'USD')} – ${money(
            f.budget_max,
            l.currency || 'USD'
          )}`
        : null
    ],
    [
      'Timeline',
      'timeline',
      f.timeline != null ? `Within ${Number(f.timeline.toFixed(1))} months` : null
    ],
    [
      'Decision maker',
      'decision_maker',
      f.decision_maker == null ? null : f.decision_maker ? 'Yes, can approve' : 'No'
    ],
    ['Preferred contact', 'preferred_contact', f.preferred_contact]
  ];
  return `<div class="field-list">${fields
    .map(
      ([label, key, value]) =>
        `<div class="field-row"><span class="field-label">${label}</span><span class="field-value">${
          value == null ? '<span class="muted">Unknown</span>' : esc(value)
        }${
          l.meta[key]
            ? `<span class="field-origin">${
                l.meta[key].locked ? icon('lock') : icon('check')
              } ${esc(l.meta[key].source || 'lead')} · ${dt(l.meta[key].at, true)}</span>`
            : ''
        }</span></div>`
    )
    .join('')}</div>`;
}
function scoringHtml(l) {
  return `<div class="score-head"><div class="score-disc">${
    l.score
  }<small>/100</small></div><div>${badge(l.category)}<div class="score-sub">${
    l.qualification === 'complete' ? 'Qualification complete' : 'Collecting project details'
  }</div></div></div>${l.reasons
    .map(
      (r) =>
        `<div class="factor" title="${esc(r.reason)}"><div class="between"><span>${esc(
          r.factor
        )}</span><strong>${r.points} / ${r.max}</strong></div><progress value="${
          r.points
        }" max="${Math.max(1, r.max)}">${r.points}</progress></div>`
    )
    .join('')}<div class="score-footer">Rules v${
    l.rule_version || '?'
  } · Calculated by code, not AI</div>`;
}
function contextPanel() {
  const l = state.profile;
  if (!l) return '';
  const a = l.appointments.find((a) => ['confirmed', 'pending', 'unknown'].includes(a.status));
  return `<section class="context-section"><div class="section-title">Project details<button class="icon-btn" data-edit-fields title="Edit qualification fields">${icon(
    'edit'
  )}</button></div>${fieldsHtml(
    l
  )}</section><section class="context-section"><div class="section-title">Lead qualification ${icon(
    'spark'
  )}</div>${scoringHtml(
    l
  )}</section><section class="context-section"><div class="section-title">Consultation ${icon(
    'calendar'
  )}</div>${
    a
      ? `<div class="appointment-card"><strong>${esc(
          a.status === 'confirmed'
            ? 'Consultation booked'
            : a.status === 'pending'
              ? 'Booking in progress'
              : 'Booking needs review'
        )}</strong><p>${esc(
          new Intl.DateTimeFormat('en-GB', {
            timeZone: a.timezone,
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          }).format(new Date(a.start_at))
        )}</p><p>${esc(a.timezone)} · ${esc(state.meta.providers.calendar)} calendar</p></div>`
      : '<div class="empty-small">No consultation booked yet.<br>Availability is offered after qualification.</div>'
  }</section><section class="context-section"><div class="section-title">Next action ${icon(
    'clock'
  )}</div><p class="empty-small">${
    l.next_action
      ? `${esc(l.next_action.kind.replaceAll('_', ' '))} · ${dt(l.next_action.due_at)}`
      : l.owner === 'HUMAN'
        ? 'Waiting for a team member'
        : l.opt_out
          ? 'No outreach — contact opted out'
          : 'Waiting for the visitor'
  }</p></section><section class="context-section"><div class="section-title">First contact</div><p class="empty-small">${
    l.first_contact_ms != null
      ? `${l.first_contact_ms} ms · ${esc(l.first_contact_channel)} ${
          l.first_contact_ms < 10000 ? '· Within target' : '· Over target'
        }`
      : esc(l.first_contact_status)
  }</p></section>`;
}
function renderInbox() {
  const main = document.querySelector('#main');
  if (!document.querySelector('#inbox'))
    main.innerHTML = `${heading(
      'Conversations <span class="heading-count" id="heading-count"></span>',
      'A little conversation. A lot of possibility.',
      `<button class="btn" data-refresh>${icon(
        'refresh'
      )} Refresh</button><a class="btn primary" href="/enquire" target="_blank" rel="noopener">${icon(
        'plus'
      )} New enquiry</a>`
    )}<div id="kpis"></div><div class="inbox" id="inbox"><aside class="conversation-list" id="lead-list"></aside><section class="chat-panel" id="chat-panel"></section><aside class="context-panel" id="context-panel"></aside></div>`;
  document.querySelector('#heading-count').textContent = state.stats.total;
  patch('kpis', kpis());
  patch('lead-list', conversationList());
  patch('chat-panel', chatPanel());
  patch('context-panel', contextPanel());
  document.querySelector('#inbox')?.classList.toggle('has-selection', !!state.leadId);
}
function renderLeads() {
  const rows = state.leads
    .map(
      (l) =>
        `<tr><td><button class="link table-name" data-profile="${esc(l.id)}">${esc(
          l.name
        )}</button><div class="table-sub">${esc(l.email || l.phone)}</div></td><td>${esc(
          l.fields.service_type || 'Unknown'
        )}</td><td>${esc(l.fields.location || 'Unknown')}</td><td>${badge(l.stage)}</td><td>${badge(
          l.category
        )} <span class="small muted">${l.score}/100</span></td><td>${badge(l.owner)}${
          l.opt_out ? ' ' + badge('Stopped') : ''
        }</td><td class="small muted">${dt(l.updated_at)}</td></tr>`
    )
    .join('');
  if (!document.querySelector('#leads-table'))
    document.querySelector('#main').innerHTML =
      heading(
        'Your leads',
        'Every enquiry, one clear picture.',
        `<a class="btn primary" href="/enquire" target="_blank" rel="noopener">${icon(
          'plus'
        )} New enquiry</a>`
      ) + '<div class="panel slim" id="leads-table"></div>';
  patch(
    'leads-table',
    `${leadTools()}<div class="list-summary">${
      state.total
    } matching leads</div><div class="table-wrap"><table><thead><tr><th>Contact</th><th>Service</th><th>Location</th><th>Stage</th><th>Qualification</th><th>Owner</th><th>Last activity</th></tr></thead><tbody>${
      rows || '<tr><td colspan="7">No matching leads. Try a different search or filter.</td></tr>'
    }</tbody></table></div>${pagination()}`
  );
}
function profileContent() {
  const l = state.profile;
  if (state.tab === 'data')
    return `${fieldsHtml(
      l
    )}<div class="form-footer"><button class="btn primary" data-edit-fields>${icon(
      'edit'
    )} Edit fields</button></div><hr class="form-divider"><h3>Field history</h3>${
      l.revisions
        .map(
          (r) =>
            `<div class="timeline-item"><span class="timeline-dot"></span><div><p>${esc(r.field)} ${
              r.proposed ? '· Proposed conflict' : ''
            }</p><small>${esc(r.old_value)} → ${esc(r.new_value)} · ${dt(r.created_at)} ${
              r.locked ? '· Locked' : ''
            }</small></div></div>`
        )
        .join('') || '<p class="muted small">No field revisions yet.</p>'
    }`;
  if (state.tab === 'score')
    return `${scoringHtml(
      l
    )}<div class="form-footer"><button class="btn" data-recalculate>Recalculate with latest rules</button></div><hr class="form-divider"><h3>Evaluation history</h3>${l.evaluations
      .map(
        (e) =>
          `<div class="timeline-item"><span class="timeline-dot"></span><div><p>${
            e.score
          }/100 · ${esc(e.category)}</p><small>${dt(e.created_at)}</small></div></div>`
      )
      .join('')}`;
  if (state.tab === 'appointments')
    return (
      l.appointments
        .map(
          (a) =>
            `<section class="context-section"><div class="between"><h3>${esc(
              dt(a.start_at, false, a.timezone)
            )}</h3>${badge(a.status)}</div><p class="muted small">${esc(a.timezone)} · ${esc(
              state.meta.providers.calendar
            )} calendar</p><p class="mono muted">${esc(
              a.external_id || 'Waiting for calendar confirmation'
            )}</p>${
              a.external_url
                ? `<a class="link small" href="${esc(
                    a.external_url
                  )}" target="_blank" rel="noopener">Open calendar event ↗</a>`
                : ''
            }${
              a.status === 'confirmed'
                ? `<div class="form-footer"><button class="btn" data-move-appointment="${esc(
                    a.id
                  )}">Reschedule</button><button class="btn danger" data-cancel-appointment="${esc(
                    a.id
                  )}">Cancel appointment</button></div>`
                : ''
            }</section>`
        )
        .join('') ||
      empty('No appointment yet', 'A qualified visitor can choose a time in their chat.')
    );
  return l.timeline
    .map(
      (t) =>
        `<div class="timeline-item"><span class="timeline-dot"></span><div class="flex"><div class="between"><p>${esc(
          t.action.replaceAll('_', ' ')
        )}</p><small>${dt(t.created_at)}</small></div><small class="mono">${esc(
          t.correlation_id
        )}</small><pre>${esc(JSON.stringify(t.details, null, 2))}</pre></div></div>`
    )
    .join('');
}
function renderProfile() {
  const l = state.profile;
  if (!l) return;
  document.querySelector('#main').innerHTML =
    heading(
      esc(l.name),
      `${esc(l.email || l.phone || '')} · ${esc(l.source)}`,
      `<button class="btn" data-nav="conversations">${icon('back')} Conversations</button>`
    ) +
    `<div class="profile-grid"><section class="panel"><div class="between"><div class="row">${badge(
      l.stage
    )}${badge(l.category)}${
      l.opt_out ? badge('Stopped') : ''
    }</div><button class="btn" data-change-stage>Change stage</button></div><div class="tabs form-footer">${[
      ['timeline', 'Timeline'],
      ['data', 'Data'],
      ['score', 'Score'],
      ['appointments', 'Meetings']
    ]
      .map(
        ([key, label]) =>
          `<button class="tab ${
            state.tab === key ? 'active' : ''
          }" data-tab="${key}">${label}</button>`
      )
      .join(
        ''
      )}</div><div>${profileContent()}</div></section><aside class="stack"><section class="panel"><div class="section-title">Conversation control</div><div class="stack"><div class="between"><span class="small muted">Owner</span>${badge(
      l.owner
    )}</div><button class="btn" data-control="${l.owner === 'AI' ? 'takeover' : 'return-to-ai'}">${
      l.owner === 'AI' ? 'Take over' : 'Return to AI'
    }</button><button class="btn" data-control="${l.paused ? 'resume' : 'pause'}">${
      l.paused ? 'Resume' : 'Pause automation'
    }</button>${
      l.opt_out && state.user.role === 'admin'
        ? '<button class="btn danger" data-restore-consent>Restore consent separately</button>'
        : ''
    }${
      l.review_reason
        ? `<div class="attention">${esc(l.review_reason.replaceAll('_', ' '))}</div>`
        : ''
    }</div></section><section class="panel"><div class="section-title">Team notes<button class="icon-btn" data-add-note title="Add note">${icon(
      'plus'
    )}</button></div>${
      l.notes
        .map(
          (n) =>
            `<div class="timeline-item"><div><p>${esc(n.body).replaceAll(
              '\n',
              '<br>'
            )}</p><small>${dt(n.created_at)}</small></div></div>`
        )
        .join('') || '<p class="small muted">Private notes stay with your team.</p>'
    }</section>${
      l.handoffs.length
        ? `<section class="panel"><h3>Handoff summary</h3><p class="small muted email-body">${esc(
            l.handoffs[0].summary
          )}</p></section>`
        : ''
    }</aside></div>`;
}
async function renderActivity() {
  const data = await api('/runs');
  document.querySelector('#main').innerHTML =
    heading(
      'Execution log',
      'What happened, what is waiting, and what needs a closer look.',
      `<button class="btn" data-refresh>${icon('refresh')} Refresh</button>`
    ) +
    `<div class="panel slim"><div class="table-wrap"><table><thead><tr><th>Process</th><th>State</th><th>Lead</th><th>Attempts</th><th>Last update</th><th>Safe actions</th></tr></thead><tbody>${
      data.actions
        .map(
          (a) =>
            `<tr><td><strong>${esc(a.kind)}</strong><div class="table-sub mono">${esc(
              a.error_code || a.id.slice(0, 12)
            )}</div></td><td>${badge(a.state)}</td><td><button class="link" data-profile="${esc(
              a.lead_id
            )}">${esc(
              state.leads.find((l) => l.id === a.lead_id)?.name || a.lead_id?.slice(0, 8) || '—'
            )}</button></td><td>${a.attempts}</td><td class="small muted">${dt(
              a.updated_at
            )}</td><td>${
              a.operation_state === 'unknown'
                ? `<button class="btn" data-reconcile="${esc(a.operation_id)}">Reconcile</button>`
                : a.state === 'failed' && ['turn', 'email', 'followup'].includes(a.kind)
                  ? `<button class="btn" data-retry="${esc(a.id)}">Retry safely</button>`
                  : '<span class="small muted">—</span>'
            }</td></tr>`
        )
        .join('') || '<tr><td colspan="6">No executions yet.</td></tr>'
    }</tbody></table></div></div><div class="panel"><h3>Incoming events</h3><div class="table-wrap"><table><thead><tr><th>Source</th><th>State</th><th>Reason</th><th>Correlation ID</th><th>Resolution</th></tr></thead><tbody>${data.intake
      .map(
        (e) =>
          `<tr><td>${esc(e.source)}</td><td>${badge(e.status)}</td><td class="small muted">${esc(
            e.reason || '—'
          )}</td><td class="mono">${esc(e.correlation_id)}</td><td>${
            e.status === 'needs_resolution'
              ? `<button class="btn" data-resolve-intake="${esc(e.id)}">Resolve</button>`
              : '—'
          }</td></tr>`
      )
      .join('')}</tbody></table></div></div>`;
}
function inputField(label, name, value, type = 'text', help = '') {
  return `<div class="field"><label for="${esc(name)}">${label}</label><input id="${esc(
    name
  )}" name="${esc(name)}" type="${type}" value="${esc(value)}" ${
    type === 'number' ? 'step="any"' : ''
  }>${help ? `<p class="help">${help}</p>` : ''}</div>`;
}
function settingsForm() {
  const s = state.settings,
    t = state.settingsTab;
  if (t === 'company')
    return `<h2>Make it your workspace</h2><p class="description">Company details, service coverage and consultation availability. Demo cities and budget thresholds are synthetic.</p><form data-form="settings-company"><div class="form-grid">${inputField(
      'Company name',
      'company',
      s.company
    )}${inputField(
      'IANA time zone',
      'timezone',
      s.timezone,
      'text',
      'For example Asia/Manila or America/New_York'
    )}${inputField('Currency', 'currency', s.currency)}${inputField(
      'Services, comma-separated',
      'services',
      s.services.join(', ')
    )}<div class="field full-width"><label>Service cities / postcodes, one per line</label><textarea name="areas">${esc(
      s.areas.join('\n')
    )}</textarea></div>${inputField(
      'Working day begins',
      'hours_start',
      s.hours.start,
      'time'
    )}${inputField(
      'Working day ends',
      'hours_end',
      s.hours.end,
      'time'
    )}<div class="field full-width"><label>Working days</label><div class="day-list">${[
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat'
    ]
      .map(
        (day, i) =>
          `<label class="check-row"><input type="checkbox" name="day_${i}" ${
            s.hours.days.includes(i) ? 'checked' : ''
          }>${day}</label>`
      )
      .join('')}</div></div>${inputField(
      'Consultation length (minutes)',
      'duration',
      s.duration,
      'number'
    )}${inputField('Buffer (minutes)', 'buffer', s.buffer, 'number')}${inputField(
      'Booking horizon (days)',
      'horizon',
      s.horizon,
      'number'
    )}${inputField(
      'Minimum notice (minutes)',
      'minimumNotice',
      s.minimumNotice,
      'number'
    )}<div class="field full-width"><label>Active deal policy</label><select name="deduplication"><option value="one_active_per_contact" ${
      s.deduplication === 'one_active_per_contact' ? 'selected' : ''
    }>One active deal per contact</option><option value="one_active_per_contact_service" ${
      s.deduplication === 'one_active_per_contact_service' ? 'selected' : ''
    }>One active deal per contact and service</option></select></div><div class="field full-width"><label>Brand voice</label><textarea name="brandVoice">${esc(
      s.brandVoice
    )}</textarea></div></div><div class="form-footer"><button class="btn primary">Save company settings</button></div></form>`;
  if (t === 'questions')
    return `<h2>A thoughtful qualification flow</h2><p class="description">One question at a time. Service and location are always required. Unknown optional answers are never invented.</p><form data-form="settings-questions">${s.questions
      .map(
        (q, i) =>
          `<div class="question-item"><div class="between"><span class="micro muted">${
            i + 1
          } · ${esc(
            q.field.replaceAll('_', ' ')
          )}</span><label class="check-row"><input type="checkbox" name="required_${i}" ${
            q.required ? 'checked' : ''
          } ${
            ['service_type', 'location'].includes(q.field) ? 'disabled' : ''
          }>Required</label></div><input aria-label="Question ${
            i + 1
          }" name="question_${i}" value="${esc(q.text)}"><div class="form-footer">${
            i
              ? `<button type="button" class="btn subtle" data-question-up="${i}">Move up ↑</button>`
              : ''
          }</div></div>`
      )
      .join(
        ''
      )}<div class="form-footer"><button class="btn primary">Save questions</button></div></form>`;
  if (t === 'faq')
    return `<h2>Answers grounded in your business</h2><p class="description">Only these approved answers are used. Questions beyond the FAQ are passed to a person.</p><form data-form="settings-faq">${s.faq
      .map(
        (f, i) =>
          `<div class="faq-item"><label>Question ${
            i + 1
          }</label><input name="faq_question_${i}" value="${esc(
            f.question
          )}"><label>Approved answer</label><textarea name="faq_answer_${i}">${esc(
            f.answer
          )}</textarea><label>Matching phrases, comma-separated</label><input name="faq_keywords_${i}" value="${esc(
            f.keywords.join(', ')
          )}"></div>`
      )
      .join(
        ''
      )}<div class="field"><label>Topics that require a person, one per line</label><textarea name="bannedTopics">${esc(
      s.bannedTopics.join('\n')
    )}</textarea></div><div class="form-footer"><button class="btn" type="button" data-add-faq>${icon(
      'plus'
    )} Add FAQ</button><button class="btn primary">Save knowledge</button></div></form>`;
  if (t === 'scoring') {
    const r = state.rules[0].data;
    return `<h2>Explain every score</h2><p class="description">Publish a new immutable version. Existing leads keep their current rules until you explicitly recalculate them.</p><form data-form="settings-rules"><div class="form-grid">${Object.entries(
      r.weights
    )
      .map(([k, v]) => inputField(`${k[0].toUpperCase() + k.slice(1)} weight`, k, v, 'number'))
      .join('')}${inputField(
      'Demo budget threshold',
      'threshold',
      r.threshold,
      'number'
    )}${inputField('Hot threshold', 'hot', r.hot, 'number')}${inputField(
      'Warm threshold',
      'warm',
      r.warm,
      'number'
    )}</div><div class="form-footer"><button class="btn primary">Publish rules v${
      state.rules[0].version + 1
    }</button></div></form><hr class="form-divider"><h3>Published versions</h3>${state.rules
      .map(
        (r) =>
          `<div class="timeline-item"><span class="timeline-dot"></span><div><p>Version ${
            r.version
          }</p><small>${dt(r.created_at)} · ${esc(r.content_hash.slice(0, 16))}</small></div></div>`
      )
      .join('')}`;
  }
  if (t === 'followup')
    return `<h2>Follow up, without overstepping</h2><p class="description">Three touches per sequence, per lead. Replies, takeover, booking, pause and opt-out stop pending outreach. Times below are minutes from the start of a waiting period.</p><form data-form="settings-followup">${[
      'qualification_abandoned',
      'qualified_not_booked'
    ]
      .map(
        (type) =>
          `<h3>${
            type === 'qualification_abandoned'
              ? 'Unfinished qualification'
              : 'Qualified, not yet booked'
          }</h3><div class="form-grid faq-item">${s.followup[type]
            .map((v, i) => inputField(`Touch ${i + 1} (minutes)`, `${type}_${i}`, v, 'number'))
            .join('')}</div>`
      )
      .join('')}${inputField(
      'Email subject',
      'subject',
      s.followup.subject
    )}<div class="field"><label>Message</label><textarea name="text">${esc(
      s.followup.text
    )}</textarea><p class="help">A secure return link and a separate unsubscribe link are added automatically.</p></div><div class="form-footer"><button class="btn primary">Save follow-up settings</button></div></form>`;
  return '';
}
function renderSettings() {
  document.querySelector('#main').innerHTML =
    heading('Workspace settings', 'Clear rules make better conversations.') +
    `<div class="settings-layout"><nav class="settings-nav">${[
      ['company', 'Company & availability'],
      ['questions', 'Qualification'],
      ['faq', 'Knowledge & safety'],
      ['scoring', 'Scoring rules'],
      ['followup', 'Email follow-up']
    ]
      .map(
        ([key, label]) =>
          `<button data-settings-tab="${key}" class="${
            state.settingsTab === key ? 'active' : ''
          }">${label}</button>`
      )
      .join('')}</nav><div><div class="provider-grid">${Object.entries(state.meta.providers)
      .map(
        ([key, value]) =>
          `<div class="provider-card"><h3>${esc(key.toUpperCase())}</h3>${badge(
            value === 'mock' ? 'Mock' : value
          )}<p class="table-sub">Configured via environment</p></div>`
      )
      .join('')}</div><section class="settings-card">${
      state.user.role === 'admin'
        ? settingsForm()
        : '<div class="attention">An administrator is required to edit settings.</div>'
    }</section></div></div>`;
}
async function renderOutbox() {
  const messages = await api('/outbox');
  state.outbox = messages;
  document.querySelector('#main').innerHTML =
    heading(
      'Demo email outbox',
      'Preview the exact email payload. These messages were saved locally, not delivered.',
      `<button class="btn" data-refresh>${icon('refresh')} Refresh</button>`
    ) +
    `<div class="panel slim"><table><thead><tr><th>Recipient</th><th>Subject</th><th>Saved at</th><th></th></tr></thead><tbody>${
      messages
        .map(
          (m) =>
            `<tr><td>${esc(m.payload.to)}</td><td>${esc(m.payload.subject)}</td><td>${dt(
              m.created_at
            )}</td><td><button class="btn" data-open-email="${esc(
              m.id
            )}">Preview</button></td></tr>`
        )
        .join('') ||
      '<tr><td colspan="4">No mock emails yet. Send an authenticated webhook to test invitation delivery.</td></tr>'
    }</tbody></table></div>`;
}
async function loadData() {
  const request = ++listRequest,
    view = state.view;
  listLoads++;
  document.querySelector('#lead-list,#leads-table')?.setAttribute('aria-busy', 'true');
  try {
    const query = new URLSearchParams({
      q: state.search,
      filter: state.filter,
      page: state.page,
      pageSize: state.pageSize
    });
    const data = await api('/leads?' + query);
    if (request !== listRequest || view !== state.view) return false;
    state.leads = data.items;
    state.total = data.total;
    state.page = data.page;
    state.pageSize = data.pageSize;
    state.stats = data.stats;
    if (!state.leadId && state.leads.length && innerWidth > 650) state.leadId = state.leads[0].id;
    const leadId = state.leadId;
    if (leadId) {
      const profile = await api('/leads/' + leadId);
      if (request !== listRequest || view !== state.view || leadId !== state.leadId) return false;
      state.profile = profile;
    }
    return true;
  } finally {
    listLoads--;
    if (!listLoads)
      document.querySelector('#lead-list,#leads-table')?.setAttribute('aria-busy', 'false');
  }
}
async function renderView() {
  try {
    if (
      ['conversations', 'leads', 'profile', 'activity'].includes(state.view) &&
      !(await loadData())
    )
      return;
    if (state.view === 'conversations') renderInbox();
    if (state.view === 'leads') renderLeads();
    if (state.view === 'profile') renderProfile();
    if (state.view === 'activity') await renderActivity();
    if (state.view === 'settings') {
      state.settings = await api('/settings');
      state.rules = await api('/rules');
      renderSettings();
    }
    if (state.view === 'outbox') await renderOutbox();
  } catch (error) {
    toast(error.message, true);
    if (error.status === 401) location.href = '/login';
  }
}
function loginPage(enquiry = false) {
  const services = state.meta.services || [
    'roofing',
    'extensions',
    'pool installation',
    'concrete works'
  ];
  root.innerHTML = `<div class="login-layout"><section class="login-hero"><a href="/" class="brand"><span class="brand-mark">L</span>leadloom</a><div class="hero-copy"><p class="eyebrow">${
    enquiry ? 'ACME HOME IMPROVEMENTS' : 'A CALMER WAY TO GROW'
  }</p><h1>${
    enquiry
      ? 'Great projects start with a <em>conversation.</em>'
      : 'Good conversations.<br><em>Better possibilities.</em>'
  }</h1><p>${
    enquiry
      ? 'Tell us what you have in mind. We’ll ask a few questions, find the right next step, and help you arrange a consultation.'
      : 'A thoughtful assistant for your next customer. From the first hello to a consultation, keep every conversation moving with clarity.'
  }</p>${
    enquiry
      ? `<div class="enquiry-services">${services
          .map((s) => `<span>${esc(s)}</span>`)
          .join('')}</div>`
      : `<div class="hero-mini"><div class="avatar">${icon(
          'spark'
        )}</div><div><strong class="small">Human when it matters.</strong><p>AI handles the questions. Your team stays in control of every next step.</p></div></div>`
  }</div><div class="hero-footer"><span>Thoughtful by design.</span><span>Leadloom · Local edition</span></div></section><section class="login-form-side"><div class="login-form"><h2>${
    enquiry ? 'Let’s talk about your project.' : 'Welcome back.'
  }</h2><p>${
    enquiry
      ? 'A few details to get started. Your conversation is private and saved as you go.'
      : 'Sign in to your workspace and pick up where the conversation left off.'
  }</p><form data-form="${enquiry ? 'enquiry' : 'login'}">${
    enquiry ? inputField('Your name', 'name', '') : ''
  }${inputField('Email address', 'email', '', 'email')}${
    enquiry
      ? `${inputField(
          'Phone (optional, international format)',
          'phone',
          '',
          'tel'
        )}<div class="field"><label for="service_type">What are you planning?</label><select name="service_type" id="service_type"><option value="">I’ll tell you in the chat</option>${services
          .map((s) => `<option value="${esc(s)}">${esc(s[0].toUpperCase() + s.slice(1))}</option>`)
          .join('')}</select></div>`
      : inputField('Password', 'password', '', 'password')
  }<button type="submit" class="btn primary large full">${
    enquiry ? 'Start my conversation' : 'Sign in to workspace'
  } ${icon('arrow')}</button></form>${
    !enquiry && state.meta.demo
      ? '<div class="demo-credentials"><strong>Demo workspace</strong><br>Sign in with the credentials provided by your administrator.<br>Demo uses a deterministic parser, mock calendar and local email outbox.</div>'
      : ''
  }<p class="login-footer">${
    enquiry
      ? `${icon('lock')} Secure chat · No unsolicited outreach`
      : 'Visiting as a customer? <a class="link" href="/enquire">Start an enquiry ↗</a>'
  }</p></div></section></div>`;
}
function accessPage(unsubscribe = false, error = '') {
  root.innerHTML = `<div class="public-shell"><div class="public-header"><a class="brand" href="/enquire"><span class="brand-mark">L</span>leadloom</a><span class="small muted">Secure conversation</span></div><section class="access-box"><span class="brand-mark">L</span><h2>${
    unsubscribe
      ? state.linkToken
        ? 'Stop automated outreach'
        : 'Unsubscribe link required'
      : state.linkToken
        ? 'Continue your conversation'
        : 'Welcome to your secure chat'
  }</h2><p>${esc(
    error ||
      (unsubscribe
        ? state.linkToken
          ? 'Confirm below to stop automated messages. Your existing appointment will not be cancelled.'
          : 'Open the unsubscribe link in your email, or type STOP in your existing chat. No preferences have been changed.'
        : state.linkToken
          ? 'This private link is exchanged only when you press Continue. Your email preview has not used it.'
          : 'Start a new enquiry or request a fresh link for a previously verified email address.')
  )}</p>${
    state.linkToken
      ? `<button class="btn primary large full" ${
          unsubscribe ? 'data-confirm-unsubscribe' : 'data-exchange'
        }>${unsubscribe ? 'Unsubscribe' : 'Continue securely'} ${icon('lock')}</button>`
      : unsubscribe
        ? '<a class="btn" href="/chat">Go to your chat</a>'
        : `<form data-form="request-access">${inputField(
          'Email address',
          'email',
          '',
          'email'
        )}<button class="btn primary full">Request a new link</button></form><div class="form-footer"><a class="link small" href="/enquire">Start a new enquiry ↗</a></div>`
  }</section></div>`;
}
function publicPage() {
  const p = state.public;
  if (!p) return;
  const a = p.appointment,
    status = p.stopped
      ? 'Automation is stopped. New messages will not restore consent.'
      : p.owner === 'HUMAN'
        ? 'A team member will continue here during working hours.'
        : p.paused
          ? 'Automation is paused. Your messages are saved.'
          : 'Your project assistant is here. You can ask for a person at any time.';
  if (!document.querySelector('#public-content'))
    root.innerHTML = `<div class="public-shell"><header class="public-header"><div class="row"><span class="brand-mark">L</span><div><div class="brand">${esc(
      p.company
    )}</div><p>Let’s make room for your next project.</p></div></div><span class="small muted">${icon(
      'lock'
    )} Private chat</span></header><div class="public-card" id="public-content"></div><footer class="public-footer">Thoughtfully powered by <strong>leadloom</strong>${
      p.demo ? ' · Demo providers are not real deliveries' : ''
    }</footer></div>`;
  patch(
    'public-content',
    `<div class="public-status">${icon(
      p.stopped ? 'pause' : p.owner === 'HUMAN' ? 'users' : 'spark'
    )}${esc(status)}</div><div class="chat-scroll">${messagesHtml(p.messages, true)}${
      a
        ? `<div class="appointment-card"><strong>${
            a.status === 'confirmed'
              ? 'Your consultation is confirmed'
              : a.status === 'pending'
                ? 'Your booking is being processed'
                : 'Our team is checking your booking'
          }</strong><p>${esc(
            new Intl.DateTimeFormat('en-GB', {
              timeZone: a.timezone,
              dateStyle: 'full',
              timeStyle: 'short'
            }).format(new Date(a.start_at))
          )}</p><p>${esc(a.timezone)} · ${esc(p.providers.calendar)} calendar</p></div>`
        : ''
    }</div>${
      p.can_book
        ? `<div class="slots-panel"><h3>Your next step</h3><p>Times are shown in ${esc(
            p.timezone
          )} and checked again when you book.</p>${
            state.slots
              ? `<div class="slot-grid">${state.slots
                  .map(
                    (s) =>
                      `<button class="slot-button" data-book-slot="${esc(s.id)}">${icon(
                        'calendar'
                      )} ${esc(s.label)}</button>`
                  )
                  .join(
                    ''
                  )}</div><div class="form-footer"><button class="btn" data-get-slots>Refresh available times</button></div>`
              : '<div class="form-footer"><button class="btn primary" data-get-slots>Choose a consultation time</button></div>'
          }</div>`
        : ''
    }<form class="composer" data-form="chat-message"><textarea name="body" data-persist="public-composer" aria-label="Your message" placeholder="Tell us a little about your project…" maxlength="4000" required></textarea><div class="composer-footer"><span class="composer-hint">${icon(
      'lock'
    )} Private and saved. Type STOP to opt out.</span><button class="btn primary" type="submit">Send message ${icon(
      'send'
    )}</button></div></form>`
  );
}
async function refreshPublic() {
  try {
    state.public = await api('/public/chat');
    security.visitor = state.public.csrf;
    publicPage();
  } catch (error) {
    if (error.status === 401) {
      state.public = null;
      accessPage(false);
    } else toast(error.message, true);
  }
}
async function refresh() {
  if (state.public) {
    await refreshPublic();
    return;
  }
  if (!state.user) return;
  await renderView();
}
function pendingKey(scope, body) {
  const storageKey = `leadloom-pending:${scope}`;
  try {
    const old = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (old?.body === body) return old.key;
    const key = uid();
    sessionStorage.setItem(storageKey, JSON.stringify({ body, key }));
    return key;
  } catch {
    return uid();
  }
}
function clearPending(scope) {
  try {
    sessionStorage.removeItem(`leadloom-pending:${scope}`);
  } catch {}
}
function editFieldsModal() {
  const l = state.profile;
  const f = l.fields;
  state.editOriginal = { ...f };
  modal(
    'Project details',
    `<p class="small muted">Edits are locked by default. AI will flag conflicting answers instead of overwriting your values.</p><form data-form="edit-fields"><div class="form-grid faq-item">${inputField(
      'Service',
      'service_type',
      f.service_type || ''
    )}${inputField('City / postcode', 'location', f.location || '')}${inputField(
      'Budget minimum',
      'budget_min',
      f.budget_min ?? '',
      'number'
    )}${inputField('Budget maximum', 'budget_max', f.budget_max ?? '', 'number')}${inputField(
      'Timeline upper bound (months)',
      'timeline',
      f.timeline ?? '',
      'number'
    )}<div class="field"><label>Decision maker</label><select name="decision_maker"><option value="">Unknown</option><option value="true" ${
      f.decision_maker === true ? 'selected' : ''
    }>Yes</option><option value="false" ${
      f.decision_maker === false ? 'selected' : ''
    }>No</option></select></div><div class="field"><label>Preferred contact</label><select name="preferred_contact"><option value="">Unknown</option>${[
      'chat',
      'email',
      'phone'
    ]
      .map((v) => `<option ${f.preferred_contact === v ? 'selected' : ''}>${v}</option>`)
      .join(
        ''
      )}</select></div></div><label class="check-row"><input type="checkbox" name="locked" checked>Lock changed fields against AI overwrites</label>${Object.entries(
      l.meta
    )
      .filter(([, m]) => m.locked)
      .map(
        ([k]) =>
          `<label class="check-row"><input type="checkbox" name="unlock_${esc(k)}">Unlock ${esc(
            k.replaceAll('_', ' ')
          )}</label>`
      )
      .join(
        ''
      )}<div class="form-footer"><button class="btn" type="button" data-close-modal>Cancel</button><button class="btn primary">Save changes</button></div></form>`
  );
}
function questionDraft() {
  const form = document.querySelector('[data-form="settings-questions"]');
  if (!form) return;
  const d = new FormData(form);
  state.settings.questions.forEach((q, i) => {
    q.text = String(d.get(`question_${i}`));
    q.required = ['service_type', 'location'].includes(q.field) || d.has(`required_${i}`);
  });
}
function faqDraft() {
  const form = document.querySelector('[data-form="settings-faq"]');
  if (!form) return;
  const d = new FormData(form);
  state.settings.faq.forEach((f, i) => {
    f.question = String(d.get(`faq_question_${i}`));
    f.answer = String(d.get(`faq_answer_${i}`));
    f.keywords = String(d.get(`faq_keywords_${i}`))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  });
  state.settings.bannedTopics = String(d.get('bannedTopics'))
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}
async function saveSettings() {
  state.settings = await api('/settings', { method: 'PUT', body: state.settings });
  toast('Workspace settings saved');
  renderSettings();
}
document.addEventListener('click', async (event) => {
  const button = event.target.closest('button,[data-profile]');
  if (!button) return;
  try {
    if (button.hasAttribute('data-close-modal')) return closeModal();
    if (button.dataset.nav) return await navigate(button.dataset.nav);
    if (button.dataset.profile) return await navigate('profile', button.dataset.profile);
    if (button.hasAttribute('data-logout')) {
      await post('/auth/logout');
      location.href = '/login';
      return;
    }
    if (button.hasAttribute('data-refresh')) return await refresh();
    if (button.dataset.lead) {
      listRequest++;
      const leadId = (state.leadId = button.dataset.lead),
        profile = await api('/leads/' + leadId);
      if (state.leadId === leadId && state.view === 'conversations') {
        state.profile = profile;
        renderInbox();
      }
      return;
    }
    if (button.hasAttribute('data-back-list')) {
      state.leadId = null;
      state.profile = null;
      return renderInbox();
    }
    if (button.dataset.filter) {
      clearTimeout(searchTimer);
      state.filter = button.dataset.filter;
      state.page = 1;
      return await renderView();
    }
    if (button.dataset.page) {
      clearTimeout(searchTimer);
      state.page = Number(button.dataset.page);
      return await renderView();
    }
    if (button.dataset.tab) {
      state.tab = button.dataset.tab;
      return renderProfile();
    }
    if (button.dataset.settingsTab) {
      state.settingsTab = button.dataset.settingsTab;
      return renderSettings();
    }
    if (button.hasAttribute('data-edit-fields')) return editFieldsModal();
    if (button.dataset.control) {
      const command = button.dataset.control;
      if (command === 'return-to-ai' && state.profile.review_reason) {
        return modal(
          'Resolve review and return to AI',
          `<form data-form="control"><input type="hidden" name="command" value="return-to-ai"><div class="attention">${esc(
            state.profile.review_reason.replaceAll('_', ' ')
          )}</div><div class="faq-item"><label>Resolution notes</label><textarea name="reason" required minlength="3" placeholder="Explain how this review was resolved"></textarea></div><p class="small muted">This does not remove a pause or restore opt-out consent.</p><div class="form-footer"><button class="btn primary">Resolve and return to AI</button></div></form>`
        );
      }
      await post(`/leads/${state.leadId}/${command}`);
      toast('Conversation control updated');
      return await refresh();
    }
    if (button.hasAttribute('data-restore-consent'))
      return modal(
        'Restore automation consent',
        `<form data-form="control"><input type="hidden" name="command" value="restore-consent"><p class="small muted">Record the contact’s new explicit consent. This does not automatically return ownership to AI or restart old follow-ups.</p><div class="faq-item"><label>Evidence / reason</label><textarea name="reason" required></textarea></div><label class="check-row"><input type="checkbox" name="confirmed" required>I have verified renewed consent.</label><div class="form-footer"><button class="btn primary">Record renewed consent</button></div></form>`
      );
    if (button.hasAttribute('data-change-stage'))
      return modal(
        'Change deal stage',
        `<form data-form="stage"><div class="field"><label>Stage</label><select name="stage">${[
          'New',
          'Contacted',
          'Qualified',
          'Booked',
          'Proposal',
          'Won',
          'Lost'
        ]
          .map((s) => `<option ${s === state.profile.stage ? 'selected' : ''}>${s}</option>`)
          .join(
            ''
          )}</select></div><div class="faq-item"><label>Reason (required for Lost)</label><textarea name="reason"></textarea></div><div class="form-footer"><button class="btn primary">Update stage</button></div></form>`
      );
    if (button.hasAttribute('data-recalculate')) {
      await post(`/leads/${state.leadId}/recalculate`);
      toast('Recalculated using the latest published rules');
      return await refresh();
    }
    if (button.hasAttribute('data-add-note'))
      return modal(
        'Add a private team note',
        `<form data-form="note"><label>Note</label><textarea name="body" required maxlength="4000"></textarea><div class="form-footer"><button class="btn primary">Save note</button></div></form>`
      );
    if (button.dataset.cancelAppointment)
      return modal(
        'Cancel consultation',
        `<p class="muted small">The existing appointment remains confirmed until the calendar acknowledges cancellation. Follow-ups will not restart automatically.</p><form data-form="cancel-appointment"><input type="hidden" name="appointmentId" value="${esc(
          button.dataset.cancelAppointment
        )}"><div class="form-footer"><button type="button" class="btn" data-close-modal>Keep appointment</button><button class="btn danger">Confirm cancellation</button></div></form>`
      );
    if (button.dataset.moveAppointment) {
      const data = await api(`/appointments/${button.dataset.moveAppointment}/availability`);
      state.moveAppointment = button.dataset.moveAppointment;
      return modal(
        'Choose a new consultation time',
        `<p class="small muted">${esc(
          data.timezone
        )} · The current booking stays active until this change is confirmed.</p><div class="slot-grid">${
          data.slots
            .map(
              (s) =>
                `<button class="slot-button" data-reschedule-slot="${esc(s.id)}">${esc(
                  s.label
                )}</button>`
            )
            .join('') || 'No free times in the current search window.'
        }</div>`
      );
    }
    if (button.dataset.rescheduleSlot) {
      await post(`/appointments/${state.moveAppointment}/reschedule`, {
        offerId: button.dataset.rescheduleSlot,
        key: uid()
      });
      closeModal();
      toast('Reschedule request saved; awaiting calendar confirmation');
      return await refresh();
    }
    if (button.dataset.reconcile) {
      const result = await post(`/operations/${button.dataset.reconcile}/reconcile`);
      toast(
        result.state === 'confirmed'
          ? 'External result confirmed'
          : 'Result still uncertain. No blind resend was made.'
      );
      return await refresh();
    }
    if (button.dataset.retry) {
      await post(`/runs/${button.dataset.retry}/retry`);
      toast('Safe retry queued');
      return await refresh();
    }
    if (button.dataset.resolveIntake) {
      const contacts = await api('/contacts');
      return modal(
        'Resolve contact conflict',
        `<p class="small muted">Select the correct existing contact after checking the original source. Existing trusted email and phone details will not be overwritten.</p><form data-form="resolve-intake"><input type="hidden" name="eventId" value="${esc(
          button.dataset.resolveIntake
        )}"><div class="faq-item"><label>Correct contact</label><select name="contactId">${contacts
          .map(
            (c) =>
              `<option value="${esc(c.id)}">${esc(c.name)} — ${esc(
                c.email || c.phone || ''
              )}</option>`
          )
          .join(
            ''
          )}</select></div><div class="form-footer"><button class="btn primary">Resolve intake</button></div></form>`
      );
    }
    if (button.dataset.questionUp) {
      questionDraft();
      const i = Number(button.dataset.questionUp);
      [state.settings.questions[i - 1], state.settings.questions[i]] = [
        state.settings.questions[i],
        state.settings.questions[i - 1]
      ];
      return renderSettings();
    }
    if (button.hasAttribute('data-add-faq')) {
      faqDraft();
      state.settings.faq.push({ id: uid(), question: '', answer: '', keywords: [] });
      return renderSettings();
    }
    if (button.dataset.openEmail) {
      const email = state.outbox.find((m) => m.id === button.dataset.openEmail);
      const urls = email.payload.text.match(/https?:\/\/\S+/g) || [];
      return modal(
        'Mock email preview',
        `<p class="small muted">To ${esc(
          email.payload.to
        )} · Saved locally, not delivered</p><h3 class="faq-item">${esc(
          email.payload.subject
        )}</h3><pre>${esc(email.payload.text)}</pre><div class="form-footer">${urls
          .map(
            (u, i) =>
              `<a class="btn ${i ? '' : 'primary'}" href="${esc(
                u
              )}" target="_blank" rel="noopener">${
                i ? 'Open unsubscribe' : 'Open secure chat'
              } ${icon('arrow')}</a>`
          )
          .join('')}</div>`,
        true
      );
    }
    if (button.hasAttribute('data-exchange')) {
      button.disabled = true;
      const data = await post('/public/chat/access', { token: state.linkToken }, true);
      state.linkToken = null;
      security.visitor = data.csrf;
      await refreshPublic();
      return;
    }
    if (button.hasAttribute('data-confirm-unsubscribe')) {
      button.disabled = true;
      await post('/public/unsubscribe', { token: state.linkToken }, true);
      state.linkToken = null;
      root.innerHTML =
        '<div class="access-box"><span class="brand-mark">L</span><h2>You’re unsubscribed.</h2><p>Automated outreach is stopped. Any existing appointment remains unchanged.</p><a class="btn" href="/chat">Back to your chat</a></div>';
      return;
    }
    if (button.hasAttribute('data-get-slots')) {
      button.disabled = true;
      const data = await api('/public/chat/availability');
      state.slots = data.slots;
      await refreshPublic();
      if (!data.slots.length) toast('No slots found; your enquiry has been passed to the team.');
      return;
    }
    if (button.dataset.bookSlot) {
      button.disabled = true;
      const offerId = button.dataset.bookSlot,
        key = pendingKey('booking', offerId);
      await post('/public/chat/appointments', { offerId, key }, true);
      clearPending('booking');
      state.slots = null;
      toast('Your choice is saved. Checking the calendar…');
      return await refreshPublic();
    }
  } catch (error) {
    button.disabled = false;
    if (button.dataset.bookSlot && ['stale_offer', 'slot_taken'].includes(error.code)) {
      state.slots = null;
      clearPending('booking');
      await refreshPublic();
    }
    toast(error.message, true);
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'lead-search') {
    state.search = event.target.value;
    state.page = 1;
    listRequest++;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderView(), 250);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  if (form.dataset.busy) return;
  form.dataset.busy = 'true';
  const button = form.querySelector('button[type="submit"],button:not([type])');
  if (button) button.disabled = true;
  const data = new FormData(form),
    value = (name) => String(data.get(name) || ''),
    kind = form.dataset.form;
  try {
    if (kind === 'login') {
      const result = await post('/auth/login', {
        email: value('email'),
        password: value('password')
      });
      security.staff = result.csrf;
      location.href = '/';
    } else if (kind === 'enquiry') {
      const payload = {
        name: value('name'),
        email: value('email'),
        phone: value('phone'),
        service_type: value('service_type')
      };
      payload.event_key = pendingKey('intake', JSON.stringify(payload));
      const result = await post('/public/intake', payload, true);
      if (result.status === 'accepted') {
        clearPending('intake');
        location.href = '/chat';
      } else if (result.status === 'access_required') {
        toast(result.message);
        location.href = '/chat';
      } else toast(result.reason || 'Please check the enquiry details', true);
    } else if (kind === 'manager-message' || kind === 'chat-message') {
      const body = value('body'),
        scope = kind === 'chat-message' ? 'visitor-message' : `staff:${state.leadId}`,
        key = pendingKey(scope, body);
      if (kind === 'chat-message') await post('/public/chat/messages', { body, key }, true);
      else await post(`/leads/${state.leadId}/messages`, { body, key });
      clearPending(scope);
      form.querySelector('textarea').value = '';
      if (kind === 'chat-message') {
        state.slots = null;
        await refreshPublic();
      } else await refresh();
    } else if (kind === 'edit-fields') {
      const changed = {},
        unlock = [];
      for (const field of [
        'service_type',
        'location',
        'budget_min',
        'budget_max',
        'timeline',
        'decision_maker',
        'preferred_contact'
      ]) {
        const raw = value(field),
          v =
            raw === ''
              ? null
              : ['budget_min', 'budget_max', 'timeline'].includes(field)
                ? Number(raw)
                : field === 'decision_maker'
                  ? raw === 'true'
                  : raw;
        if (JSON.stringify(state.editOriginal[field] ?? null) !== JSON.stringify(v))
          changed[field] = v;
        if (data.has(`unlock_${field}`)) unlock.push(field);
      }
      await api(`/leads/${state.leadId}`, {
        method: 'PATCH',
        body: { fields: changed, locked: data.has('locked'), unlock }
      });
      closeModal();
      toast('Project details saved');
      await refresh();
    } else if (kind === 'control') {
      await post(`/leads/${state.leadId}/${value('command')}`, {
        reason: value('reason'),
        confirmed: data.has('confirmed')
      });
      closeModal();
      toast('Conversation control updated');
      await refresh();
    } else if (kind === 'stage') {
      await post(`/leads/${state.leadId}/stage`, {
        stage: value('stage'),
        reason: value('reason')
      });
      closeModal();
      toast('Deal stage updated');
      await refresh();
    } else if (kind === 'note') {
      await post(`/leads/${state.leadId}/notes`, { body: value('body') });
      closeModal();
      toast('Private note saved');
      await refresh();
    } else if (kind === 'cancel-appointment') {
      await post(`/appointments/${value('appointmentId')}/cancel`, { key: uid() });
      closeModal();
      toast('Cancellation request saved');
      await refresh();
    } else if (kind === 'resolve-intake') {
      await post(`/intake-events/${value('eventId')}/resolve`, { contactId: value('contactId') });
      closeModal();
      toast('Intake resolution saved');
      await refresh();
    } else if (kind === 'settings-company') {
      const s = state.settings;
      for (const k of ['company', 'timezone', 'currency', 'brandVoice', 'deduplication'])
        s[k] = value(k);
      s.services = value('services')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      s.areas = value('areas')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      s.hours = {
        start: value('hours_start'),
        end: value('hours_end'),
        days: [0, 1, 2, 3, 4, 5, 6].filter((i) => data.has(`day_${i}`))
      };
      for (const k of ['duration', 'buffer', 'horizon', 'minimumNotice']) s[k] = Number(value(k));
      await saveSettings();
    } else if (kind === 'settings-questions') {
      questionDraft();
      await saveSettings();
    } else if (kind === 'settings-faq') {
      faqDraft();
      await saveSettings();
    } else if (kind === 'settings-followup') {
      for (const type of ['qualification_abandoned', 'qualified_not_booked'])
        state.settings.followup[type] = [0, 1, 2].map((i) => Number(value(`${type}_${i}`)));
      state.settings.followup.subject = value('subject');
      state.settings.followup.text = value('text');
      await saveSettings();
    } else if (kind === 'settings-rules') {
      const rules = structuredClone(state.rules[0].data);
      for (const key of Object.keys(rules.weights)) rules.weights[key] = Number(value(key));
      for (const key of ['threshold', 'hot', 'warm']) rules[key] = Number(value(key));
      await post('/rules', rules);
      state.rules = await api('/rules');
      toast('New rules version published');
      renderSettings();
    } else if (kind === 'request-access') {
      const r = await post('/public/chat/request-access', { email: value('email') }, true);
      toast(r.message);
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    delete form.dataset.busy;
    if (button) button.disabled = false;
  }
});
async function boot() {
  try {
    state.meta = await api('/meta');
    const path = location.pathname;
    if (path === '/enquire') {
      loginPage(true);
      return;
    }
    if (path === '/login') {
      loginPage(false);
      return;
    }
    if (path === '/chat' || path === '/unsubscribe') {
      const fragment = new URLSearchParams(location.hash.slice(1));
      state.linkToken = fragment.get('token');
      if (state.linkToken) history.replaceState({}, '', path);
      if (state.linkToken || path === '/unsubscribe') {
        accessPage(path === '/unsubscribe');
        return;
      }
      await refreshPublic();
      return;
    }
    const me = await api('/me');
    state.user = me.user;
    security.staff = me.csrf;
    const match = path.match(/^\/leads\/([\w-]+)$/);
    if (match) {
      state.leadId = match[1];
      state.view = 'profile';
    } else state.view = path === '/' || path === '/conversations' ? 'conversations' : path.slice(1);
    await navigate(state.view, state.leadId, false);
  } catch (error) {
    if (error.status === 401) {
      location.href = '/login';
      return;
    }
    root.innerHTML = empty('Cannot open the workspace', error.message);
  }
}
window.addEventListener('popstate', () => {
  state.profile = null;
  boot();
});
setInterval(async () => {
  if (document.hidden || document.querySelector('.modal')) return;
  try {
    if (location.pathname === '/chat' && state.public) {
      await refreshPublic();
      return;
    }
    if (state.user && state.view === 'conversations' && !listLoads) {
      if (await loadData()) renderInbox();
    }
    if (state.user && state.view === 'profile') {
      state.profile = await api('/leads/' + state.leadId);
      const selected = window.getSelection()?.toString();
      if (!selected) renderProfile();
    }
    const indicator = document.querySelector('#connection-status');
    if (indicator) indicator.textContent = 'Connected';
  } catch {
    const indicator = document.querySelector('#connection-status');
    if (indicator) indicator.textContent = 'Reconnecting…';
  }
}, 1800);
boot();
