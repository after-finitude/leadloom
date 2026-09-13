import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('deploy rejects non-SHA SSH commands before accessing server files', () => {
  const script = fileURLToPath(new URL('../scripts/deploy.sh', import.meta.url));
  for (const command of ['', 'main', 'a'.repeat(39), 'a'.repeat(41), `${'a'.repeat(40)};id`]) {
    const result = spawnSync('sh', [script], {
      env: { ...process.env, SSH_ORIGINAL_COMMAND: command },
      encoding: 'utf8'
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Expected a (full )?Git commit SHA\./);
    assert.equal(result.stdout, '');
  }
});
