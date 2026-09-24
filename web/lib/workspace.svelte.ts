import { SvelteURLSearchParams } from 'svelte/reactivity';
import { api, ApiError, security } from './api.ts';
import { listPath, readListState } from './list-state.ts';
import type { User, Meta, Lead, LeadSummary, LeadList, PublicChat, Modal } from './types.ts';
export const ui = $state({
  route: location.pathname,
  ready: false,
  navigating: false,
  error: '',
  user: null as User | null,
  meta: null as Meta | null,
  leads: [] as LeadSummary[],
  total: 0,
  page: 1,
  pageSize: 50,
  search: '',
  filter: 'all',
  leadId: '',
  profile: null as Lead | null,
  stats: { total: 0, open: 0, ai: 0, attention: 0, booked: 0 },
  chat: null as PublicChat | null,
  token: null as string | null,
  unsubscribed: false,
  changeCount: 0,
  modal: null as Modal | null,
  busy: false,
  loading: false,
  connected: true,
  toast: '',
  toastError: false
});
let generation = 0;
let navigation = 0;
let publicRequest = 0;
let searchTimer: ReturnType<typeof setTimeout>;
let toastTimer: ReturnType<typeof setTimeout>;
const listLocations: Record<string, string> = {};
const listRoute = (path: string) => (path === '/conversations' ? '/' : path);
export function rememberList(push = false) {
  if (!['/', '/conversations', '/leads'].includes(ui.route)) return;
  const path = listPath(ui.route, ui);
  listLocations[listRoute(ui.route)] = path;
  if (path !== location.pathname + location.search)
    history[push ? 'pushState' : 'replaceState']({ lists: { ...listLocations } }, '', path);
}
export function notify(message: string, error = false) {
  ui.toast = message;
  ui.toastError = error;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = '';
  }, 6000);
}
export async function run(work: () => Promise<void>, onError?: (error: unknown) => void) {
  // ponytail: serialize UI mutations; use per-form locks if independent concurrent edits are needed.
  if (ui.busy) return false;
  ui.busy = true;
  try {
    await work();
    return true;
  } catch (error) {
    if (onError) onError(error);
    else notify(error instanceof Error ? error.message : 'Request failed', true);
    if (error instanceof ApiError && error.status === 401 && ui.user) location.assign('/login');
    return false;
  } finally {
    ui.busy = false;
  }
}
export async function submit(
  event: SubmitEvent,
  work: (data: FormData) => Promise<void>,
  onError?: (error: unknown) => void
) {
  event.preventDefault();
  const data = new FormData(event.currentTarget as HTMLFormElement);
  return run(() => work(data), onError);
}
export function navigate(path: string) {
  rememberList();
  history.pushState({ lists: { ...listLocations } }, '', listLocations[listRoute(path)] || path);
  void boot();
}
export async function refreshPublic() {
  const request = generation,
    current = ++publicRequest;
  try {
    const chat = await api<PublicChat>('/public/chat');
    if (request !== generation || current !== publicRequest) return;
    ui.chat = chat;
    security.visitor = chat.csrf;
  } catch (error) {
    if (request !== generation || current !== publicRequest) return;
    if (error instanceof ApiError && error.status === 401) ui.chat = null;
    else throw error;
  }
}
export async function loadLeads() {
  const request = ++generation;
  rememberList();
  ui.loading = true;
  try {
    const data = await api<LeadList>(
      '/leads?' +
        new SvelteURLSearchParams({
          q: ui.search,
          filter: ui.filter,
          page: String(ui.page),
          pageSize: String(ui.pageSize)
        })
    );
    if (request !== generation) return;
    ui.leads = data.items;
    ui.total = data.total;
    ui.page = data.page;
    ui.stats = data.stats;
    if (!ui.leadId && ui.route !== '/leads' && data.items.length && innerWidth > 700)
      ui.leadId = data.items[0].id;
    rememberList();
    const id = ui.leadId;
    if (id) {
      try {
        const profile = await api<Lead>('/leads/' + id);
        if (request === generation && id === ui.leadId) ui.profile = profile;
      } catch (error) {
        // A deleted or mistyped lead must not hide a list that loaded fine.
        if (!(error instanceof ApiError && error.status === 404)) throw error;
        if (request === generation && id === ui.leadId) {
          ui.leadId = '';
          ui.profile = null;
          rememberList();
        }
      }
    }
  } finally {
    if (request === generation) ui.loading = false;
  }
}
export async function selectLead(id: string) {
  if (id === ui.leadId && ui.profile) return;
  const request = ++generation;
  ui.leadId = id;
  ui.profile = null;
  rememberList(true);
  if (!id) {
    ui.loading = false;
    return;
  }
  ui.loading = true;
  try {
    const profile = await api<Lead>('/leads/' + id);
    if (request === generation && id === ui.leadId) ui.profile = profile;
  } finally {
    if (request === generation) ui.loading = false;
  }
}
export function search(text: string) {
  ui.search = text;
  ui.page = 1;
  rememberList();
  generation++;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void loadLeads().catch((error) => notify(error.message, true));
  }, 250);
}
export async function refresh() {
  if (ui.route === '/chat') return refreshPublic();
  if (ui.route.startsWith('/leads/')) {
    const request = ++generation,
      id = ui.leadId;
    const profile = await api<Lead>('/leads/' + id);
    if (request === generation && id === ui.leadId) ui.profile = profile;
  } else if (ui.route === '/' || ui.route === '/conversations' || ui.route === '/leads')
    await loadLeads();
}
export async function boot() {
  const request = ++generation,
    visit = ++navigation;
  clearTimeout(searchTimer);
  Object.assign(listLocations, history.state?.lists || {});
  ui.route = location.pathname;
  ui.error = '';
  const publicRoute = ['/enquire', '/login', '/chat', '/unsubscribe'].includes(ui.route);
  if (!ui.user || publicRoute) ui.ready = false;
  ui.navigating = true;
  ui.modal = null;
  ui.loading = false;
  if (['/', '/conversations', '/leads'].includes(ui.route)) {
    Object.assign(ui, readListState(location.search));
    if (ui.profile?.id !== ui.leadId) ui.profile = null;
  } else {
    ui.profile = null;
  }
  try {
    if (!ui.meta) ui.meta = await api<Meta>('/meta');
    if (request !== generation) return;
    if (['/enquire', '/login'].includes(ui.route)) {
      ui.user = null;
      return;
    }
    if (['/chat', '/unsubscribe'].includes(ui.route)) {
      ui.user = null;
      ui.chat = null;
      ui.unsubscribed = false;
      ui.token = new SvelteURLSearchParams(location.hash.slice(1)).get('token');
      if (ui.token) history.replaceState({}, '', ui.route);
      if (!ui.token && ui.route === '/chat') await refreshPublic();
      return;
    }
    const me = await api<{ user: User; csrf: string }>('/me');
    if (request !== generation) return;
    ui.user = me.user;
    security.staff = me.csrf;
    const match = ui.route.match(/^\/leads\/([\w-]+)$/);
    if (match) {
      ui.leadId = match[1];
      await refresh();
    } else if (['/', '/conversations', '/leads'].includes(ui.route)) await loadLeads();
  } catch (error) {
    if (visit !== navigation) return;
    if (error instanceof ApiError && error.status === 401) {
      location.assign('/login');
      return;
    }
    ui.error = error instanceof Error ? error.message : 'Cannot open the workspace';
  } finally {
    if (visit === navigation) {
      ui.ready = true;
      ui.navigating = false;
    }
  }
}
export function start() {
  void boot();
  const pop = () => {
    void boot();
  };
  window.addEventListener('popstate', pop);
  let polling = false;
  const timer = setInterval(async () => {
    if (
      document.hidden ||
      ui.modal ||
      ui.busy ||
      ui.loading ||
      ui.navigating ||
      !ui.ready ||
      polling ||
      (ui.route === '/chat' && (!ui.chat || ui.token))
    )
      return;
    polling = true;
    try {
      await refresh();
      ui.connected = true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && ui.user) location.assign('/login');
      else ui.connected = false;
    } finally {
      polling = false;
    }
  }, 3000);
  return () => {
    window.removeEventListener('popstate', pop);
    clearInterval(timer);
    clearTimeout(searchTimer);
    clearTimeout(toastTimer);
    generation++;
  };
}
