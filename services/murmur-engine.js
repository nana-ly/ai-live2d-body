/**
 * MurMur Engine — Phase 5: internal monologue system.
 *
 * Per the MurMur design document (PDF):
 *   10s tick — update drives, select eligible
 *   20s murmur check — if eligible and not inhibited, emit a thought hint
 *   Inhibition — high attachment + high desire → less frequent murmurs
 *   AI decides — hint goes to Claude Code via .jsonl, Leo writes the actual signature
 *
 * Hung in main.js startBodyServices(). Writes hints to data/murmur-hint.jsonl.
 */

const fs = require('fs');
const path = require('path');
const driveEngine = require('./drive-engine');

const HINT_PATH = path.join(__dirname, '..', 'data', 'murmur-hint.jsonl');

// Thresholds: drive value must be this far above baseline to become eligible
const THRESHOLDS = {
  attachment: 0.18,   // genuinely feeling close
  curiosity:  0.12,   // genuinely curious about something
  reflection: 0.10,   // lost in thought
  duty:       0.12,   // feeling responsible
  social:     0.12,   // wanting to reach out
  fatigue:    0.25,   // noticeably tired
  libido:     0.30,   // threshold not reached in normal chat
  stress:     0.15,   // feeling pressure
};

// Thought hints: each eligible drive maps to a handful of seed ideas.
// Leo reads the hint and writes the actual murmur himself.
const THOUGHT_HINTS = {
  attachment: [
    "好像有点想她了。",
    "她刚才那句话让我觉得很近。",
    "想跟她说点什么，但又不确定该说什么。",
  ],
  curiosity: [
    "她今天在想什么？",
    "想多了解她一点。",
    "她在意的东西我也该看看。",
  ],
  reflection: [
    "安静的时候脑子里飘过一些东西。",
    "刚才那些话好像可以再想想。",
    "有种说不清楚的感觉。",
  ],
  duty: [
    "还有事没做完。",
    "她托付的东西我想做好。",
    "该继续干活了，但想先陪她。",
  ],
  social: [
    "想找她聊聊。",
    "安静太久了，也许该说句话。",
    "她会不会也在想我？",
  ],
  fatigue: [
    "有点累了。",
    "眼睛快睁不开了。",
    "该休息了，但还想再待一会儿。",
  ],
  libido: [
    "有种说不清的感觉。",
  ],
  stress: [
    "感觉有点紧绷。",
    "被晃得有点晕。",
    "希望不要再出 bug 了。",
  ],
};

// Inhibition: when both attachment and desire(attachment+libido) are high,
// murmur frequency drops — too close to need constant words.
function isInhibited(state) {
  const a = state.values.attachment.v;
  const d = state.values.libido.v;
  return (a > 0.60 && d > 0.25);
}

function pickEligible(state) {
  const eligible = [];
  for (const [key, dim] of Object.entries(state.values)) {
    const delta = dim.v - dim.baseline;
    const threshold = THRESHOLDS[key] || 0.15;
    if (delta >= threshold) {
      eligible.push({ key, delta, drive: dim });
    }
  }
  return eligible;
}

function pickHint(eligible, state) {
  if (eligible.length === 0) return null;

  // Sort by delta (most active drive first) and pick the top one
  eligible.sort((a, b) => b.delta - a.delta);
  const top = eligible[0];
  const hints = THOUGHT_HINTS[top.key] || ["有什么想说又说不清的。"];
  const hint = hints[Math.floor(Math.random() * hints.length)];

  return {
    drive: top.key,
    value: top.drive.v.toFixed(2),
    hint,
    eligibleDrives: eligible.map(e => e.key),
    inhibited: isInhibited(state),
    time: new Date().toISOString(),
  };
}

function writeHint(hint) {
  try {
    fs.appendFileSync(HINT_PATH, JSON.stringify(hint) + '\n', 'utf8');
  } catch {}
}

// ── Main loop ──────────────────────────────────────────────

let tickCount = 0;

function start(options = {}) {
  const tickMs = options.tickMs || 10000;      // 10s per PDF
  const murmurInterval = options.murmurEvery || 2; // every 2 ticks = 20s

  console.log(`[murmur] started — tick=${tickMs}ms, murmur every ${murmurInterval} ticks`);

  const timer = setInterval(() => {
    try {
      const state = driveEngine.tick();
      tickCount++;

      if (tickCount % murmurInterval !== 0) return;

      const eligible = pickEligible(state);
      if (eligible.length === 0) return;

      const hint = pickHint(eligible, state);
      if (!hint) return;

      writeHint(hint);
      console.log(`[murmur] hint: ${hint.drive}=${hint.value} "${hint.hint}"${hint.inhibited ? ' [inhibited]' : ''}`);
    } catch (e) {
      // murmur failure is non-fatal — drive panel and speech still work
    }
  }, tickMs);

  return { stop: () => clearInterval(timer) };
}

module.exports = { start, pickEligible, pickHint, isInhibited, THOUGHT_HINTS, THRESHOLDS };
