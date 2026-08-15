const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function loadDrive(t, initialState) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'leo-drive-'));
  const statePath = path.join(directory, 'drive-state.json');
  if (initialState) fs.writeFileSync(statePath, JSON.stringify(initialState), 'utf8');
  process.env.PET_DRIVE_PATH = statePath;
  process.env.PET_DRIVE_EVENT_PATH = path.join(directory, 'drive-events.jsonl');
  const modulePath = require.resolve('../services/drive-engine');
  delete require.cache[modulePath];
  const drive = require(modulePath);
  t.after(() => {
    delete process.env.PET_DRIVE_PATH;
    delete process.env.PET_DRIVE_EVENT_PATH;
    delete require.cache[modulePath];
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return drive;
}

test('migrates v1 state, preserves attachment, and lets fatigue recover', (t) => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  const drive = loadDrive(t, {
    version: 1,
    updatedAt: new Date(now - 60 * 60 * 1000).toISOString(),
    values: {
      attachment: { v: 0.8, baseline: 0.3 },
      fatigue: { v: 0.8, baseline: 0 }
    }
  });
  const state = drive.tick({ now });
  assert.equal(state.version, 2);
  assert.equal(state.values.attachment.v, 0.8);
  assert.equal(state.values.fatigue.baseline, 0.05);
  assert.ok(Math.abs(state.values.fatigue.v - 0.425) < 0.001);
});

test('touch is perception and only shake gives bounded physical evidence', (t) => {
  const drive = loadDrive(t);
  const before = drive.tick();
  const head = drive.onTouch('head').state;
  assert.equal(head.values.attachment.v, before.values.attachment.v);
  assert.equal(head.values.libido.v, before.values.libido.v);

  const shaken = drive.onTouch('shake').state;
  assert.ok(shaken.values.stress.v > before.values.stress.v);
  assert.ok(shaken.values.stress.v < 0.72);
});

test('repeated work approaches a bounded state instead of adding forever', (t) => {
  const drive = loadDrive(t);
  let result;
  for (let i = 0; i < 50; i += 1) result = drive.onWork('Edit', true);
  assert.ok(result.state.values.duty.v <= 0.58);
  assert.ok(result.state.values.duty.v > 0.5);
  assert.ok(result.state.values.fatigue.v < 0.3);
});

test('subjective reflection needs a reason and records bounded changes', (t) => {
  const drive = loadDrive(t);
  assert.throws(() => drive.reflect({ social: 0.1 }, ''), /reason is required/);
  const result = drive.reflect({ social: 0.9, attachment: -0.05 }, 'A deliberate self-report.');
  assert.equal(result.applied.social.delta, 0.2);
  assert.equal(result.applied.attachment.delta, -0.05);
  assert.equal(fs.existsSync(drive.EVENT_PATH), true);
});

test('drive micro-expressions never use mouth overlay parameters', (t) => {
  const drive = loadDrive(t);
  const state = drive.createState();
  state.values.social.v = 0.8;
  state.values.stress.v = 0.8;
  const result = drive.computeFace(state);
  assert.equal('mouthForm' in result.face, false);
  assert.equal('mouthOpen' in result.face, false);
  assert.equal('smileMouth' in result.detailFace, false);
  assert.equal('awkwardMouth' in result.detailFace, false);
  assert.equal('cryMouth' in result.detailFace, false);
});
