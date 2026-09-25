import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { AppError, ensure, allowKeys, sameSecret, hash } from './util.mjs';
import { VERSION } from './config.mjs';

function cookies(req) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) {
      try {
        out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1));
      } catch {
        /* malformed cookie is ignored */
      }
    }
  }
  return out;
}
function normalizeIp(value) {
  const version = isIP(value || '');
  if (!version || value.includes('%')) return null;
  if (version === 4) return value;
  const ip = new URL(`http://[${value}]`).hostname.slice(1, -1),
    mapped = ip.match(/^::ffff:([a-f0-9]+):([a-f0-9]+)$/);
  if (!mapped) return ip;
  const high = parseInt(mapped[1], 16),
    low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}
function clientIp(req, trusted) {
  let ip = normalizeIp(req.socket.remoteAddress) || 'unknown';
  const forwarded = req.headers['x-forwarded-for'];
  if (!trusted.has(ip) || !forwarded) return ip;
  ensure(typeof forwarded === 'string', 'invalid_forwarded_for', 'Invalid proxy address header');
  // Walk from the socket towards the client; ignore claims beyond the first untrusted hop.
  for (const value of forwarded.split(',').reverse()) {
    if (!trusted.has(ip)) break;
    ip = normalizeIp(value.trim());
    ensure(ip, 'invalid_forwarded_for', 'Invalid proxy address header');
  }
  return ip;
}
async function readBody(req) {
  ensure(
    (req.headers['content-type'] || '').split(';')[0] === 'application/json',
    'content_type',
    'Use application/json',
    415
  );
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    ensure(size <= 100000, 'body_too_large', 'Request body is too large', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new AppError('invalid_json', 'Malformed JSON request');
  }
}
/** @returns {import('./types.ts').Providers} */
function providersInfo(app) {
  return { llm: app.llm.name, calendar: app.calendar.name, email: app.email.name };
}

/**
 * @typedef {object} RouteRequest
 * @property {import('./service.mjs').Leadloom} app
 * @property {Record<string, string>} params
 * @property {Record<string, string>} query
 * @property {any} body
 * @property {Record<string, string>} cookie
 * @property {string} ip
 * @property {number} status
 * @property {(kind: 'staff' | 'visitor', raw: string, remove?: boolean) => void} setSession
 * @property {(key: string, max: number, windowMs: number) => void} limit
 * @property {any} [visitor]
 * @property {any} [session]
 * @property {any} [user]
 */
/**
 * @typedef {object} RouteOptions
 * @property {'public' | 'webhook' | 'visitor' | 'staff' | 'admin'} auth
 * @property {string[]} [keys]
 * @property {number} [status]
 * @property {(r: RouteRequest) => unknown} handler
 */

