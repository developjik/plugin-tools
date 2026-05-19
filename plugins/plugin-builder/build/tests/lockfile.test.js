'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lockfile = require('../core/lockfile.js');

function tmpTarget() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-lock-'));
  return path.join(dir, 'marketplace.json');
}

test('lockfile: acquire then release allows re-acquire', async () => {
  const t = tmpTarget();
  const a = await lockfile.acquire(t, { retries: 0 });
  a.release();
  const b = await lockfile.acquire(t, { retries: 0 });
  b.release();
});

test('lockfile: stale lock with dead PID gets reclaimed', async () => {
  const t = tmpTarget();
  const lock = lockfile.lockPath(t);
  // Write an unlikely-alive PID.
  fs.writeFileSync(lock, '99999999');
  const a = await lockfile.acquire(t, { retries: 1, delayMs: 5 });
  assert.equal(fs.readFileSync(lock, 'utf8').trim(), String(process.pid));
  a.release();
});

test('lockfile: malformed PID does NOT get auto-unlinked', async () => {
  const t = tmpTarget();
  const lock = lockfile.lockPath(t);
  fs.writeFileSync(lock, 'not-a-pid');
  await assert.rejects(
    () => lockfile.acquire(t, { retries: 1, delayMs: 5 }),
    err => err.code === 'ELOCKED'
  );
  assert.ok(fs.existsSync(lock), 'malformed lock must not be unlinked silently');
  fs.unlinkSync(lock);
});

test('lockfile: held lock by alive PID rejects after retries', async () => {
  const t = tmpTarget();
  const lock = lockfile.lockPath(t);
  fs.writeFileSync(lock, String(process.pid)); // alive PID = us
  await assert.rejects(
    () => lockfile.acquire(t, { retries: 1, delayMs: 5 }),
    err => err.code === 'ELOCKED'
  );
  fs.unlinkSync(lock);
});

test('lockfile: release after another holder must not unlink', async () => {
  const t = tmpTarget();
  const a = await lockfile.acquire(t, { retries: 0 });
  // Simulate someone else replacing the lock content.
  fs.writeFileSync(lockfile.lockPath(t), '1');
  a.release(); // should detect non-ownership and not unlink
  assert.ok(fs.existsSync(lockfile.lockPath(t)), 'lock owned by other PID must survive our release');
  fs.unlinkSync(lockfile.lockPath(t));
});
