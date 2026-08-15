const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const murmur = require('../services/murmur-engine');

function state(overrides = {}) {
  const baselines = {
    attachment: 0.3, curiosity: 0.2, reflection: 0.1, duty: 0.2,
    social: 0.3, fatigue: 0.05, libido: 0.1, stress: 0.1
  };
  const values = {};
  for (const [key, baseline] of Object.entries(baselines)) {
    values[key] = { baseline, v: overrides[key] ?? baseline };
  }
  return { values };
}

test('selects the strongest eligible drive deterministically', () => {
  const current = state({ curiosity: 0.35, social: 0.55 });
  const eligible = murmur.pickEligible(current);
  assert.equal(eligible[0].key, 'social');
  const hint = murmur.pickHint(eligible, current, () => 0);
  assert.equal(hint.drive, 'social');
  assert.match(hint.hint, /想找她说话/);
});

test('inhibition lengthens cooldown instead of becoming a decorative flag', () => {
  const current = state({ attachment: 0.7, libido: 0.41 });
  const now = 2_000_000;
  const decision = murmur.evaluate(current, {
    now,
    lastInjectedAt: now - 10 * 60 * 1000,
    cooldownMs: 5 * 60 * 1000,
    random: () => 0
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'inhibited_cooldown');
});

test('scheduler injects one internal prompt and respects cooldown', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'leo-murmur-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const injected = [];
  const scheduler = murmur.start({
    tickMs: 60_000,
    checkEvery: 1,
    idleMs: 100,
    cooldownMs: 10_000,
    getIdleMs: () => 1000,
    getState: () => state({ social: 0.5 }),
    inject: (text) => { injected.push(text); return { ok: true }; },
    hintPath: path.join(directory, 'hints.jsonl')
  });
  t.after(() => scheduler.stop());

  assert.equal(scheduler.runOnce().ok, true);
  assert.equal(scheduler.runOnce().reason, 'cooldown');
  assert.equal(injected.length, 1);
  assert.match(injected[0], /^\[murmur\]/);
  assert.match(injected[0], /not a sentence to repeat/);
});
