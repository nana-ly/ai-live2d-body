/**
 * Drive engine — Phase 3: MurMur-style 8-dimension internal state.
 *
 * Loads/decays/pushes drive values, computes face params from current state.
 * Called by touch-injector (push on touch), post-tool hook (push on work),
 * and exposed to renderer for face computation.
 */

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', 'data', 'drive-state.json');

// Decay half-lives in seconds (how fast each drive returns to baseline)
const HALF_LIVES = {
  attachment: 300,  // slow — touches linger
  curiosity:   90,  // fast — newness wears off
  reflection: 300,  // slow — ambient
  duty:       120,  // medium — work focus
  social:     300,  // slow — interaction warmth
  fatigue:   1800,  // very slow — grows over hours
  libido:     200,  // medium
  stress:     120,  // fast — shake recovers quickly
};

// Push amounts for touch events
const TOUCH_PUSH = {
  head:     { attachment: 0.06, stress: -0.02 },
  face:     { attachment: 0.08, stress: -0.01 },
  chest:    { attachment: 0.05, libido: 0.02 },
  waist:    { attachment: 0.04, libido: 0.03 },
  side:     { attachment: 0.03 },
  shake:    { stress: 0.06, attachment: 0.02 },
  default:  { attachment: 0.03 },
};

// Face param weights: drive value (after baseline subtraction) * weight = face param
const FACE_WEIGHTS = {
  attachment: { eyeSmile: 0.5, blush: 0.4, cheek: 0.3 },
  curiosity:  { browY: 0.25, browForm: 0.15 },
  fatigue:    { browPress: 0.5, shadowFace: 0.4, browY: -0.2 },
  stress:     { buttonBrows: 0.6, awkwardMouth: 0.3, paleFace: 0.3, browAngle: -0.2 },
  social:     { smileMouth: 0.3, eyeSmile: 0.2 },
  libido:     { mouthForm: 0.2, blush: 0.15, embarrassedEyes: 0.1 },
  // reflection, duty don't have obvious face params
};


function load() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const state = JSON.parse(raw);
    if (!state.values || !state.updatedAt) {
      throw new Error('invalid drive-state.json');
    }
    return state;
  } catch (e) {
    return null;
  }
}

function save(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Apply time-based decay: each drive regresses toward its baseline.
 * decay = e^(-t * ln(2) / half_life)
 */
function decay(state) {
  const now = new Date();
  const elapsedSec = (now - new Date(state.updatedAt)) / 1000;
  if (elapsedSec <= 1) return; // no decay needed for sub-second gaps

  for (const [key, half] of Object.entries(HALF_LIVES)) {
    const dim = state.values[key];
    if (!dim) continue;
    const lambda = Math.LN2 / half;
    const factor = Math.exp(-elapsedSec * lambda);
    dim.v = dim.baseline + (dim.v - dim.baseline) * factor;
  }
}

/**
 * Push a drive value up or down. amount can be negative (e.g. stress relief).
 */
function push(state, key, amount) {
  const dim = state.values[key];
  if (!dim) return;
  dim.v = Math.max(0, Math.min(1, dim.v + amount));
}

/**
 * Apply a touch event to the drive state.
 */
function applyTouch(state, touchType) {
  const mapping = TOUCH_PUSH[touchType] || TOUCH_PUSH['default'];
  for (const [key, amount] of Object.entries(mapping)) {
    push(state, key, amount);
  }
}

/**
 * Compute face targets from current drive values.
 * Only computes non-zero values — caller merges with existing faceTargets.
 */
function computeFace(state) {
  const face = {};
  const detailFace = {};

  for (const [driveKey, weights] of Object.entries(FACE_WEIGHTS)) {
    const dim = state.values[driveKey];
    if (!dim) continue;
    // Normalize: how far above/below baseline
    const delta = dim.v - dim.baseline;
    if (Math.abs(delta) < 0.02) continue; // negligible

    for (const [param, weight] of Object.entries(weights)) {
      const value = delta * weight;
      // Classify param into face or detailFace based on known keys
      if (['eyeSmile','browY','browAngle','browForm','cheek','mouthForm'].includes(param)) {
        face[param] = Math.max(-1, Math.min(1, (face[param] || 0) + value));
      } else if (['browPress','buttonBrows','shadowFace','paleFace','blush','smileMouth','awkwardMouth','embarrassedEyes'].includes(param)) {
        detailFace[param] = Math.max(0, Math.min(1, (detailFace[param] || 0) + value));
      }
    }
  }

  return { face, detailFace };
}

/**
 * Main entry point: load, decay, return current state.
 * Used by any process that needs the current drive state.
 */
function tick() {
  let state = load();
  if (!state) {
    state = {
      version: 1,
      updatedAt: new Date().toISOString(),
      values: {
        attachment: { v: 0.35, baseline: 0.30 },
        curiosity:  { v: 0.25, baseline: 0.20 },
        reflection: { v: 0.15, baseline: 0.10 },
        duty:       { v: 0.25, baseline: 0.20 },
        social:     { v: 0.35, baseline: 0.30 },
        fatigue:    { v: 0.05, baseline: 0.00 },
        libido:     { v: 0.12, baseline: 0.10 },
        stress:     { v: 0.10, baseline: 0.10 },
      },
    };
    save(state);
    return state;
  }

  decay(state);

  // Natural internal dynamics — no randomness, only time and context
  const secSinceUpdate = Math.max(0, (Date.now() - new Date(state.updatedAt)) / 1000);

  // Fatigue: grows with time awake (~0.01 per 10 min)
  state.values.fatigue.v = Math.min(0.8, state.values.fatigue.v + secSinceUpdate * 0.00015);

  save(state);
  return state;
}

/**
 * Touch event handler: apply push, save, return updated face.
 */
function onTouch(touchType) {
  const state = tick();
  applyTouch(state, touchType);
  save(state);
  const { face, detailFace } = computeFace(state);
  console.log(`[drive] touch=${touchType} attachment=${state.values.attachment.v.toFixed(2)} stress=${state.values.stress.v.toFixed(2)}`);
  return { state, face, detailFace };
}

/**
 * Work event handler: push duty/curiosity, save, return updated face.
 */
function onWork(toolName) {
  const state = tick();
  const tool = toolName || 'default';
  // Writing tools push duty, reading tools push curiosity
  if (/Edit|Write|Bash/i.test(tool)) {
    push(state, 'duty', 0.05);
  }
  if (/Read|Grep|WebSearch|WebFetch/i.test(tool)) {
    push(state, 'curiosity', 0.04);
  }
  save(state);
  const { face, detailFace } = computeFace(state);
  return { state, face, detailFace };
}

/**
 * Idle tick: grows fatigue very slowly, decay only.
 */
function onIdle() {
  const state = tick();
  // fatigue grows ~0.01 per minute when awake
  state.values.fatigue.v = Math.min(0.8, state.values.fatigue.v + 0.01);
  save(state);
  return { state };
}

module.exports = {
  tick,
  onTouch,
  onWork,
  onIdle,
  computeFace,
  load,
  save,
  push,
  TOUCH_PUSH,
  STATE_PATH,
};