// [method, path, options]. `:name` matches one path segment, `:name(a|b)` one of the listed
// values. `auth` is public, webhook, visitor, staff or admin; the dispatcher checks Origin
// and CSRF for mutations and rejects body properties outside `keys`. Handlers return the
// JSON response and may set `r.status`.
/** @type {[string, string, RouteOptions][]} */
const table = [
  [
    'GET',
    '/api/health',
    {
      auth: 'public',
      handler: ({ app }) => {
        app.ping();
        return {
          ok: true,
          version: VERSION,
          mode: app.c.mode,
          database: 'SQLite',
          providers: providersInfo(app)
        };
      }
    }
  ],
  [
    'GET',
    '/api/meta',
    {
      auth: 'public',
      handler: ({ app }) => {
        const s = app.settings();
        return {
          demo: app.c.mode === 'demo',
          company: s.company,
          services: s.services,
          timezone: s.timezone,
          providers: providersInfo(app)
        };
      }
    }
  ],
  [
    'POST',
    '/api/auth/login',
    {
      auth: 'public',
      keys: ['email', 'password'],
      handler: (r) => {
        const result = r.app.auth.login(r.body, r.ip);
        r.setSession('staff', result.raw);
        return { user: result.user, csrf: result.csrf };
      }
    }
  ],
  [
    'POST',
    '/api/leads/intake',
    {
      auth: 'webhook',
      handler: (r) => {
        r.limit(`webhook:${hash(r.ip)}`, 120, 60000);
        const result = r.app.intake(r.body, { source: r.body?.source || 'webhook', web: false });
        r.status =
          result.status === 'rejected' ? 422 : result.status === 'needs_resolution' ? 202 : 200;
        return result;
      }
    }
  ],
  [
    'POST',
    '/api/public/intake',
    {
      auth: 'public',
      handler: (r) => {
        r.limit(`intake:${hash(r.ip)}`, 30, 3600000);
        const visitor = r.app.auth.get(r.cookie.ll_visitor, 'visitor');
        const result = r.app.intake(r.body, { web: true, sessionLead: visitor?.subject_id });
        if (result.session) {
          r.setSession('visitor', result.session.raw);
          r.status = 201;
          return { status: result.status, csrf: result.session.csrf };
        }
        r.status = result.status === 'rejected' ? 422 : 202;
        return result;
      }
    }
  ],
  [
    'POST',
    '/api/public/chat/access',
    {
      auth: 'public',
      keys: ['token'],
      handler: (r) => {
        r.limit(`exchange:${hash(r.ip)}`, 20, 60000);
        const result = r.app.auth.exchange(r.body.token);
        r.setSession('visitor', result.raw);
        return { csrf: result.csrf };
      }
    }
  ],
  [
    'POST',
    '/api/public/unsubscribe',
    {
      auth: 'public',
      keys: ['token'],
      handler: ({ app, body }) =>
        app.stop(app.auth.unsubscribeToken(body.token).contact_id, 'email')
    }
  ],
  [
    'POST',
    '/api/public/chat/request-access',
    {
      auth: 'public',
      keys: ['email'],
      handler: ({ app, body }) => app.requestAccess(body.email)
    }
  ],
  [
    'GET',
    '/api/public/chat',
    {
      auth: 'visitor',
      handler: ({ app, visitor }) => ({
        ...app.publicState(visitor.subject_id),
        csrf: visitor.csrf
      })
    }
  ],
  [
    'POST',
    '/api/public/chat/messages',
    {
      auth: 'visitor',
      keys: ['body', 'key'],
      status: 202,
      handler: ({ app, visitor, body }) => app.postMessage(visitor.subject_id, body.body, body.key)
    }
  ],
  [
    'GET',
    '/api/public/chat/availability',
    { auth: 'visitor', handler: ({ app, visitor }) => app.availability(visitor.subject_id) }
  ],
  [
    'POST',
    '/api/public/chat/appointments',
    {
      auth: 'visitor',
      keys: ['offerId', 'key'],
      status: 202,
      handler: ({ app, visitor, body }) => app.book(visitor.subject_id, body.offerId, body.key)
    }
  ],
  [
    'GET',
    '/api/me',
    {
      auth: 'staff',
      handler: ({ app, user, session }) => ({
        user,
        csrf: session.csrf,
        demo: app.c.mode === 'demo',
        providers: providersInfo(app)
      })
    }
  ],
  [
    'POST',
    '/api/auth/logout',
    {
      auth: 'staff',
      handler: (r) => {
        r.app.auth.logout(r.cookie.ll_staff);
        r.setSession('staff', '', true);
        return { ok: true };
      }
    }
  ],
  ['GET', '/api/users', { auth: 'staff', handler: ({ app }) => app.users() }],
  ['GET', '/api/leads', { auth: 'staff', handler: ({ app, query }) => app.list(query) }],
  ['GET', '/api/conversations', { auth: 'staff', handler: ({ app, query }) => app.list(query) }],
  ['GET', '/api/contacts', { auth: 'staff', handler: ({ app }) => app.contacts() }],
  [
    'GET',
    '/api/leads/:id',
    { auth: 'staff', handler: ({ app, params }) => app.profile(params.id) }
  ],
  [
    'PATCH',
    '/api/leads/:id',
    {
      auth: 'staff',
      handler: ({ app, params, body, user }) => app.editFields(params.id, body, user)
    }
  ],
  [
    'POST',
    '/api/leads/:id/messages',
    {
      auth: 'staff',
      keys: ['body', 'key'],
      status: 201,
      handler: ({ app, params, body, user }) =>
        app.manualMessage(params.id, body.body, body.key, user)
    }
  ],
  [
    'POST',
    '/api/leads/:id/notes',
    {
      auth: 'staff',
      keys: ['body'],
      status: 201,
      handler: ({ app, params, body, user }) => app.addNote(params.id, body.body, user)
    }
  ],
  [
    'POST',
    '/api/leads/:id/:command(takeover|return-to-ai|pause|resume|answered|restore-consent|stage|assign|recalculate)',
    {
      auth: 'staff',
      handler: ({ app, params, body, user }) => app.control(params.id, params.command, body, user)
    }
  ],
  [
    'GET',
    '/api/appointments/:id/availability',
    { auth: 'staff', handler: ({ app, params }) => app.appointmentAvailability(params.id) }
  ],
  [
    'POST',
    '/api/appointments/:id/:kind(cancel|reschedule)',
    {
      auth: 'staff',
      status: 202,
      handler: ({ app, params, body, user }) =>
        app.appointmentAction(params.id, params.kind, body, user)
    }
  ],
  ['GET', '/api/runs', { auth: 'staff', handler: ({ app }) => app.runs() }],
  [
    'POST',
    '/api/runs/:id/retry',
    { auth: 'staff', status: 202, handler: ({ app, params, user }) => app.retry(params.id, user) }
  ],
  [
    'POST',
    '/api/operations/:id/reconcile',
    { auth: 'staff', handler: ({ app, params }) => app.reconcile(params.id) }
  ],
  [
    'POST',
    '/api/intake-events/:id/resolve',
    {
      auth: 'staff',
      keys: ['contactId'],
      handler: ({ app, params, body, user }) =>
        app.resolveIntake(params.id, body.contactId, user.id)
    }
  ],
  ['GET', '/api/settings', { auth: 'staff', handler: ({ app }) => app.settings() }],
  ['GET', '/api/rules', { auth: 'staff', handler: ({ app }) => app.ruleVersions() }],
  [
    'PUT',
    '/api/settings',
    { auth: 'admin', handler: ({ app, body, user }) => app.updateSettings(body, user.id) }
  ],
  [
    'POST',
    '/api/rules',
    {
      auth: 'admin',
      status: 201,
      handler: ({ app, body, user }) => app.publishRules(body, user.id)
    }
  ],
  ['GET', '/api/outbox', { auth: 'admin', handler: ({ app }) => app.demoOutbox() }]
];
const routes = table.map(([method, path, options]) => ({
  method,
  pattern: new RegExp(
    `^${path.replace(/:(\w+)(?:\(([^)]*)\))?/g, (_, name, values) => `(?<${name}>${values || '[\\w-]+'})`)}$`
  ),
  ...options
}));

