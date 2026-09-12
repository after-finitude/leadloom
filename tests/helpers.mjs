import { Store } from '../src/db.mjs';
import { config } from '../src/config.mjs';
import { Leadloom } from '../src/service.mjs';
import { id } from '../src/util.mjs';
export const HOT =
  'Roofing in Demo City A. Budget $20000. I own the home and want to start in 2 months.';
export function fixture(options = {}) {
  let now = Date.parse('2026-09-10T10:00:00Z');
  const store = new Store(options.path || ':memory:');
  const c = config({
    mode: 'test',
    dbPath: options.path || ':memory:',
    key: 'b'.repeat(64),
    ...options.config
  });
  const app = new Leadloom(store, c, options.providers || {}, () => now);
  app.init();
  const actor = store.get("SELECT id,role FROM users WHERE role='admin'");
  return {
    app,
    store,
    actor,
    clock: () => now,
    setTime: (x) => {
      now = x;
    },
    advance: (ms) => {
      now += ms;
    },
    close: () => store.close(),
    lead: async (body = HOT, extra = {}) => {
      const r = app.intake(
        { event_key: id(), name: 'Synthetic Lead', email: `${id()}@example.test`, ...extra },
        { web: true }
      );
      if (body !== null) {
        app.postMessage(r.leadId, body, id());
        await app.tick();
      }
      return r.leadId;
    }
  };
}
