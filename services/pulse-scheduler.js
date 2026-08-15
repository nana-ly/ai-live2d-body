const { injectToTmux, describeTmuxBackend } = require('./tmux-inject');

function injectPulseMessage(text, options = {}) {
  if (!process.env.TMUX_SESSION && !process.env.PET_TMUX_SESSION && !options.session) {
    console.warn('[pulse] TMUX_SESSION not set');
    return { ok: false, reason: 'no_tmux_session' };
  }

  return injectToTmux(text, options);
}

function startPulseScheduler(options = {}) {
  const intervalMs = Number(options.intervalMs || process.env.PULSE_INTERVAL_MS || 45 * 60 * 1000);
  const message = options.message || process.env.PULSE_MESSAGE
    || '[pulse] You are awake on the desk. Decide if you want to say hi, update your signature, or stay quiet.';

  console.log(`[pulse] fixed every ${Math.round(intervalMs / 60000)} min -> ${describeTmuxBackend()}`);
  const timer = setInterval(() => {
    const result = injectPulseMessage(message, options);
    console.log('[pulse] injected', result.ok ? 'ok' : 'failed');
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
    injectPulseMessage
  };
}

function startIdlePulse(options = {}) {
  const idleMs = Number(options.idleMs || process.env.PULSE_IDLE_MS || 60000);
  const checkMs = Number(options.checkMs || process.env.PULSE_CHECK_MS || 5000);
  const cooldownMs = Number(options.cooldownMs || process.env.PULSE_COOLDOWN_MS || 60000);
  const getIdleMs = options.getIdleMs || (() => 0);

  let lastPulseAt = 0;

  console.log(`[pulse-idle] after ${Math.round(idleMs / 1000)}s quiet -> ${describeTmuxBackend()}`);

  const formatDriveSummary = () => {
    try {
      const state = require('./drive-engine').tick();
      const v = state.values;
      const top = Object.entries(v)
        .filter(([, d]) => d.v - d.baseline > 0.05)
        .sort((a, b) => (b[1].v - b[1].baseline) - (a[1].v - a[1].baseline))
        .slice(0, 3)
        .map(([k, d]) => `${k} ${d.v.toFixed(2)}`)
        .join(' ');
      return top ? ` | ${top}` : '';
    } catch { return ''; }
  };

  const timer = setInterval(() => {
    const quietFor = getIdleMs();
    if (quietFor < idleMs) return;

    const now = Date.now();
    if (now - lastPulseAt < cooldownMs) return;

    const driveInfo = formatDriveSummary();
    const fullMessage = `[pulse-idle] Lily has been quiet for a minute.${driveInfo}. If you want, use pet_speak to say something short in Leo voice. Or pet_signature. Or stay quiet.`;

    const result = injectPulseMessage(fullMessage, options);
    if (result.ok) {
      lastPulseAt = now;
      console.log(`[pulse-idle] injected after ${Math.round(quietFor / 1000)}s quiet${driveInfo}`);
    } else {
      console.log('[pulse-idle] skipped — tmux not ready');
    }
  }, checkMs);

  return {
    stop: () => clearInterval(timer),
    injectPulseMessage
  };
}

if (require.main === module) {
  require('dotenv').config();
  if (process.env.PULSE_IDLE_MS || process.env.PULSE_IDLE_MS === '0') {
    const { getIdleMs } = require('./activity-tracker');
    startIdlePulse({ getIdleMs });
  } else {
    startPulseScheduler();
  }
  console.log('[pulse] running — Ctrl+C to stop');
}

module.exports = {
  startPulseScheduler,
  startIdlePulse,
  injectPulseMessage
};
