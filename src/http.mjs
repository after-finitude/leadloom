import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { AppError, ensure, allowKeys, sameSecret, hash } from './util.mjs';

function cookies(req) {
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
          const file = new URL(path.slice(1), assetRoot);
          ensure(existsSync(file), 'not_found', 'Asset not found', 404);
          res.setHeader('Content-Type', asset ? assetTypes[asset[1]] : 'image/svg+xml');
          res.setHeader(
            'Cache-Control',
            asset ? 'public, max-age=31536000, immutable' : 'public, max-age=300'
          );
          res.end(method === 'HEAD' ? undefined : readFileSync(file));
          return;
        }
        ensure(
          [
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
          ].includes(path) || /^\/leads\/[a-f0-9-]+$/.test(path),
          'not_found',
          'Page not found',
          404
        );
        ensure(
          existsSync(new URL('index.html', assetRoot)),
          'frontend_not_built',
          'Run npm run build before npm start, or use npm run dev.',
          503
        );
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(method === 'HEAD' ? undefined : readFileSync(new URL('index.html', assetRoot)));
        return;
      }
      if (path === '/api/health' && method === 'GET') {
        service.ping();
        return json({
          ok: true,
          version: '1.2.0',
          mode: c.mode,
          database: 'SQLite',
          providers: {
            llm: service.llm.name,
            calendar: service.calendar.name,
            email: service.email.name
          }
        });
      }
      if (path === '/api/meta' && method === 'GET')
        return json({
          demo: c.mode === 'demo',
          company: service.settings().company,
          services: service.settings().services,
          timezone: service.settings().timezone,
          providers: {
            llm: service.llm.name,
            calendar: service.calendar.name,
            email: service.email.name
          }
        });
      const mutating = !['GET', 'HEAD'].includes(method);
      if (mutating && path !== '/api/leads/intake')
        ensure(
          req.headers.origin === c.origin,
          'origin_not_allowed',
          'Open the app at its configured APP_ORIGIN',
          403
        );
      let body = mutating ? await readBody(req) : {};
      if (path === '/api/auth/login' && method === 'POST') {
        allowKeys(body, ['email', 'password']);
        const result = service.auth.login(body, ip);
        setSession('staff', result.raw);
        return json({ user: result.user, csrf: result.csrf });
      }
      if (path === '/api/leads/intake' && method === 'POST') {
        ensure(
          sameSecret(req.headers.authorization || '', `Bearer ${c.webhookSecret}`),
          'unauthorized',
          'Invalid webhook credentials',
          401
        );
        service.s.limit(`webhook:${hash(ip)}`, 120, 60000, service.clock());
        const result = service.intake(body, { source: body?.source || 'webhook', web: false });
        return json(
          result,
          result.status === 'rejected' ? 422 : result.status === 'needs_resolution' ? 202 : 200
        );
      }
      if (path.startsWith('/api/public/')) {
        const chatSession = service.auth.get(cookie.ll_visitor, 'visitor');
        const chatRoute = [
          '/api/public/chat',
          '/api/public/chat/messages',
          '/api/public/chat/availability',
          '/api/public/chat/appointments'
        ].includes(path);
        service.s.limit(
          chatRoute && chatSession
            ? `public:lead:${chatSession.subject_id}`
            : `public:ip:${hash(ip)}`,
          180,
          60000,
          service.clock()
        );
        if (path === '/api/public/intake' && method === 'POST') {
          service.s.limit(`intake:${hash(ip)}`, 30, 3600000, service.clock());
          const visitor = service.auth.get(cookie.ll_visitor, 'visitor');
          const result = service.intake(body, { web: true, sessionLead: visitor?.subject_id });
          if (result.session) {
            setSession('visitor', result.session.raw);
            return json({ status: result.status, csrf: result.session.csrf }, 201);
          }
          return json(result, result.status === 'rejected' ? 422 : 202);
        }
        if (path === '/api/public/chat/access' && method === 'POST') {
          allowKeys(body, ['token']);
          service.s.limit(`exchange:${hash(ip)}`, 20, 60000, service.clock());
          const result = service.auth.exchange(body.token);
          setSession('visitor', result.raw);
          return json({ csrf: result.csrf });
        }
        if (path === '/api/public/unsubscribe' && method === 'POST') {
          allowKeys(body, ['token']);
          const access = service.auth.unsubscribeToken(body.token);
          return json(service.stop(access.contact_id, 'email'));
        }
        if (path === '/api/public/chat/request-access' && method === 'POST') {
          allowKeys(body, ['email']);
          return json(service.requestAccess(body.email));
        }
        const visitor = chatSession || service.auth.visitor(cookie.ll_visitor);
        if (mutating) service.auth.csrf(visitor, req.headers['x-csrf-token']);
        if (path === '/api/public/chat' && method === 'GET')
          return json({ ...service.publicState(visitor.subject_id), csrf: visitor.csrf });
        if (path === '/api/public/chat/messages' && method === 'POST') {
          allowKeys(body, ['body', 'key']);
          return json(service.postMessage(visitor.subject_id, body.body, body.key), 202);
        }
        if (path === '/api/public/chat/availability' && method === 'GET')
          return json(await service.availability(visitor.subject_id));
        if (path === '/api/public/chat/appointments' && method === 'POST') {
          allowKeys(body, ['offerId', 'key']);
          return json(service.book(visitor.subject_id, body.offerId, body.key), 202);
        }
        throw new AppError('not_found', 'Public API route not found', 404);
      }
      const { session, user } = service.auth.staff(cookie.ll_staff);
      if (mutating) service.auth.csrf(session, req.headers['x-csrf-token']);
      if (path === '/api/me' && method === 'GET')
        return json({
          user,
          csrf: session.csrf,
          demo: c.mode === 'demo',
          providers: {
            llm: service.llm.name,
            calendar: service.calendar.name,
            email: service.email.name
          }
        });
      if (path === '/api/auth/logout' && method === 'POST') {
        service.auth.logout(cookie.ll_staff);
        setSession('staff', '', true);
        return json({ ok: true });
      }
      if (path === '/api/users' && method === 'GET') return json(service.users());
      if ((path === '/api/leads' || path === '/api/conversations') && method === 'GET')
        return json(service.list(Object.fromEntries(url.searchParams)));
      if (path === '/api/contacts' && method === 'GET') return json(service.contacts());
      let match;
      if ((match = path.match(/^\/api\/leads\/([\w-]+)$/))) {
        if (method === 'GET') return json(service.profile(match[1]));
        if (method === 'PATCH') return json(service.editFields(match[1], body, user));
      }
      if ((match = path.match(/^\/api\/leads\/([\w-]+)\/messages$/)) && method === 'POST') {
        allowKeys(body, ['body', 'key']);
        return json(service.manualMessage(match[1], body.body, body.key, user), 201);
      }
      if ((match = path.match(/^\/api\/leads\/([\w-]+)\/notes$/)) && method === 'POST') {
        allowKeys(body, ['body']);
        return json(service.addNote(match[1], body.body, user), 201);
      }
      if (
        (match = path.match(
          /^\/api\/leads\/([\w-]+)\/(takeover|return-to-ai|pause|resume|restore-consent|stage|assign|recalculate)$/
        )) &&
        method === 'POST'
      )
        return json(service.control(match[1], match[2], body, user));
      if ((match = path.match(/^\/api\/appointments\/([\w-]+)\/availability$/)) && method === 'GET')
        return json(await service.appointmentAvailability(match[1]));
      if (
        (match = path.match(/^\/api\/appointments\/([\w-]+)\/(cancel|reschedule)$/)) &&
        method === 'POST'
      )
        return json(service.appointmentAction(match[1], match[2], body, user), 202);
      if (path === '/api/runs' && method === 'GET') return json(service.runs());
      if ((match = path.match(/^\/api\/runs\/([\w-]+)\/retry$/)) && method === 'POST')
        return json(service.retry(match[1], user), 202);
      if ((match = path.match(/^\/api\/operations\/([\w-]+)\/reconcile$/)) && method === 'POST')
        return json(await service.reconcile(match[1]));
      if ((match = path.match(/^\/api\/intake-events\/([\w-]+)\/resolve$/)) && method === 'POST') {
        allowKeys(body, ['contactId']);
        return json(service.resolveIntake(match[1], body.contactId, user.id));
      }
      if (path === '/api/settings' && method === 'GET') return json(service.settings());
      if (path === '/api/rules' && method === 'GET') return json(service.ruleVersions());
      if (path === '/api/settings' && method === 'PUT') {
        ensure(user.role === 'admin', 'forbidden', 'Administrator required', 403);
        return json(service.updateSettings(body, user.id));
      }
      if (path === '/api/rules' && method === 'POST') {
        ensure(user.role === 'admin', 'forbidden', 'Administrator required', 403);
        return json(service.publishRules(body, user.id), 201);
      }
      if (path === '/api/outbox' && method === 'GET') {
        ensure(user.role === 'admin', 'forbidden', 'Administrator required', 403);
        return json(service.demoOutbox());
      }
      throw new AppError('not_found', 'API route not found', 404);
    } catch (error) {
      // Never log request bodies, query strings, tokens or provider response bodies.
      if (!(error instanceof AppError))
        console.error(
          JSON.stringify({ requestId, code: 'internal_error', type: error?.constructor?.name })
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
