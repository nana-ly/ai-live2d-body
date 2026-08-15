const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

const { createControlServer } = require('./services/control-server');
const { startTranscriptWatcher } = require('./services/transcript-watcher');
const { startTouchInjector } = require('./services/touch-injector');
const { startPulseScheduler, startIdlePulse } = require('./services/pulse-scheduler');
const { bumpActivity, getIdleMs } = require('./services/activity-tracker');
const { createEmbeddedBrain } = require('./brain/embedded-ai');
const { start: startMurmur } = require('./services/murmur-engine');

let win;
let controlServer;
let embeddedBrain;

const dataDir = path.join(__dirname, 'data');
const chatHistoryPath = path.join(dataDir, 'chat-history.json');
const petTouchPath = path.join(dataDir, 'pet-touch.jsonl');
const sandboxRoot = path.join(__dirname, 'sandbox-files');

const bodyOnly = process.env.PET_BODY_ONLY !== '0';
const enableEmbeddedAi = !bodyOnly;
const enablePulse = process.env.PET_PULSE === '1';

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function appendJsonLine(filePath, value) {
  ensureDataDir();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function sendLive2DControl(payload) {
  win?.webContents.send('external:control', payload);
  return { ok: true, sent: payload };
}

function recordTouch(payload) {
  bumpActivity('touch');
  appendJsonLine(petTouchPath, {
    createdAt: new Date().toISOString(),
    ...payload
  });
  return { ok: true, queued: true };
}

function createWindow() {
  win = new BrowserWindow({
    width: 350,
    height: 500,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 260,
    minHeight: 380,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile('renderer.html');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[renderer] ${message}`);
  });
}

function startBodyServices() {
  controlServer = createControlServer(() => win, {
    port: process.env.PET_CONTROL_PORT || 3470,
    onTouch: recordTouch
  });

  startTranscriptWatcher(() => win, {
    projectPath: __dirname,
    transcriptPath: process.env.CLAUDE_TRANSCRIPT_PATH || process.env.AGENT_TRANSCRIPT_PATH,
    transcriptDir: process.env.CLAUDE_TRANSCRIPT_DIR || process.env.AGENT_TRANSCRIPT_DIR,
    fadeMs: process.env.BUBBLE_FADE_MS || 30000,
    onMessage: (item) => {
      if (item.role === 'user') bumpActivity('claude-user');
    }
  });

  startTouchInjector({
    dataDir,
    touchPath: petTouchPath
  });

  // Phase 3: push drive state to renderer for visualization
  let lastTickMs = Date.now();
  setInterval(() => {
    try {
      const state = require('./services/drive-engine').tick();
      const now = Date.now();
      const idleSec = (now - lastTickMs) / 1000;

      // Factual push: idle time → reflection (silence breeds thought)
      if (idleSec >= 10) {
        const de = require('./services/drive-engine');
        de.push(state, 'reflection', Math.min(0.04, idleSec * 0.002));
        de.save(state);
      }
      lastTickMs = now;

      const brief = {};
      for (const [k, d] of Object.entries(state.values)) {
        brief[k] = { v: +d.v.toFixed(2), b: d.baseline };
      }
      win?.webContents?.send('external:control', { driveState: brief });
    } catch {}
  }, 2000);

  // Phase 5: MurMur — internal monologue, thought hints every ~20s when drives are elevated
  startMurmur({ tickMs: 10000, murmurEvery: 2 });

  if (enablePulse) {
    if (process.env.PULSE_INTERVAL_MS && process.env.PULSE_IDLE_MS === undefined && !process.env.PULSE_IDLE_MS) {
      startPulseScheduler();
    } else {
      startIdlePulse({ getIdleMs });
    }
  }
}

app.whenReady().then(() => {
  fs.mkdirSync(sandboxRoot, { recursive: true });
  ensureDataDir();

  if (enableEmbeddedAi) {
    embeddedBrain = createEmbeddedBrain(sendLive2DControl);
    if (embeddedBrain.aiClient) {
      console.log(`[brain:embedded] model=${embeddedBrain.aiConfig.model}`);
    } else {
      console.log('[brain:embedded] no API key - chat disabled');
    }
  } else {
    console.log('[body] peripheral mode - brain is Claude Code / external agent');
  }

  createWindow();
  startBodyServices();
});

ipcMain.handle('ai:chat', async (_event, messages) => {
  if (embeddedBrain?.handleChat) {
    return embeddedBrain.handleChat(messages);
  }

  return {
    text: '大脑在 Claude Code 那边。去那边聊。',
    emotion: 'deadpan',
    motion: 'none'
  };
});

ipcMain.handle('ai:get-mode', () => ({
  bodyOnly,
  embeddedAi: Boolean(embeddedBrain?.aiClient),
  provider: embeddedBrain?.aiConfig?.provider || '',
  model: embeddedBrain?.aiConfig?.model || '',
  controlPort: Number(process.env.PET_CONTROL_PORT || 3470)
}));

ipcMain.handle('pet:touch', (_event, payload) => recordTouch({ source: 'renderer', ...payload }));

ipcMain.handle('pet:send-message', (_event, text) => {
  const { injectToTmux } = require('./services/tmux-inject');
  const message = `[pet-chat] ${text}`;
  const result = injectToTmux(message);
  if (result.ok) bumpActivity('user-chat');
  return result;
});

ipcMain.handle('memory:load-chat-history', () => readJsonFile(chatHistoryPath, []));

ipcMain.handle('memory:save-chat-history', (_event, history) => {
  const safeHistory = Array.isArray(history) ? history.slice(-200) : [];
  writeJsonFile(chatHistoryPath, safeHistory);
  return safeHistory;
});

ipcMain.on('window:resize-by', (_event, { deltaWidth, deltaHeight }) => {
  if (!win) return;
  const [width, height] = win.getSize();
  win.setSize(
    Math.max(260, Math.round(width + deltaWidth)),
    Math.max(380, Math.round(height + deltaHeight))
  );
});

ipcMain.on('window:move-by', (_event, { dx, dy }) => {
  if (!win) return;
  const ndx = Number(dx) || 0;
  const ndy = Number(dy) || 0;
  if (!ndx && !ndy) return;
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + ndx), Math.round(y + ndy));
});

app.on('window-all-closed', () => {
  controlServer?.close();
  app.quit();
});