function findRoute(method, path) {
  for (const route of routes) {
    const match = route.method === method && route.pattern.exec(path);
    if (match) return { route, params: match.groups || {} };
  }
  return {};
}

const pages = [
  '/',
  '/login',
  '/chat',
  '/enquire',
  '/unsubscribe',
  '/conversations',
  '/leads',
  '/settings',
  '/activity',
  '/outbox'
];

export function createHttp(service) {
  const c = service.c;
  const trustedProxies = new Set((c.trustedProxies || []).map(normalizeIp));
  // Release archives place built assets beside src; local source uses dist/web.
  const assetRoot = new URL(
    existsSync(new URL('../web/assets/', import.meta.url)) ? '../web/' : '../dist/web/',
    import.meta.url
  );
  const assetTypes = {
    js: 'text/javascript',
    css: 'text/css',
    svg: 'image/svg+xml',
    woff2: 'font/woff2'
  };
  // Built files are read once; a new build is served after a restart.
  const files = new Map();
  const readStatic = (name) => {
    if (!files.has(name)) {
      const file = new URL(name, assetRoot);
      if (!existsSync(file)) return null;
      files.set(name, readFileSync(file));
    }
    return files.get(name);
  };
  return createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    );
    if (c.origin.startsWith('https:'))
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    const json = (data, status = 200) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    };
    const setSession = (kind, raw, remove = false) => {
      res.setHeader(
        'Set-Cookie',
        `ll_${kind}=${
          remove ? '' : encodeURIComponent(raw)
        }; Path=/; HttpOnly; SameSite=Strict; Max-Age=${
          remove ? 0 : kind === 'staff' ? 28800 : 604800
        }${c.origin.startsWith('https:') ? '; Secure' : ''}`
      );
    };
    try {
      const url = new URL(req.url || '/', c.origin),
        path = url.pathname,
        method = req.method || 'GET',
        cookie = cookies(req),
        ip = clientIp(req, trustedProxies);
      if (!path.startsWith('/api/')) {
        ensure(method === 'GET' || method === 'HEAD', 'method_not_allowed', undefined, 405);
        const asset = path.match(/^\/assets\/[A-Za-z0-9_-]+\.(js|css|svg|woff2)$/);
        if (asset || path === '/favicon.svg') {
          const data = readStatic(path.slice(1));
          ensure(data, 'not_found', 'Asset not found', 404);
          res.setHeader('Content-Type', asset ? assetTypes[asset[1]] : 'image/svg+xml');
          res.setHeader(
            'Cache-Control',
            asset ? 'public, max-age=31536000, immutable' : 'public, max-age=300'
          );
          res.end(method === 'HEAD' ? undefined : data);
          return;
        }
        ensure(
          pages.includes(path) || /^\/leads\/[a-f0-9-]+$/.test(path),
          'not_found',
          'Page not found',
          404
        );
        const html = readStatic('index.html');
        ensure(
          html,
          'frontend_not_built',
          'Run npm run build before npm start, or use npm run dev.',
          503
        );
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(method === 'HEAD' ? undefined : html);
        return;
      }
      const { route, params } = findRoute(method, path);
      ensure(route, 'not_found', 'API route not found', 404);
      const mutating = method !== 'GET';
      if (mutating && route.auth !== 'webhook')
        ensure(
          req.headers.origin === c.origin,
          'origin_not_allowed',
          'Open the app at its configured APP_ORIGIN',
          403
        );
      /** @type {RouteRequest} */
      const r = {
        app: service,
        params,
        query: Object.fromEntries(url.searchParams),
        body: mutating ? await readBody(req) : {},
        cookie,
        ip,
        status: route.status || 200,
        setSession,
        limit: (key, max, windowMs) => service.limits.hit(key, max, windowMs, service.clock())
      };
      let visitor = null;
      if (path.startsWith('/api/public/')) {
        // A visitor's chat is limited per lead, so visitors behind one address do not collide.
        if (route.auth === 'visitor') visitor = service.auth.get(cookie.ll_visitor, 'visitor');
        r.limit(
          visitor ? `public:lead:${visitor.subject_id}` : `public:ip:${hash(ip)}`,
          180,
          60000
        );
      }
      if (route.auth === 'webhook')
        ensure(
          sameSecret(req.headers.authorization || '', `Bearer ${c.webhookSecret}`),
          'unauthorized',
          'Invalid webhook credentials',
          401
        );
      if (route.auth === 'visitor') {
        r.visitor = visitor || service.auth.visitor(cookie.ll_visitor);
        if (mutating) service.auth.csrf(r.visitor, req.headers['x-csrf-token']);
      }
      if (route.auth === 'staff' || route.auth === 'admin') {
        Object.assign(r, service.auth.staff(cookie.ll_staff));
        if (mutating) service.auth.csrf(r.session, req.headers['x-csrf-token']);
        if (route.auth === 'admin')
          ensure(r.user.role === 'admin', 'forbidden', 'Administrator required', 403);
      }
      if (route.keys) allowKeys(r.body, route.keys);
      return json(await route.handler(r), r.status);
    } catch (error) {
      // Never log request bodies, query strings, tokens or provider response bodies. Error
      // messages may quote them, so only the stack frames are logged.
      if (!(error instanceof AppError))
        console.error(
          JSON.stringify({
            requestId,
            code: 'internal_error',
            type: error?.constructor?.name,
            stack: String(error?.stack ?? '')
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.startsWith('at '))
          })
        );
      if (!res.headersSent)
        json(
          {
            error: error instanceof AppError ? error.code : 'internal_error',
            message:
              error instanceof AppError
                ? error.message
                : 'The operation failed. Your data has not been acknowledged as saved.',
            requestId
          },
          error instanceof AppError ? error.status : 500
        );
      else res.end();
    }
  });
}
