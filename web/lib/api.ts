export const security: { staff: string | null; visitor: string | null } = {
  staff: null,
  visitor: null
};
interface ErrorData {
  message?: string;
  error?: string;
  reason?: string;
}
// Messages for error codes the server reports without a message, or the browser raises itself.
const messages: Record<string, string> = {
  network: 'Connection lost. Please try again.',
  bad_response: 'The server sent an unexpected response. Please try again.',
  contact_required:
    'Enter an email address or an international phone number to start your conversation.',
  invalid_email: 'Enter a valid email address.',
  invalid_phone: 'Use an international phone number, for example +14155550100.'
};
// Status 0 means the request never reached the server.
export class ApiError extends Error {
  code: string | undefined;
  status: number;
  constructor(data: ErrorData, status: number) {
    const code = data.error || data.reason;
    super(data.message || (code && messages[code]) || 'Request failed');
    this.code = code;
    this.status = status;
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Request failed. Please try again.';
// The form field an enquiry error belongs to, so it can be shown next to that field.
export function errorField(error: unknown) {
  if (!(error instanceof ApiError)) return '';
  if (error.code === 'invalid_phone') return 'phone';
  return ['invalid_email', 'contact_required'].includes(error.code || '') ? 'email' : '';
}
export const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';
export async function api<T = unknown>(
  path: string,
  {
    method = 'GET',
    body,
    publicRequest = false,
    signal
  }: { method?: string; body?: unknown; publicRequest?: boolean; signal?: AbortSignal } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (method !== 'GET') {
    const csrf = security[publicRequest ? 'visitor' : 'staff'];
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiError({ error: 'network' }, 0);
  }
  // A proxy error page is HTML, not JSON.
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object')
    throw new ApiError({ error: 'bad_response' }, response.status);
  if (!response.ok) throw new ApiError(data, response.status);
  return data as T;
}
export const post = <T = unknown>(path: string, body: unknown = {}, publicRequest = false) =>
  api<T>(path, { method: 'POST', body, publicRequest });
export function pendingKey(scope: string, body: string) {
  const storageKey = `leadloom-pending:${scope}`;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (saved?.body === body && typeof saved.key === 'string') return saved.key as string;
    const key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, JSON.stringify({ body, key }));
    return key;
  } catch {
    return crypto.randomUUID();
  }
}
export function clearPending(scope: string) {
  try {
    sessionStorage.removeItem(`leadloom-pending:${scope}`);
  } catch {
    /* Storage may be disabled. */
  }
}
