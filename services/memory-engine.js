const fs = require('fs');
const path = require('path');

const DEFAULT_MEMORY_PATH = path.join(
  __dirname,
  '..',
  'data',
  'memory',
  'memory-index.json'
);

const BASE_STABILITY_HOURS = 48;
const LIMITS = {
  pinned: 20,
  highImportance: 15,
  ultimateImportance: 5
};

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function createEmptyIndex() {
  return {
    version: 1,
    updatedAt: nowIso(),
    x_axis: { entries: [] },
    y_axis: { relations: [] },
    z_axis: { factVersions: [] },
    plans: [],
    letters: [],
    self_identity: [],
    diary: [],
    e_axis_data: {}
  };
}

function normalizeIndex(index) {
  const base = createEmptyIndex();
  const source = index && typeof index === 'object' ? index : {};

  return {
    ...base,
    ...source,
    x_axis: { ...base.x_axis, ...(source.x_axis || {}) },
    y_axis: { ...base.y_axis, ...(source.y_axis || {}) },
    z_axis: { ...base.z_axis, ...(source.z_axis || {}) },
    plans: Array.isArray(source.plans) ? source.plans : [],
    letters: Array.isArray(source.letters) ? source.letters : [],
    self_identity: Array.isArray(source.self_identity) ? source.self_identity : [],
    diary: Array.isArray(source.diary) ? source.diary : [],
    e_axis_data: source.e_axis_data && typeof source.e_axis_data === 'object'
      ? source.e_axis_data
      : {}
  };
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readIndex(filePath = DEFAULT_MEMORY_PATH) {
  if (!fs.existsSync(filePath)) return createEmptyIndex();

  const raw = fs.readFileSync(filePath, 'utf8');
  return normalizeIndex(JSON.parse(raw));
}

function writeIndex(index, filePath = DEFAULT_MEMORY_PATH) {
  ensureParent(filePath);
  index.updatedAt = nowIso();
  fs.writeFileSync(filePath, JSON.stringify(index, null, 2), 'utf8');
  return index;
}

function getEntries(index) {
  if (!Array.isArray(index.x_axis.entries)) index.x_axis.entries = [];
  return index.x_axis.entries;
}

function getEntry(index, id) {
  return getEntries(index).find((entry) => entry.id === String(id));
}

function stabilityHours(entry) {
  const importance = clamp(entry.importance ?? 5, 1, 10);
  const arousal = clamp(entry.arousal ?? 0, 0, 1);
  const valence = clamp(entry.valence ?? 0, -1, 1);

  return BASE_STABILITY_HOURS
    * (1 + (importance - 1) * 1.5)
    * (1 + arousal * Math.abs(valence) * 0.5)
    * (1 + Math.abs(valence) * 0.3);
}

function refreshEntry(entry, now = new Date()) {
  if (entry.pinned) {
    entry._decayScore = 1;
    entry.weight = clamp(entry.importance ?? 5, 1, 10) / 10;
    return entry;
  }

  const anchor = new Date(entry.lastRecalled || entry.createdAt || now);
  const elapsedHours = Math.max(0, (now - anchor) / 3600000);
  const rawRecall = Math.exp(
    -elapsedHours * Math.LN2 / stabilityHours(entry)
  );
  const floor = Math.max(
    0.05,
    clamp(entry.importance ?? 5, 1, 10) * 0.01
  );

  entry._decayScore = Math.max(floor, Math.min(1, rawRecall));
  entry.weight = clamp(entry.importance ?? 5, 1, 10) / 10 * entry._decayScore;
  return entry;
}

function refreshIndex(index, now = new Date()) {
  getEntries(index).forEach((entry) => refreshEntry(entry, now));
  return index;
}

function sortMemories(entries) {
  return [...entries].sort((a, b) => {
    if (Boolean(a.resolved) !== Boolean(b.resolved)) return a.resolved ? 1 : -1;
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if ((b.weight || 0) !== (a.weight || 0)) return (b.weight || 0) - (a.weight || 0);
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function enforceCapacity(index, { pinned, importance }) {
  const entries = getEntries(index);
  if (pinned && entries.filter((entry) => entry.pinned).length >= LIMITS.pinned) {
    throw new Error(`pinned memory limit reached (${LIMITS.pinned})`);
  }
  if (importance >= 9 && entries.filter((entry) => entry.importance >= 9).length >= LIMITS.highImportance) {
    throw new Error(`high-importance memory limit reached (${LIMITS.highImportance})`);
  }
  if (importance === 10 && entries.filter((entry) => entry.importance === 10).length >= LIMITS.ultimateImportance) {
    throw new Error(`importance-10 memory limit reached (${LIMITS.ultimateImportance})`);
  }
}

function searchableText(entry) {
  return [
    entry.title,
    entry.summary,
    entry.text,
    entry.feel,
    ...(Array.isArray(entry.tags) ? entry.tags : [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function queryTerms(query) {
  const value = String(query || '').trim().toLowerCase();
  const terms = new Set();

  for (const word of value.match(/[a-z0-9_]+/gi) || []) terms.add(word);
  for (const block of value.match(/[\u3400-\u9fff]+/g) || []) {
    [...block].forEach((char) => terms.add(char));
    for (let i = 0; i < block.length - 1; i += 1) {
      terms.add(block.slice(i, i + 2));
    }
  }

  if (!terms.size && value) terms.add(value);
  return [...terms];
}

function searchEntries(index, query, limit) {
  const terms = queryTerms(query);
  if (!terms.length) return [];

  const scored = getEntries(index)
    .map((entry) => {
      const text = searchableText(entry);
      const exact = text.includes(String(query).trim().toLowerCase()) ? 1 : 0;
      const hits = terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
      const matchScore = exact || hits / terms.length;
      return {
        entry,
        score: matchScore * 0.7 + (entry.weight || 0) * 0.3,
        matchScore
      };
    })
    .filter((item) => item.matchScore > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((item) => ({
    ...item.entry,
    matchScore: Number(item.matchScore.toFixed(3))
  }));
}

function holdMemory(index, input = {}) {
  const text = String(input.text || input.summary || '').trim();
  if (!text) throw new Error('memory text is required');

  const importance = Math.round(clamp(input.importance ?? 5, 1, 10));
  const valence = clamp(input.valence ?? 0, -1, 1);
  const arousal = clamp(input.arousal ?? 0, 0, 1);
  const pinned = Boolean(input.pinned);
  enforceCapacity(index, { pinned, importance });

  const createdAt = nowIso();
  const entry = {
    id: String(input.id || makeId('m')),
    date: createdAt.slice(0, 10),
    title: String(input.title || text.slice(0, 40)),
    summary: String(input.summary || text),
    text,
    tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 12) : [],
    sourceFile: String(input.sourceFile || ''),
    valence,
    arousal,
    importance,
    weight: importance / 10,
    resolved: Boolean(input.resolved),
    pinned,
    lastRecalled: null,
    relations: Array.isArray(input.relations) ? input.relations.map(String) : [],
    feel: String(input.feel || ''),
    createdAt
  };

  refreshEntry(entry);
  getEntries(index).push(entry);
  return entry;
}

function traceMemory(index, id, patch = {}) {
  const entry = getEntry(index, id);
  if (!entry) throw new Error(`memory not found: ${id}`);

  const allowed = [
    'title', 'summary', 'text', 'tags', 'sourceFile', 'valence', 'arousal',
    'importance', 'resolved', 'pinned', 'relations', 'feel'
  ];
  const changes = {};
  allowed.forEach((key) => {
    if (patch[key] !== undefined && JSON.stringify(entry[key]) !== JSON.stringify(patch[key])) {
      changes[key] = { from: entry[key], to: patch[key] };
    }
  });
  if (!Object.keys(changes).length) return entry;

  const nextImportance = patch.importance === undefined
    ? entry.importance
    : Math.round(clamp(patch.importance, 1, 10));
  const nextPinned = patch.pinned === undefined ? entry.pinned : Boolean(patch.pinned);
  const wasPinned = Boolean(entry.pinned);
  const wasHigh = entry.importance >= 9;
  const wasUltimate = entry.importance === 10;

  if ((!wasPinned && nextPinned) || (!wasHigh && nextImportance >= 9) || (!wasUltimate && nextImportance === 10)) {
    enforceCapacity(index, { pinned: !wasPinned && nextPinned, importance: nextImportance });
  }

  index.z_axis.factVersions.push({
    id: makeId('v'),
    entryId: entry.id,
    changedAt: nowIso(),
    reason: String(patch.reason || ''),
    previous: changes
  });

  Object.keys(changes).forEach((key) => {
    entry[key] = patch[key];
  });
  entry.importance = nextImportance;
  entry.pinned = nextPinned;
  refreshEntry(entry);
  return entry;
}

function recallMemory(index, id) {
  const entry = getEntry(index, id);
  if (!entry) throw new Error(`memory not found: ${id}`);
  entry.lastRecalled = nowIso();
  refreshEntry(entry);
  return entry;
}

function breath(index, limit = 5) {
  refreshIndex(index);
  const memories = sortMemories(getEntries(index)).slice(0, Math.max(1, Math.min(20, Number(limit) || 5)));
  const recalledAt = nowIso();
  memories.forEach((entry) => {
    entry.lastRecalled = recalledAt;
    refreshEntry(entry);
  });

  return {
    memories,
    selfIdentity: index.self_identity.slice(-3),
    plans: index.plans.filter((plan) => !plan.done).slice(-5)
  };
}

function search(index, query, limit = 8) {
  refreshIndex(index);
  const results = searchEntries(index, query, Math.max(1, Math.min(20, Number(limit) || 8)));
  const recalledAt = nowIso();
  results.forEach((result) => {
    const entry = getEntry(index, result.id);
    if (entry) {
      entry.lastRecalled = recalledAt;
      refreshEntry(entry);
    }
  });
  return results;
}

function plan(index, action = 'list', input = {}) {
  if (action === 'list') return index.plans.filter((item) => !item.done);

  if (action === 'done') {
    const item = index.plans.find((candidate) => candidate.id === String(input.id));
    if (!item) throw new Error(`plan not found: ${input.id}`);
    item.done = true;
    item.completedAt = nowIso();
    return item;
  }

  if (action !== 'create') throw new Error(`unknown plan action: ${action}`);
  const title = String(input.title || '').trim();
  if (!title) throw new Error('plan title is required');

  const item = {
    id: makeId('p'),
    title,
    summary: String(input.summary || ''),
    importance: Math.round(clamp(input.importance ?? 7, 1, 10)),
    dueAt: input.dueAt ? String(input.dueAt) : null,
    done: false,
    createdAt: nowIso()
  };
  index.plans.push(item);
  return item;
}

function identity(index, text) {
  const value = String(text || '').trim();
  if (!value) throw new Error('identity text is required');
  const item = { id: makeId('i'), text: value, createdAt: nowIso() };
  index.self_identity.push(item);
  return item;
}

function letter(index, action = 'read', input = {}) {
  if (action === 'read') return index.letters;
  if (action !== 'write') throw new Error(`unknown letter action: ${action}`);

  const text = String(input.text || '').trim();
  if (!text) throw new Error('letter text is required');
  const item = {
    id: makeId('l'),
    title: String(input.title || ''),
    to: String(input.to || 'Lily'),
    text,
    createdAt: nowIso()
  };
  index.letters.push(item);
  return item;
}

function createMemoryStore(options = {}) {
  const filePath = options.filePath || DEFAULT_MEMORY_PATH;

  function update(mutator) {
    const index = readIndex(filePath);
    const result = mutator(index);
    writeIndex(index, filePath);
    return result;
  }

  return {
    filePath,
    breath: (limit) => update((index) => breath(index, limit)),
    search: (query, limit) => update((index) => search(index, query, limit)),
    hold: (input) => update((index) => holdMemory(index, input)),
    recall: (id) => update((index) => recallMemory(index, id)),
    trace: (id, patch) => update((index) => traceMemory(index, id, patch)),
    plan: (action, input) => update((index) => plan(index, action, input)),
    identity: (text) => update((index) => identity(index, text)),
    letter: (action, input) => update((index) => letter(index, action, input)),
    summary: (limit = 5) => {
      const index = readIndex(filePath);
      refreshIndex(index);
      const entries = sortMemories(getEntries(index)).slice(0, limit);
      writeIndex(index, filePath);
      return {
        count: getEntries(index).length,
        pinned: getEntries(index).filter((entry) => entry.pinned).length,
        unresolved: getEntries(index).filter((entry) => !entry.resolved).length,
        top: entries
      };
    }
  };
}

module.exports = {
  DEFAULT_MEMORY_PATH,
  LIMITS,
  BASE_STABILITY_HOURS,
  createEmptyIndex,
  normalizeIndex,
  readIndex,
  writeIndex,
  refreshEntry,
  refreshIndex,
  sortMemories,
  searchEntries,
  holdMemory,
  traceMemory,
  recallMemory,
  breath,
  search,
  plan,
  identity,
  letter,
  createMemoryStore
};
