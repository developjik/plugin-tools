'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PID_RE = /^\d+$/;

function lockPath(target) {
  return target + '.lock';
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === 'ESRCH') return false;
    // EPERM: process exists but we can't signal it — treat as alive.
    return true;
  }
}

function readLockPid(lock) {
  try {
    const raw = fs.readFileSync(lock, 'utf8').trim();
    if (!PID_RE.test(raw)) return null;
    const pid = parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function tryReclaimStale(lock) {
  const pid = readLockPid(lock);
  if (pid == null) {
    // Malformed lock — too risky to unlink blindly. Let acquire retry-and-fail visibly.
    return false;
  }
  if (isProcessAlive(pid)) return false;
  // TOCTOU mitigation: only unlink if the PID we just read is still the owner.
  try {
    const raw = fs.readFileSync(lock, 'utf8').trim();
    if (!PID_RE.test(raw) || parseInt(raw, 10) !== pid) return false;
    fs.unlinkSync(lock);
    return true;
  } catch { return false; }
}

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

async function acquire(target, opts = {}) {
  const lock = lockPath(target);
  const retries = opts.retries ?? 3;
  const delayMs = opts.delayMs ?? 200;
  let lastErr;

  for (let i = 0; i <= retries; i++) {
    try {
      const fd = fs.openSync(lock, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.fsyncSync(fd);
      fs.closeSync(fd);

      let released = false;
      const sigHandlers = {};
      const release = () => {
        if (released) return;
        released = true;
        try {
          const owner = readLockPid(lock);
          if (owner === process.pid) fs.unlinkSync(lock);
        } catch {}
        process.removeListener('exit', release);
        for (const sig of SIGNALS) {
          try { process.removeListener(sig, sigHandlers[sig]); } catch {}
        }
      };
      process.on('exit', release);
      for (const sig of SIGNALS) {
        const handler = () => {
          release();
          // Re-raise the signal so the process exits with the correct exit code.
          try { process.kill(process.pid, sig); } catch { process.exit(130); }
        };
        sigHandlers[sig] = handler;
        process.on(sig, handler);
      }
      return { release };
    } catch (e) {
      lastErr = e;
      if (e.code !== 'EEXIST') throw e;
      if (tryReclaimStale(lock)) continue;
      if (i < retries) await sleep(delayMs * (i + 1));
    }
  }

  const err = new Error(`could not acquire lock ${lock} after ${retries + 1} attempts`);
  err.code = 'ELOCKED';
  err.cause = lastErr;
  throw err;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { acquire, lockPath, isProcessAlive };
