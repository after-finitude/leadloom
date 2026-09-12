import { readEnv,config } from '../src/config.mjs';
import { Store } from '../src/db.mjs';
import { Leadloom } from '../src/service.mjs';
import { seedDemo } from '../src/seed.mjs';
readEnv();const c=config();if(c.mode!=='demo'||[c.llmProvider,c.calendarProvider,c.emailProvider].some(x=>x!=='mock'))throw new Error('Seed requires demo mode with all three mock providers.');
const store=new Store(c.dbPath);try{const app=new Leadloom(store,c);app.init();await seedDemo(app);console.log(`Synthetic demo leads: ${store.get('SELECT COUNT(*) n FROM leads').n}`);}finally{store.close();}
