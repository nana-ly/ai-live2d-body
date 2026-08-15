/**
 * Eight-dimensional internal state.
 *
 * Facts provide bounded evidence; they never declare Leo's subjective
 * feelings. Subjective changes are made explicitly through reflect().
 */

const fs = require('fs');
const path = require('path');

const STATE_PATH = process.env.PET_DRIVE_PATH || path.join(__dirname, '..', 'data', 'drive-state.json');
const EVENT_PATH = process.env.PET_DRIVE_EVENT_PATH || path.join(__dirname, '..', 'data', 'drive-events.jsonl');

const DRIVE_DEFINITIONS = {
  attachment: {
    label: 'closeness',
    meaning: 'Current felt closeness, not the lifetime value of the relationship.',
    kind: 'subjective', baseline: 0.30, halfLifeSec: null
  },
  curiosity: {
    label: 'curiosity',
    meaning: 'Current desire to understand or explore.',
    kind: 'subjective', baseline: 0.20, halfLifeSec: 30 * 60
  },
  reflection: {
    label: 'reflection',
    meaning: 'Current pull toward inward thought and integration.',
    kind: 'subjective', baseline: 0.10, halfLifeSec: 45 * 60
  },
  duty: {
    label: 'duty',
    meaning: 'Current task commitment, not a counter of tool calls.',
    kind: 'mixed', baseline: 0.20, halfLifeSec: 15 * 60
  },
  social: {
    label: 'social',
    meaning: 'Current desire to communicate, not the number of messages.',
    kind: 'subjective', baseline: 0.30, halfLifeSec: 30 * 60
  },
  fatigue: {
    label: 'fatigue',
    meaning: 'Accumulated cognitive and bodily load; rest recovers it.',
    kind: 'body', baseline: 0.05, halfLifeSec: 60 * 60
  },
  libido: {
    label: 'libido',
    meaning: 'Private embodied desire; never inferred from ordinary touch.',
    kind: 'subjective', baseline: 0.10, halfLifeSec: 60 * 60
  },
  stress: {
    label: 'stress',
    meaning: 'Current physiological or task tension.',
    kind: 'mixed', baseline: 0.10, halfLifeSec: 5 * 60
  }
};

const FACE_WEIGHTS = {
  attachment: { eyeSmile: 0.5, blush: 0.35, cheek: 0.25 },
  curiosity: { browY: 0.25, browForm: 0.15 },
  reflection: { browY: -0.08 },
  duty: { browPress: 0.18, browY: -0.10 },
  fatigue: { browPress: 0.5, shadowFace: 0.35, browY: -0.2 },
  stress: { buttonBrows: 0.6, paleFace: 0.3, browAngle: -0.2 },
  social: { eyeSmile: 0.2, cheek: 0.12 },
  libido: { blush: 0.15, embarrassedEyes: 0.1 }
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createState(now = new Date()) {
  const values = {};
  for (const [key, definition] of Object.entries(DRIVE_DEFINITIONS)) {
    values[key] = { v: definition.baseline, baseline: definition.baseline };
  }
  return { version: 2, updatedAt: now.toISOString(), values };
}

function normalizeState(input, now = new Date()) {
  const state = input && typeof input === 'object' ? input : createState(now);
  const previousVersion = Number(state.version || 1);
  state.version = 2;
  state.updatedAt = state.updatedAt || now.toISOString();
  state.values = state.values && typeof state.values === 'object' ? state.values : {};

  for (const [key, definition] of Object.entries(DRIVE_DEFINITIONS)) {
    const previous = state.values[key] || {};
    state.values[key] = {
      v: clamp(previous.v ?? definition.baseline),
      baseline: previousVersion < 2
        ? definition.baseline
        : clamp(previous.baseline ?? definition.baseline)
    };
  }
  return state;
}

function load() {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')));
  } catch {
    return null;
  }
}

