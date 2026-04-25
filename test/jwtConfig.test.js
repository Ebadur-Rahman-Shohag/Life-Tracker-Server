import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const childScript = join(dirname(fileURLToPath(import.meta.url)), 'jwtConfigChild.mjs');

test('getJwtSecret throws in production when JWT_SECRET is missing', () => {
  const r = spawnSync(process.execPath, [childScript], { encoding: 'utf8' });
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
});
