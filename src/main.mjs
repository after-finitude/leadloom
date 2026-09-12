import { readEnv, config } from './config.mjs';
import { Store } from './db.mjs';
import { Leadloom } from './service.mjs';
import { createHttp } from './http.mjs';
import { seedDemo } from './seed.mjs';

readEnv();
const c = config(),
  store = new Store(c.dbPath),
  app = new Leadloom(store, c);
app.init();
await seedDemo(app);
const server = createHttp(app);
server.requestTimeout = 20000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.listen(c.port, c.host, () => {
  console.log(`Leadloom 1.2.0 · ${c.mode} · ${c.origin}`);
  console.log(
    `Providers: LLM=${app.llm.name}, calendar=${app.calendar.name}, email=${app.email.name}`
  );
  if (c.mode === 'demo')
    console.log(
      'Local demo credentials are documented in README.md. Mock email appears in the staff Outbox.'
    );
});
server.on('error', (error) => {
  console.error(`Could not listen: ${error.code || 'server_error'}`);
  process.exitCode = 1;
});
const timer = c.worker
  ? setInterval(
      () =>
        app.tick().catch(() => console.error('Worker iteration failed; inspect Execution Log.')),
      300
    )
  : null;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (timer) clearInterval(timer);
  server.close();
  let waited = 0;
  while (app.ticking && waited < 60000) {
    await new Promise((r) => setTimeout(r, 100));
    waited += 100;
  }
  if (!app.ticking) store.close();
  process.exitCode = 0;
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
