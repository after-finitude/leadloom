export const security = { staff: null, visitor: null };
export class ApiError extends Error {
  constructor(data, status) {
    super(
      data.message ||
        (data.reason === 'contact_required'
          ? 'Enter an email address or an international phone number to start your conversation.'
          : 'Request failed')
    );
    this.code = data.error || data.reason;
    this.status = status;
  }
}
export async function api(path, { method = 'GET', body, publicRequest = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (method !== 'GET') {
    const csrf = security[publicRequest ? 'visitor' : 'staff'];
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  let response;
  try {
    response = await fetch('/api' + path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error('Connection lost. Your message is still here; retry without changing it.');
  }
  const data = await response.json();
  if (!response.ok) throw new ApiError(data, response.status);
  return data;
}
export const post = (path, body = {}, publicRequest = false) =>
  api(path, { method: 'POST', body, publicRequest });
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export const uid = () => crypto.randomUUID();
