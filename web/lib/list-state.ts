export function readListState(query: string) {
  const params = new URLSearchParams(query);
  const page = Number(params.get('page') || 1);
  const filter = params.get('filter') || 'all';
  const lead = params.get('lead') || '';
  return {
    search: (params.get('q') || '').slice(0, 200),
    filter: ['all', 'attention', 'ai', 'human', 'booked'].includes(filter) ? filter : 'all',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    leadId: /^[\w-]+$/.test(lead) ? lead : ''
  };
}

export function listPath(path: string, state: ReturnType<typeof readListState>) {
  const params = new URLSearchParams();
  if (state.search) params.set('q', state.search);
  if (state.filter !== 'all') params.set('filter', state.filter);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.leadId) params.set('lead', state.leadId);
  return path + (params.size ? `?${params}` : '');
}
