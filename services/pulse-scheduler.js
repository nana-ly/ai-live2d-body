/**
 * Compatibility wrapper.
 *
 * Pulse and MurMur used to be separate timers. They now share the single
 * drive-aware MurMur scheduler so two wake systems cannot inject at once.
 */

const { start: startMurmur } = require('./murmur-engine');
const { getIdleMs } = require('./activity-tracker');

function startIdlePulse(options = {}) {
  return startMurmur({
    ...options,
    getIdleMs: options.getIdleMs || getIdleMs
  });
}

function startPulseScheduler(options = {}) {
  const intervalMs = Number(options.intervalMs || process.env.PULSE_INTERVAL_MS || 45 * 60 * 1000);
  return startMurmur({
    ...options,
    tickMs: options.tickMs || 10000,
    checkEvery: options.checkEvery || 2,
    idleMs: options.idleMs || intervalMs,
    cooldownMs: options.cooldownMs || intervalMs,
    getIdleMs: options.getIdleMs || getIdleMs
  });
}

function injectPulseMessage() {
  throw new Error('direct pulse injection was removed; use the MurMur scheduler');
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  startIdlePulse();
  console.log('[pulse] compatibility entrypoint -> MurMur scheduler');
}

module.exports = {
  startPulseScheduler,
  startIdlePulse,
  injectPulseMessage
};
