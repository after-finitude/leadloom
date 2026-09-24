import { api, errorMessage } from './api.ts';

// Data for one page section. A newer load aborts the older one.
export function resource<T>(path: string) {
  const state = $state({ data: null as T | null, error: '' });
  let controller: AbortController | undefined;
  async function load() {
    controller?.abort();
    const current = (controller = new AbortController());
    try {
      const data = await api<T>(path, { signal: current.signal });
      if (current.signal.aborted) return;
      state.data = data;
      state.error = '';
    } catch (error) {
      if (!current.signal.aborted) throw error;
    }
  }
  // The first load shows a failure in place of the content; returns the cleanup.
  function mount() {
    load().catch((error) => {
      state.error = errorMessage(error);
    });
    return () => controller?.abort();
  }
  return {
    get data() {
      return state.data;
    },
    set data(value: T | null) {
      state.data = value;
    },
    get error() {
      return state.error;
    },
    load,
    mount
  };
}
