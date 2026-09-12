import { readEnv,config } from '../src/config.mjs';
import { Store } from '../src/db.mjs';
import { mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
readEnv();const c=config(),s=new Store(c.dbPath);
const target=resolve(process.argv[2]||`${dirname(c.dbPath)}/backups/leadloom-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
mkdirSync(dirname(target),{recursive:true,mode:0o700});
try{s.run('VACUUM INTO ?',target);console.log(`Database snapshot: ${target}`);console.log('Keep the encryption key securely with the backup. It is NOT printed or copied by this command.');}finally{s.close();}
