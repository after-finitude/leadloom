import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/db.mjs';

const versions = (store) =>
  store.all('SELECT version FROM migrations ORDER BY version').map((r) => r.version);
const table = (store, name) =>
  store.get("SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name=?", name);

test('a new database applies every migration once', () => {
  const store = new Store();
  try {
    assert.deepEqual(versions(store), [1, 2, 3, 4]);
    assert.ok(table(store, 'audit_events_lead'));
    assert.equal(table(store, 'runtime_locks'), undefined);
    assert.equal(table(store, 'rate_limits'), undefined);
    store.migrate();
    assert.deepEqual(versions(store), [1, 2, 3, 4]);
  } finally {
    store.close();
  }
});

test('a database created by the pre-migration schema is upgraded in place', () => {
  const dir = mkdtempSync(join(tmpdir(), 'leadloom-migrate-'));
  const path = join(dir, 'legacy.sqlite');
  try {
    // Reproduce what the single schema.sql produced: version 1 recorded, runtime_locks present.
    // 001_initial.sql is that schema without the pragmas and the migrations table.
    const legacy = new DatabaseSync(path);
    legacy.exec(
      readFileSync(new URL('../src/migrations/001_initial.sql', import.meta.url), 'utf8')
    );
    legacy.exec(`CREATE TABLE migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      INSERT INTO migrations VALUES(1, 0);
      INSERT INTO app_metadata VALUES('mode','demo');`);
    legacy.close();
    const store = new Store(path);
    try {
      assert.deepEqual(versions(store), [1, 2, 3, 4]);
      assert.equal(table(store, 'runtime_locks'), undefined);
      assert.equal(table(store, 'rate_limits'), undefined);
      assert.ok(table(store, 'actions_lead'));
      assert.ok(store.all('PRAGMA table_info(leads)').some((c) => c.name === 'open_question'));
      assert.equal(store.get("SELECT value FROM app_metadata WHERE key='mode'").value, 'demo');
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
