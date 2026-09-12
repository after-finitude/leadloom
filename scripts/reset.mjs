import { readEnv,config } from '../src/config.mjs';
import { Store } from '../src/db.mjs';
import { existsSync,rmSync } from 'node:fs';
readEnv();const c=config();
if(c.mode!=='demo'||[c.llmProvider,c.calendarProvider,c.emailProvider].some(x=>x!=='mock'))throw new Error('Reset is restricted to demo mode with all mock providers.');
if(!process.argv.includes('--confirm-stopped'))throw new Error('Stop the web server and worker, then run npm run demo:reset -- --confirm-stopped. This deletes only the configured DEMO database.');
if(!existsSync(c.dbPath)){console.log('There is no demo database to reset.');process.exit(0);}
const s=new Store(c.dbPath);const marker=s.get("SELECT value FROM app_metadata WHERE key='mode'");s.close();
if(marker?.value!=='demo')throw new Error('Refusing to delete a database without an explicit demo marker.');
for(const suffix of ['', '-wal', '-shm'])rmSync(c.dbPath+suffix,{force:true});
console.log('Configured demo database removed. Other databases and the encryption key were not touched. npm start recreates the demo.');
