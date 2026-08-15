const http = require('http');

function createControlServer(getWindow, options = {}) {
  const port = Number(options.port || process.env.PET_CONTROL_PORT || 3470);
  const endpoints = new Set([
    '/control',
    '/speak',
    '/emotion',
    '/act',
    '/signature',
    '/touch',
    '/work',
    '/heartbeat',
    '/bubble'
  ]);

  function sendToRenderer(payload) {
    const win = typeof getWindow === 'function' ? getWindow() : getWindow;
    win?.webContents?.send('external:control', payload);
    return { ok: true, sent: payload };
  }

  function normalizeEmotionPayload(emotion = 'neutral') {
    return {
      emotion: String(emotion || 'neutral'),
      motion: 'none'
    };
  }

  function handlePayload(endpoint, payload) {
    if (endpoint === '/control') {
      return sendToRenderer(payload);
    }

    if (endpoint === '/speak') {
      return sendToRenderer({
        text: String(payload.text || ''),
        emotion: payload.emotion || 'neutral',
        motion: payload.motion || payload.action || 'none',
        face: payload.face,
        detailFace: payload.detailFace,
        speak: true,
        tts: payload.tts !== false
      });
    }

    if (endpoint === '/emotion') {
      // Phase 4: /emotion hook demoted — face/detailFace only, no emotion preset
      return sendToRenderer({
        face: payload.face,
        detailFace: payload.detailFace,
        source: 'hook'
      });
    }

    if (endpoint === '/act') {
      return sendToRenderer({
        emotion: payload.emotion,
        motion: payload.action || payload.motion || 'none',
        actionParam: payload.actionParam || payload.prop,
        face: payload.face,
        detailFace: payload.detailFace,
        choreo: payload.choreo,
        expression: payload.expression,
        source: 'mcp'
      });
    }

    if (endpoint === '/signature') {
      return sendToRenderer({
        signature: String(payload.text || payload.signature || '')
      });
    }

    if (endpoint === '/work' || endpoint === '/heartbeat') {
      // Factual push: working → duty
      if (payload.active !== false && payload.status !== 'idle') {
        try {
          const de = require('./drive-engine');
          const s = de.tick();
          de.push(s, 'duty', 0.05);
          de.save(s);
        } catch {}
      }
      return sendToRenderer({
        work: {
          active: payload.active !== false && payload.status !== 'idle',
          tool: String(payload.tool || payload.toolName || payload.name || 'default'),
          status: payload.status || (payload.active === false ? 'idle' : 'working')
        }
      });
    }

    if (endpoint === '/bubble') {
      return sendToRenderer({
        bubble: {
          role: payload.role || 'assistant',
          text: String(payload.text || ''),
          fadeMs: Number(payload.fadeMs || 30000)
        }
      });
    }

    if (endpoint === '/touch') {
      return options.onTouch?.(payload) || { ok: true, queued: true };
    }

    throw new Error(`Unknown endpoint: ${endpoint}`);
  }

  const server = http.createServer((request, response) => {
    const endpoint = request.url?.split('?')[0] || '';

    if (request.method !== 'POST' || !endpoints.has(endpoint)) {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100000) request.destroy();
    });

    request.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = handlePayload(endpoint, payload);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, ...result }));
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: String(error.message || error) }));
      }
    });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[pet-control] http://127.0.0.1:${port}`);
    console.log('[pet-control] POST /emotion /work /heartbeat /speak /act /signature /bubble /touch /control');
  });

  return server;
}

module.exports = { createControlServer };
