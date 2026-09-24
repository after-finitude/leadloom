import { SvelteURLSearchParams } from 'svelte/reactivity';
import { api, ApiError, security, isAbort, errorMessage } from './api.ts';
import { listPath, readListState } from './list-state.ts';
import type { User, Meta, Lead, LeadSummary, LeadList, PublicChat, Modal } from './types.ts';
import type { ListFilter } from '../../src/domain.mts';
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
  filter: 'all' as ListFilter,
  leadId: '',
  profile: null as Lead | null,
  stats: { total: 0, open: 0, ai: 0, attention: 0, booked: 0 },
  chat: null as PublicChat | null,
  token: null as string | null,
  unsubscribed: false,
  changeCount: 0,
  modal: null as Modal | null,
  // Mutations in progress, by lock name (see run).
  locks: {} as Record<string, boolean>,
  loading: false,
  loadingProfile: false,
  connected: true,
  toast: '',
  toastError: false
});
type Resource = 'list' | 'profile' | 'chat';
// A newer request for a resource aborts the older one, so a late response never overwrites it.
const controllers: Partial<Record<Resource, AbortController>> = {};
let navigation = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout>;
const listLocations: Record<string, string> = {};
const listRoutes = ['/', '/conversations', '/leads'];
const publicRoutes = ['/enquire', '/login', '/chat', '/unsubscribe'];
const listRoute = (path: string) => (path === '/conversations' ? '/' : path);
function begin(resource: Resource) {
  controllers[resource]?.abort();
  const controller = new AbortController();
  controllers[resource] = controller;
  return controller;
}
function abortAll() {
  for (const controller of Object.values(controllers)) controller?.abort();
  clearTimeout(searchTimer);
  searchTimer = undefined;
}
export function rememberList(push = false) {
  if (!listRoutes.includes(ui.route)) return;
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
// Staff sessions expire on the server; a 401 on a staff page goes back to sign-in.
function sessionExpired(error: unknown) {
  if (!(error instanceof ApiError && error.status === 401) || publicRoutes.includes(ui.route))
    return false;
  location.assign('/login');
  return true;
}
export function report(error: unknown) {
  if (isAbort(error) || sessionExpired(error)) return;
  notify(errorMessage(error), true);
}
export const busy = (lock: string) => !!ui.locks[lock];
const anyBusy = () => Object.values(ui.locks).some(Boolean);
// Runs one mutation per lock at a time; other locks stay usable meanwhile.
export async function run(
  lock: string,
  work: () => Promise<void>,
  onError?: (error: unknown) => void
) {
  if (ui.locks[lock]) return false;
  ui.locks[lock] = true;
  try {
    await work();
    return true;
  } catch (error) {
    if (onError && !isAbort(error)) {
      onError(error);
      sessionExpired(error);
    } else report(error);
    return false;
  } finally {
    ui.locks[lock] = false;
  }
}
export async function submit(
  event: SubmitEvent,
  lock: string,
  work: (data: FormData) => Promise<void>,
  onError?: (error: unknown) => void
) {
  event.preventDefault();
  const data = new FormData(event.currentTarget as HTMLFormElement);
  return run(lock, () => work(data), onError);
}
// Same-page navigation for app links; modified clicks (new tab, download) are left alone.
export function follow(event: MouseEvent) {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const link = event.currentTarget as HTMLAnchorElement;
  navigate(link.pathname + link.search);
}
export function navigate(path: string) {
  rememberList();
  history.pushState({ lists: { ...listLocations } }, '', listLocations[listRoute(path)] || path);
  void boot();
}
export async function refreshPublic() {
  const controller = begin('chat');
  try {
    const chat = await api<PublicChat>('/public/chat', { signal: controller.signal });
    if (controller.signal.aborted) return;
    ui.chat = chat;
    security.visitor = chat.csrf;
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error instanceof ApiError && error.status === 401) ui.chat = null;
    else throw error;
  }
}
// The list state (search, filter, page) changes only when the new list arrives.
export async function loadLeads(
  query: { search?: string; filter?: ListFilter; page?: number } = {}
) {
  const next = { search: ui.search, filter: ui.filter, page: ui.page, ...query };
  const controller = begin('list');
  ui.loading = true;
  try {
    const data = await api<LeadList>(
      '/leads?' +
        new SvelteURLSearchParams({
          q: next.search,
          filter: next.filter,
          page: String(next.page),
          pageSize: String(ui.pageSize)
        }),
      { signal: controller.signal }
    );
    if (controller.signal.aborted) return;
    ui.search = next.search;
    ui.filter = next.filter;
    ui.leads = data.items;
    ui.total = data.total;
    ui.page = data.page;
    ui.stats = data.stats;
    if (!ui.leadId && ui.route !== '/leads' && data.items.length && innerWidth > 700)
      ui.leadId = data.items[0].id;
    rememberList();
  } catch (error) {
    if (controller.signal.aborted) return;
    throw error;
  } finally {
    if (controllers.list === controller) ui.loading = false;
  }
  if (ui.leadId) await loadProfile(ui.leadId);
}
// On a list page a deleted or mistyped lead clears the selection instead of hiding the list.
async function loadProfile(id: string) {
  const controller = begin('profile');
  ui.loadingProfile = true;
  try {
    const profile = await api<Lead>('/leads/' + id, { signal: controller.signal });
    if (!controller.signal.aborted && id === ui.leadId) ui.profile = profile;
  } catch (error) {
    if (controller.signal.aborted) return;
    if (!(error instanceof ApiError && error.status === 404 && listRoutes.includes(ui.route)))
      throw error;
    if (id === ui.leadId) {
      ui.leadId = '';
      ui.profile = null;
      rememberList();
    }
  } finally {
    if (controllers.profile === controller) ui.loadingProfile = false;
  }
}
export async function selectLead(id: string) {
  if (id === ui.leadId && ui.profile) return;
  ui.leadId = id;
  ui.profile = null;
  rememberList(true);
  if (id) await loadProfile(id);
  else {
    controllers.profile?.abort();
    ui.loadingProfile = false;
  }
}
export function search(text: string) {
  controllers.list?.abort();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = undefined;
    loadLeads({ search: text, page: 1 }).catch(report);
  }, 250);
}
export async function refresh() {
  if (ui.route === '/chat') return refreshPublic();
  if (ui.route.startsWith('/leads/')) await loadProfile(ui.leadId);
  else if (listRoutes.includes(ui.route)) await loadLeads();
}
export async function boot() {
  const visit = ++navigation;
  abortAll();
  Object.assign(listLocations, history.state?.lists || {});
  ui.route = location.pathname;
  ui.error = '';
  const publicRoute = publicRoutes.includes(ui.route);
  if (!ui.user || publicRoute) ui.ready = false;
  ui.navigating = true;
  ui.modal = null;
  ui.loading = false;
  ui.loadingProfile = false;
  if (listRoutes.includes(ui.route)) {
    Object.assign(ui, readListState(location.search));
    if (ui.profile?.id !== ui.leadId) ui.profile = null;
  } else {
    ui.profile = null;
  }
  try {
    if (!ui.meta) ui.meta = await api<Meta>('/meta');
    if (visit !== navigation) return;
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
    if (visit !== navigation) return;
    ui.user = me.user;
    security.staff = me.csrf;
    const match = ui.route.match(/^\/leads\/([\w-]+)$/);
    if (match) {
      ui.leadId = match[1];
      await refresh();
    } else if (listRoutes.includes(ui.route)) await loadLeads();
  } catch (error) {
    if (visit !== navigation || isAbort(error) || sessionExpired(error)) return;
    ui.error = errorMessage(error) || 'Cannot open the workspace';
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
      anyBusy() ||
      ui.loading ||
      ui.loadingProfile ||
      searchTimer ||
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
      if (!isAbort(error) && !sessionExpired(error)) ui.connected = false;
    } finally {
      polling = false;
    }
  }, 3000);
  return () => {
    window.removeEventListener('popstate', pop);
    clearInterval(timer);
    clearTimeout(toastTimer);
    abortAll();
  };
}
