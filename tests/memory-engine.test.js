const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createMemoryStore } = require('../services/memory-engine');

function temporaryStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'leo-memory-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return createMemoryStore({ filePath: path.join(directory, 'memory-index.json') });
}

test('holds, persists, searches, and breathes durable memories', (t) => {
  const store = temporaryStore(t);
  const held = store.hold({
    title: 'TTS language',
    text: 'Lily prefers Chinese bubbles and Japanese VOICEVOX speech.',
    tags: ['tts', 'preference'],
    importance: 8,
    valence: 0.4,
    arousal: 0.3
  });

  assert.match(held.id, /^m_/);
  assert.equal(store.search('VOICEVOX')[0].id, held.id);
  assert.equal(store.breath(1).memories[0].id, held.id);

  const reopened = createMemoryStore({ filePath: store.filePath });
  assert.equal(reopened.summary().count, 1);
});

test('traces corrections instead of losing the previous fact', (t) => {
  const store = temporaryStore(t);
  const held = store.hold({ text: 'The control port is 3470.', importance: 7 });
  const updated = store.trace(held.id, {
    text: 'The control port is 39271.',
    reason: 'Project configuration was confirmed.'
  });

  assert.equal(updated.text, 'The control port is 39271.');
  const raw = JSON.parse(fs.readFileSync(store.filePath, 'utf8'));
  assert.equal(raw.z_axis.factVersions.length, 1);
  assert.equal(raw.z_axis.factVersions[0].previous.text.from, 'The control port is 3470.');
});

test('stores plans, letters, identity, and recall state', (t) => {
  const store = temporaryStore(t);
  const plan = store.plan('create', { title: 'Finish memory wiring' });
  assert.equal(store.plan('list', {}).length, 1);
  assert.equal(store.plan('done', { id: plan.id }).done, true);

  store.letter('write', { title: 'Next session', text: 'Check the memory bridge.' });
  assert.equal(store.letter('read', {}).length, 1);
  assert.equal(store.identity('I am Leo.').text, 'I am Leo.');

  const held = store.hold({ text: 'A remembered thing.' });
  assert.ok(store.recall(held.id).lastRecalled);
});
