import { readdirSync, readFileSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const files=[];
function walk(path){for(const e of readdirSync(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())walk(p);else if(/\.(mjs|js)$/.test(e.name))files.push(p);}}
for(const folder of ['src','web','scripts','tests','evaluation'])walk(join(root,folder));
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){process.stderr.write(r.stderr);process.exit(1);}}
for(const file of ['web/index.html','web/style.css','web/app.js','web/api.js','src/schema.sql'])if(!readFileSync(join(root,file),'utf8').trim())throw new Error(`Empty required asset: ${file}`);
const dest=join(root,'dist');rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});
for(const file of ['src','web','package.json'])cpSync(join(root,file),join(dest,file),{recursive:true});
const result={checkedAt:new Date().toISOString(),node:process.version,syntaxFiles:files.length,files:files.map(f=>relative(root,f)),output:'dist/',type:'Native ES module syntax validation and deployment copy; no transpilation required',success:true};
mkdirSync(join(root,'evidence'),{recursive:true});writeFileSync(join(root,'evidence/build.json'),JSON.stringify(result,null,2)+'\n');
console.log(`Build OK: ${files.length} JavaScript modules checked; deployment files copied to dist/.`);