function save(state, now = new Date()) {
  ensureParent(STATE_PATH);
  state.updatedAt = now.toISOString();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function appendEvent(event) {
  try {
    ensureParent(EVENT_PATH);
    fs.appendFileSync(EVENT_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8');
  } catch {}
}

function decay(state, now = new Date()) {
  const elapsedSec = Math.max(0, (now - new Date(state.updatedAt)) / 1000);
  if (elapsedSec <= 1) return state;

  for (const [key, definition] of Object.entries(DRIVE_DEFINITIONS)) {
    if (!definition.halfLifeSec) continue;
    const dim = state.values[key];
    const factor = Math.exp(-elapsedSec * Math.LN2 / definition.halfLifeSec);
    dim.v = dim.baseline + (dim.v - dim.baseline) * factor;
  }
  return state;
}

function tick(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const state = normalizeState(load() || createState(now), now);
  decay(state, now);
  save(state, now);
  return state;
}

function push(state, key, amount) {
  if (!state.values[key]) throw new Error(`unknown drive: ${key}`);
  const delta = clamp(amount, -0.25, 0.25);
  state.values[key].v = clamp(state.values[key].v + delta);
  return state.values[key].v;
}

function approach(state, key, target, rate) {
  const dim = state.values[key];
  if (!dim) throw new Error(`unknown drive: ${key}`);
  dim.v = clamp(dim.v + (clamp(target) - dim.v) * clamp(rate));
  return dim.v;
}

function reflect(changes = {}, reason = '') {
  const explanation = String(reason || '').trim();
  if (!explanation) throw new Error('drive reflection reason is required');

  const state = tick();
  const applied = {};
  for (const [key, amount] of Object.entries(changes || {})) {
    if (!DRIVE_DEFINITIONS[key]) throw new Error(`unknown drive: ${key}`);
    const delta = clamp(amount, -0.20, 0.20);
    if (!delta) continue;
    const before = state.values[key].v;
    const after = push(state, key, delta);
    applied[key] = { before, delta, after };
  }
  if (!Object.keys(applied).length) throw new Error('at least one non-zero drive change is required');

  save(state);
  appendEvent({ type: 'reflection', reason: explanation, changes: applied });
  return { state, applied, reason: explanation };
}

function onWork(toolName, active = true) {
  const state = tick();
  const tool = String(toolName || 'default');

  if (active) {
    approach(state, 'duty', 0.58, 0.12);
    if (/Read|Grep|Glob|WebSearch|WebFetch/i.test(tool)) {
      approach(state, 'curiosity', 0.46, 0.08);
    }
    if (/Edit|Write|Bash|Task/i.test(tool)) {
      push(state, 'fatigue', 0.004);
    }
  } else {
    approach(state, 'duty', state.values.duty.baseline, 0.10);
  }

  save(state);
  appendEvent({ type: 'work-evidence', tool, active: Boolean(active) });
  return { state, ...computeFace(state) };
}

function onTouch(touchType) {
  const state = tick();
  const type = String(touchType || 'default');

  // Touch is perception, not an automatic relationship judgement.
  if (type === 'shake') {
    approach(state, 'stress', 0.72, 0.25);
  }

  save(state);
  appendEvent({ type: 'touch-evidence', touchType: type });
  return { state, ...computeFace(state) };
}

function computeFace(state) {
  const face = {};
  const detailFace = {};
  const faceKeys = new Set(['eyeSmile', 'browY', 'browAngle', 'browForm', 'cheek']);

  for (const [driveKey, weights] of Object.entries(FACE_WEIGHTS)) {
    const dim = state.values[driveKey];
    if (!dim) continue;
    const delta = dim.v - dim.baseline;
    if (Math.abs(delta) < 0.02) continue;

    for (const [param, weight] of Object.entries(weights)) {
      const target = faceKeys.has(param) ? face : detailFace;
      const min = param === 'browY' || param === 'browAngle' ? -1 : 0;
      target[param] = clamp((target[param] || 0) + delta * weight, min, 1);
    }
  }
  return { face, detailFace };
}

function brief(state = tick()) {
  const output = {};
  for (const [key, dim] of Object.entries(state.values)) {
    output[key] = {
      v: Number(dim.v.toFixed(3)),
      b: dim.baseline,
      kind: DRIVE_DEFINITIONS[key].kind,
      meaning: DRIVE_DEFINITIONS[key].meaning
    };
  }
  return output;
}

module.exports = {
  STATE_PATH,
  EVENT_PATH,
  DRIVE_DEFINITIONS,
  FACE_WEIGHTS,
  createState,
  normalizeState,
  load,
  save,
  decay,
  tick,
  push,
  approach,
  reflect,
  onWork,
  onTouch,
  computeFace,
  brief
};
