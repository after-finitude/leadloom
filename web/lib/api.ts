export const security: { staff: string | null; visitor: string | null } = {
  staff: null,
  visitor: null
};
interface ErrorData {
  message?: string;
  error?: string;
  reason?: string;
}
export class ApiError extends Error {
  code: string | undefined;
  status: number;
  constructor(data: ErrorData, status: number) {
    super(
      data.message ||
        (data.reason === 'contact_required'
          ? 'Enter an email address or an international phone number to start your conversation.'
          : data.reason === 'invalid_email'
            ? 'Enter a valid email address.'
            : data.reason === 'invalid_phone'
              ? 'Use an international phone number, for example +14155550100.'
              : 'Request failed')
    );
    this.code = data.error || data.reason;
    this.status = status;
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Request failed. Please try again.';
export async function api<T = unknown>(
  path: string,
  {
    method = 'GET',
    body,
    publicRequest = false
  }: { method?: string; body?: unknown; publicRequest?: boolean } = {}
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
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error('Connection lost. Please try again.');
  }
  const data = await response.json();
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
