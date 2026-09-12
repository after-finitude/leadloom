import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

// Only local .env is read. Values already supplied by the environment win.
export function readEnv(path = resolve('.env')) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined)
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
export function config(overrides = {}) {
  const e = process.env;
  const c = {
    mode: e.APP_MODE || 'demo',
    host: e.HOST || '127.0.0.1',
    port: Number(e.PORT || 3000),
    origin: e.APP_ORIGIN || 'http://localhost:3000',
    dbPath: e.DATABASE_PATH || './data/leadloom.sqlite',
    trustedProxies: (e.TRUSTED_PROXIES || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    worker: e.WORKER_ENABLED !== 'false',
    seedDemo: e.SEED_DEMO !== 'false',
    adminEmail: e.ADMIN_EMAIL || 'admin@leadloom.local',
    adminPassword: e.ADMIN_PASSWORD || 'Leadloom-Demo-2026!',
    managerEmail: e.MANAGER_EMAIL || 'manager@leadloom.local',
    managerPassword: e.MANAGER_PASSWORD || 'Leadloom-Manager-2026!',
    webhookSecret: e.WEBHOOK_SECRET || 'local-demo-webhook-change-before-use',
    key: e.ENCRYPTION_KEY || '',
    llmProvider: e.LLM_PROVIDER || 'mock',
    llmKey: e.OPENAI_API_KEY || '',
    llmModel: e.OPENAI_MODEL || 'gpt-4.1-mini',
    llmTimeout: Number(e.LLM_TIMEOUT_MS || 15000),
    calendarProvider: e.CALENDAR_PROVIDER || 'mock',
    calendarId: e.GOOGLE_CALENDAR_ID || '',
    googleClientId: e.GOOGLE_CLIENT_ID || '',
    googleClientSecret: e.GOOGLE_CLIENT_SECRET || '',
    googleRefreshToken: e.GOOGLE_REFRESH_TOKEN || '',
    emailProvider: e.EMAIL_PROVIDER || 'mock',
    emailKey: e.RESEND_API_KEY || '',
    emailFrom: e.EMAIL_FROM || 'Acme <hello@example.com>',
    emailReplyTo: e.EMAIL_REPLY_TO || 'team@example.com',
    emailAllowlist: (e.EMAIL_ALLOWLIST || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
    ...overrides
  };
  if (!['demo', 'live', 'test'].includes(c.mode))
    throw new Error('APP_MODE must be demo, live or test');
  if (
    !['mock', 'openai'].includes(c.llmProvider) ||
    !['mock', 'google'].includes(c.calendarProvider) ||
    !['mock', 'resend'].includes(c.emailProvider)
  )
    throw new Error('Unsupported provider');
  if (!Number.isInteger(c.port) || c.port < 0 || c.port > 65535) throw new Error('Invalid PORT');
  if (
    !Array.isArray(c.trustedProxies) ||
    c.trustedProxies.length > 100 ||
    c.trustedProxies.some((ip) => typeof ip !== 'string' || !isIP(ip) || ip.includes('%'))
  )
    throw new Error('TRUSTED_PROXIES must contain exact IPv4 or IPv6 addresses');
  if (new URL(c.origin).origin !== c.origin)
    throw new Error('APP_ORIGIN must be an origin without a trailing slash');
  if (c.mode === 'live') {
    if (!c.origin.startsWith('https://')) throw new Error('Live mode requires HTTPS APP_ORIGIN');
    if (!/^[a-f0-9]{64}$/i.test(c.key))
      throw new Error('Live mode requires ENCRYPTION_KEY: 64 hex characters');
    if (
      c.adminPassword.length < 16 ||
      c.adminPassword.startsWith('Leadloom-') ||
      c.managerPassword.length < 16 ||
      c.managerPassword.startsWith('Leadloom-')
    )
      throw new Error('Set strong, unique staff passwords for live mode');
    if (c.webhookSecret.length < 32 || c.webhookSecret.startsWith('local-demo'))
      throw new Error('Live mode requires a strong WEBHOOK_SECRET');
    c.seedDemo = false;
  }
  if (c.llmProvider === 'openai' && !c.llmKey)
    throw new Error('OPENAI_API_KEY is required; no mock fallback');
  if (
    c.calendarProvider === 'google' &&
    ![c.calendarId, c.googleClientId, c.googleClientSecret, c.googleRefreshToken].every(Boolean)
  )
    throw new Error('Google OAuth/calendar credentials are required');
  if (
    c.emailProvider === 'resend' &&
    (!c.emailKey || (c.mode === 'demo' && !c.emailAllowlist.length))
  )
    throw new Error('Resend requires a key and demo mode requires EMAIL_ALLOWLIST');
  if (!c.key) {
    if (c.dbPath === ':memory:') c.key = randomBytes(32).toString('hex');
    else {
      const keyPath = resolve(dirname(c.dbPath), '.encryption-key');
      mkdirSync(dirname(keyPath), { recursive: true, mode: 0o700 });
      if (!existsSync(keyPath)) {
        try {
          writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
      }
      c.key = readFileSync(keyPath, 'utf8').trim();
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(c.key))
    throw new Error('ENCRYPTION_KEY must contain exactly 64 hex characters');
  return c;
}
