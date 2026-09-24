import { readdirSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [];
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(mjs|js)$/.test(entry.name)) files.push(file);
  }
}
for (const folder of ['src', 'scripts', 'tests', 'evaluation']) walk(join(root, folder));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(1);
  }
}
const destination = join(root, 'dist');
rmSync(destination, { recursive: true, force: true });
await build({ configFile: join(root, 'vite.config.mjs') });
for (const file of ['src', 'package.json'])
  cpSync(join(root, file), join(destination, file), { recursive: true });
// Routine checks must not rewrite the tracked build evidence.
if (!process.argv.includes('--no-save')) {
  mkdirSync(join(root, 'evidence'), { recursive: true });
  writeFileSync(
    join(root, 'evidence/build.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        node: process.version,
        syntaxFiles: files.length,
        files: files.map((file) => relative(root, file)),
        output: 'dist/',
        type: 'Svelte/Vite production bundle and Node.js 24 server after TypeScript checking',
        success: true
      },
      null,
      2
    ) + '\n'
  );
}
console.log(`Build OK: Svelte frontend and server written to dist/.`);
