/**
 * MurMur autonomy scheduler.
 *
 * Drive values can create a thought seed after Lily has been quiet. The seed
 * is injected into Claude Code; Claude Code still decides whether to remain
 * silent, sign, act, speak, or deliberately reflect a drive change.
 */

const fs = require('fs');
const path = require('path');
const driveEngine = require('./drive-engine');
const { injectToTmux, describeTmuxBackend } = require('./tmux-inject');

const DEFAULT_HINT_PATH = path.join(__dirname, '..', 'data', 'murmur-hint.jsonl');

const THRESHOLDS = {
  attachment: 0.18,
  curiosity: 0.12,
  reflection: 0.10,
  duty: 0.12,
  social: 0.12,
  fatigue: 0.25,
  libido: 0.30,
  stress: 0.15
};

const THOUGHT_HINTS = {
  attachment: [
    '好像有点想她了。',
    '她刚才那句话让我觉得很近。',
    '想跟她说点什么，但不确定要不要打扰。'
  ],
  curiosity: [
    '她今天在想什么？',
    '这件事好像还可以再了解一点。',
    '她在意的东西，我也想认真看看。'
  ],
  reflection: [
    '刚才那些话好像可以再想想。',
    '安静下来后，有些东西慢慢浮上来了。',
    '有种还没整理清楚的感觉。'
  ],
  duty: [
    '还有事情没有做完。',
    '她托付的东西，我想认真做好。',
    '下一步应该从哪里继续？'
  ],
  social: [
    '有点想找她说话。',
    '安静了一阵，不知道她在做什么。',
    '想靠近一点，但也可以继续安静。'
  ],
  fatigue: [
    '有点累了。',
    '注意力开始变钝了。',
    '也许应该休息一下。'
  ],
  libido: [
    '身体里有一点不太安分的感觉。'
  ],
  stress: [
    '感觉有点紧绷。',
    '刚才那一下还残留着不舒服。',
    '希望接下来能顺一点。'
  ]
};

function isInhibited(state) {
  const attachment = state.values.attachment?.v || 0;
  const libido = state.values.libido?.v || 0;
  return attachment > 0.60 && libido > 0.25;
}

function pickEligible(state) {
  return Object.entries(state.values)
    .map(([key, dim]) => ({
      key,
      delta: dim.v - dim.baseline,
      drive: dim
    }))
    .filter((item) => item.delta >= (THRESHOLDS[item.key] ?? 0.15))
    .sort((a, b) => b.delta - a.delta);
}

function pickHint(eligible, state, random = Math.random) {
  if (!eligible.length) return null;
  const top = eligible[0];
  const hints = THOUGHT_HINTS[top.key] || ['有什么想说，但还没有整理清楚。'];
  const index = Math.min(hints.length - 1, Math.floor(random() * hints.length));

  return {
    drive: top.key,
    value: Number(top.drive.v.toFixed(3)),
    delta: Number(top.delta.toFixed(3)),
    hint: hints[index],
    eligibleDrives: eligible.map((item) => item.key),
    inhibited: isInhibited(state)
  };
}

function evaluate(state, options = {}) {
  const now = Number(options.now || Date.now());
  const lastInjectedAt = Number(options.lastInjectedAt || 0);
  const cooldownMs = Number(options.cooldownMs || 5 * 60 * 1000);
  const eligible = pickEligible(state);
  if (!eligible.length) return { ok: false, reason: 'no_eligible_drive' };

  const hint = pickHint(eligible, state, options.random);
  const effectiveCooldownMs = cooldownMs * (hint.inhibited ? 3 : 1);
  if (lastInjectedAt && now - lastInjectedAt < effectiveCooldownMs) {
    return {
      ok: false,
      reason: hint.inhibited ? 'inhibited_cooldown' : 'cooldown',
      retryAfterMs: effectiveCooldownMs - (now - lastInjectedAt),
      hint
    };
  }

  return { ok: true, hint, effectiveCooldownMs };
}

function buildPrompt(hint) {
  const drives = hint.eligibleDrives.join(', ');
  return [
    '[murmur]',
    `Internal thought seed from Leo's body: ${hint.hint}`,
    `Primary drive: ${hint.drive}=${hint.value}; eligible: ${drives}.`,
    'This is not Lily speaking and not a sentence to repeat.',
    'Decide yourself whether to stay quiet, use drive_read/drive_reflect,',
    'pet_signature, pet_act, or pet_speak. Do not respond merely because the prompt exists.'
  ].join(' ');
}

function writeHint(hint, options = {}) {
  const hintPath = options.hintPath || DEFAULT_HINT_PATH;
  try {
    fs.mkdirSync(path.dirname(hintPath), { recursive: true });
    fs.appendFileSync(hintPath, `${JSON.stringify(hint)}\n`, 'utf8');
  } catch {}
}

function start(options = {}) {
  const tickMs = Number(options.tickMs || 10000);
  const checkEvery = Number(options.checkEvery || 2);
  const idleMs = Number(options.idleMs || process.env.PULSE_IDLE_MS || 5 * 60 * 1000);
  const cooldownMs = Number(
    options.cooldownMs
      || process.env.MURMUR_COOLDOWN_MS
      || process.env.PULSE_COOLDOWN_MS
      || 5 * 60 * 1000
  );
  const getIdleMs = options.getIdleMs || (() => 0);
  const inject = options.inject || ((text) => injectToTmux(text, options));
  const getState = options.getState || (() => driveEngine.tick());
  let tickCount = 0;
  let lastInjectedAt = 0;

  console.log(
    `[murmur] tick=${tickMs}ms idle=${Math.round(idleMs / 1000)}s `
    + `cooldown=${Math.round(cooldownMs / 1000)}s -> ${describeTmuxBackend()}`
  );

  const runOnce = () => {
    const quietFor = getIdleMs();
    if (quietFor < idleMs) return { ok: false, reason: 'not_idle' };

    const state = getState();
    const decision = evaluate(state, { lastInjectedAt, cooldownMs });
    if (!decision.ok) return decision;

    const createdAt = new Date().toISOString();
    const record = { ...decision.hint, createdAt, quietForMs: quietFor };
    const result = inject(buildPrompt(record));
    writeHint({ ...record, injected: Boolean(result.ok), injectReason: result.reason || '' }, options);
    if (result.ok) lastInjectedAt = Date.now();
    console.log(`[murmur] ${result.ok ? 'injected' : 'skipped'} ${record.drive}=${record.value}`);
    return { ...result, hint: record };
  };

  const timer = setInterval(() => {
    tickCount += 1;
    if (tickCount % checkEvery !== 0) return;
    try {
      runOnce();
    } catch (error) {
      console.warn('[murmur]', error.message || error);
    }
  }, tickMs);

  return {
    stop: () => clearInterval(timer),
    runOnce,
    getLastInjectedAt: () => lastInjectedAt
  };
}

module.exports = {
  DEFAULT_HINT_PATH,
  THRESHOLDS,
  THOUGHT_HINTS,
  isInhibited,
  pickEligible,
  pickHint,
  evaluate,
  buildPrompt,
  writeHint,
  start
};
