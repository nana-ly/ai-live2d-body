const fs = require('fs');
const path = require('path');

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

function encodeClaudeProjectPath(projectPath) {
  return path.resolve(projectPath).replace(/:/g, '-').replace(/\\/g, '-');
}

function resolveClaudeSessionDir(options = {}) {
  if (options.transcriptDir) return options.transcriptDir;

  const fromEnv = process.env.CLAUDE_TRANSCRIPT_DIR || process.env.AGENT_TRANSCRIPT_DIR;
  if (fromEnv) return fromEnv;

  const projectPath = options.projectPath || process.cwd();
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (!home) return null;

  return path.join(home, '.claude', 'projects', encodeClaudeProjectPath(projectPath));
}

function findLatestSessionTranscript(sessionDir) {
  if (!sessionDir || !fs.existsSync(sessionDir)) return null;

  const files = fs.readdirSync(sessionDir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => {
      const fullPath = path.join(sessionDir, name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files[0]?.fullPath || null;
}

function extractText(entry) {
  if (!entry) return '';

  if (typeof entry.text === 'string' && entry.text.trim()) {
    return entry.text.trim();
  }

  const message = entry.message || entry.payload?.message;
  if (!message) return '';

  if (typeof message.content === 'string') {
    return message.content.trim();
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function entryRole(entry) {
  if (entry.role) return entry.role;
  if (entry.type === 'user') return 'user';
  if (entry.type === 'assistant') return 'assistant';
  if (entry.message?.role) return entry.message.role;
  return 'assistant';
}

function entryId(entry, index) {
  return String(entry.uuid || entry.id || `${entry.timestamp || entry.createdAt || index}-${entryRole(entry)}`);
}

function startTranscriptWatcher(getWindow, options = {}) {
  const pollMs = Number(options.pollMs || process.env.TRANSCRIPT_POLL_MS || 800);
  const fadeMs = Number(options.fadeMs || process.env.BUBBLE_FADE_MS || 0);
  const sessionDir = resolveClaudeSessionDir(options);
  let lastSeenId = '';
  let activeTranscriptPath = options.transcriptPath || process.env.CLAUDE_TRANSCRIPT_PATH || null;
  let lastSize = 0;

  if (!sessionDir && !activeTranscriptPath) {
    console.log('[transcript-watcher] skipped — set CLAUDE_TRANSCRIPT_DIR or run Claude Code in this project');
    return null;
  }

  console.log(`[transcript-watcher] session dir: ${sessionDir || '(direct file mode)'}`);

  const timer = setInterval(() => {
    try {
      if (!activeTranscriptPath && sessionDir) {
        activeTranscriptPath = findLatestSessionTranscript(sessionDir);
      }

      if (!activeTranscriptPath || !fs.existsSync(activeTranscriptPath)) return;

      const stat = fs.statSync(activeTranscriptPath);
      if (stat.size === lastSize && lastSeenId) return;
      lastSize = stat.size;

      const lines = readJsonLines(activeTranscriptPath);
      const candidates = lines
        .map((entry, index) => ({
          entry,
          index,
          id: entryId(entry, index),
          role: entryRole(entry),
          text: extractText(entry)
        }))
        .filter((item) => item.text && (item.role === 'user' || item.role === 'assistant'))
        .filter((item) => (
          !item.text.startsWith('[pulse')
          && !item.text.startsWith('[murmur]')
          && !item.text.startsWith('[pet-touch')
        ));

      const latest = candidates[candidates.length - 1];
      if (!latest || latest.id === lastSeenId) return;

      lastSeenId = latest.id;

      if (typeof options.onMessage === 'function') {
        options.onMessage(latest);
      }

      // 只把 assistant 的气泡发到桌宠，用户的消息不显示
      if (latest.role !== 'assistant') return;

      const win = typeof getWindow === 'function' ? getWindow() : getWindow;
      win?.webContents?.send('external:control', {
        bubble: {
          role: latest.role,
          text: latest.text.slice(0, 500),
          fadeMs
        }
      });
    } catch (error) {
      console.warn('[transcript-watcher]', error.message || error);
    }
  }, pollMs);

  return {
    stop: () => clearInterval(timer)
  };
}

module.exports = {
  startTranscriptWatcher,
  extractText,
  entryRole,
  encodeClaudeProjectPath,
  resolveClaudeSessionDir,
  findLatestSessionTranscript
};
