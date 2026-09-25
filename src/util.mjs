import {
  randomBytes,
  randomUUID,
  createHash,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  timingSafeEqual
} from 'node:crypto';
export const id = () => randomUUID();
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
export const parse = (v, fallback = {}) => {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};
export const stable = (value) => JSON.stringify(canonical(value));
function canonical(value) {
  return Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])])
        )
      : value;
}
export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
/**
 * @param {unknown} condition
 * @param {string} code
 * @param {string} [message]
 * @param {number} [status]
 * @returns {asserts condition}
 */
export function ensure(condition, code, message = code, status = 400) {
  if (!condition) throw new AppError(code, message, status);
}
/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
export function text(value, max = 2000) {
  ensure(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    'invalid_text',
    `Expected non-empty text, at most ${max} characters`
  );
  return value.trim();
}
export function allowKeys(value, keys) {
  ensure(value && typeof value === 'object' && !Array.isArray(value), 'invalid_payload');
  ensure(
    Object.keys(value).every((k) => keys.includes(k)),
    'unknown_field',
    'Unexpected request property'
  );
  return value;
}
export function email(value) {
  if (value === undefined || value === null || value === '') return null;
  const result = text(value, 254).toLowerCase();
  ensure(
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(result),
    'invalid_email',
    'Enter a valid email address'
  );
  return result; // No dot/plus stripping.
}
export function phone(value) {
  if (value === undefined || value === null || value === '') return null;
  const result = text(value, 32).replace(/[\s()-]/g, '');
  ensure(
    /^\+[1-9][0-9]{6,14}$/.test(result),
    'invalid_phone',
    'Use an international phone number, for example +14155550100'
  );
  return result;
}
export function passwordHash(password) {
  const salt = token();
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordValid(password, saved) {
  try {
    const [salt, key] = saved.split(':');
    return timingSafeEqual(Buffer.from(key, 'hex'), scryptSync(password, salt, 64));
  } catch {
    return false;
  }
}
export function sameSecret(a, b) {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
export function encrypt(value, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), nonce);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString('base64');
}
export function decrypt(value, key) {
  const b = Buffer.from(value, 'base64');
  const d = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
}
export function redact(value) {
  return String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\+\d[\d ()-]{6,}\d/g, '[phone]')
    .replace(/(?:Bearer\s+)[A-Za-z0-9._-]+/g, 'Bearer [redacted]');
}
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export function isStop(value) {
  return (
    /^(?:stop|unsubscribe|opt[ -]?out|cancel messages)[.!\s]*$/i.test(value.trim()) ||
    /\b(?:do not|don't|please stop)\s+(?:contact(?:ing)?|messag(?:e|ing)|email(?:ing)?)\s+me\b/i.test(
      value
    ) ||
    /\bremove me from (?:your|the) (?:list|mailing list)\b/i.test(value)
  );
}
