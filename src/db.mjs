import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { id, redact, AppError } from './util.mjs';
// Time comes from the service clock so injected clocks stay consistent.
function requireTime(now) {
  if (!Number.isFinite(now)) throw new TypeError('Pass the service clock time');
}
const migrations = fileURLToPath(new URL('./migrations/', import.meta.url));
export class Store {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.path = path;
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    this.depth = 0;
    this.statements = new Map();
    this.migrate();
  }
  // Applies each numbered file in src/migrations once, in order, recording it in `migrations`.
  migrate() {
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)'
    );
    const files = readdirSync(migrations)
      .filter((file) => /^\d+_[\w-]+\.sql$/.test(file))
      .sort();
    for (const file of files) {
      const version = parseInt(file, 10);
      this.tx(() => {
        if (this.get('SELECT version FROM migrations WHERE version=?', version)) return;
        this.db.exec(readFileSync(join(migrations, file), 'utf8'));
        this.run(
          "INSERT INTO migrations(version,applied_at) VALUES(?,CAST(strftime('%s','now') AS INTEGER)*1000)",
          version
        );
      });
    }
  }
  prepare(sql) {
    let statement = this.statements.get(sql);
    if (!statement) this.statements.set(sql, (statement = this.db.prepare(sql)));
    return statement;
  }
  run(sql, ...params) {
    return this.prepare(sql).run(...params);
  }
  get(sql, ...params) {
    return this.prepare(sql).get(...params);
  }
  all(sql, ...params) {
    return this.prepare(sql).all(...params);
  }
  tx(fn) {
    if (this.depth) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.depth++;
    try {
      const value = fn();
      if (value instanceof Promise) throw new Error('Do not await inside SQLite transactions');
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.depth--;
    }
  }
  audit(leadId, action, details = {}, actor = 'system', correlationId = id(), now) {
    requireTime(now);
    this.run(
      'INSERT INTO audit_events(id,lead_id,actor,action,details,correlation_id,created_at) VALUES(?,?,?,?,?,?,?)',
      id(),
      leadId || null,
      actor,
      action,
      redact(JSON.stringify(details)),
      correlationId,
      now
    );
  }
  limit(key, max, windowMs, now) {
    requireTime(now);
    this.tx(() => {
      const row = this.get('SELECT * FROM rate_limits WHERE key=?', key);
      if (!row || row.reset_at <= now)
        this.run(
          'INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,reset_at=excluded.reset_at',
          key,
          now + windowMs
        );
      else {
        if (row.count >= max)
          throw new AppError('rate_limited', 'Too many requests. Try again later.', 429);
        this.run('UPDATE rate_limits SET count=count+1 WHERE key=?', key);
      }
    });
  }
  close() {
    this.db.close();
  }
}
