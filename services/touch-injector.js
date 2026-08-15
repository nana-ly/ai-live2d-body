const fs = require('fs');
const path = require('path');
const { injectToTmux, describeTmuxBackend } = require('./tmux-inject');
const driveEngine = require('./drive-engine');

function readJsonLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function formatTouchMessage(payload) {
  const type = payload.type || 'click';
  const area = payload.area || 'body';

  if (type === 'drag') {
    const distance = Math.round(Number(payload.distance || 0));
    return `[pet-touch] Lily stroked you (${distance}px on ${area}).`;
  }

  if (type === 'shake') {
    return '[pet-touch] Lily shook you — you feel dizzy.';
  }

  if (type === 'click') {
    return `[pet-touch] Lily touched your ${area}.`;
  }

  return `[pet-touch] ${payload.message || 'Lily interacted with you.'}`;
}

function touchDedupKey(payload) {
  const type = payload.type || 'click';
  const area = payload.area || 'body';
  return `${type}:${area}`;
}

function startTouchInjector(options = {}) {
  const touchPath = options.touchPath || path.join(options.dataDir || path.join(__dirname, '..', 'data'), 'pet-touch.jsonl');
  const pollMs = Number(options.pollMs || 400);
  const dedupMs = Number(options.dedupMs || 3000);  // 同类型同区域 3s 内只注入一次
  const onDriveFace = options.onDriveFace || null;  // callback({face, detailFace}) for renderer

  // 启动时清空旧数据，避免重启重播历史
  try { fs.writeFileSync(touchPath, '', 'utf8'); } catch {}

  let processed = 0;
  const lastInjected = new Map();

  console.log(`[touch-injector] watching ${touchPath}`);
  console.log(`[touch-injector] tmux: ${describeTmuxBackend()}`);

  const timer = setInterval(() => {
    try {
      const lines = readJsonLines(touchPath);
      if (lines.length <= processed) return;

      const fresh = lines.slice(processed);
      processed = lines.length;

      fresh.forEach((payload) => {
        // shake 不参与去重，每次都送
        if (payload.type !== 'shake') {
          const key = touchDedupKey(payload);
          const now = Date.now();
          const last = lastInjected.get(key) || 0;
          if (now - last < dedupMs) return;
          lastInjected.set(key, now);
        }

        const message = formatTouchMessage(payload);
        const result = injectToTmux(message, options);
        console.log(`[touch-injector] ${message}`, result.ok ? '→ tmux' : '→ log only');

        // Factual push: shake → stress (no judgement needed)
        if (payload.type === 'shake') {
          try {
            const s = driveEngine.tick();
            driveEngine.push(s, 'stress', 0.06);
            driveEngine.save(s);
          } catch {}
        }
      });
    } catch (error) {
      console.warn('[touch-injector]', error.message || error);
    }
  }, pollMs);

  return {
    stop: () => clearInterval(timer),
    injectToTmux,
    formatTouchMessage
  };
}

module.exports = {
  startTouchInjector,
  injectToTmux,
  formatTouchMessage
};
