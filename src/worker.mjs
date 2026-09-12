import { readEnv, config } from './config.mjs';
import { Store } from './db.mjs';
import { Leadloom } from './service.mjs';
readEnv();
const c = config(),
  store = new Store(c.dbPath),
  app = new Leadloom(store, c);
app.init();
let stop = false;
process.on('SIGTERM', () => {
  stop = true;
});
process.on('SIGINT', () => {
  stop = true;
});
console.log('Leadloom durable SQLite worker started. No Redis dependency in this edition.');
while (!stop) {
  try {
    await app.tick();
  } catch {
    console.error('Worker iteration failed; retained actions will be inspected again.');
  }
  await new Promise((r) => setTimeout(r, 300));
}
store.close();
