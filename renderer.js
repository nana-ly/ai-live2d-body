(async () => {
  const { Application } = window.PIXI;
  const { Live2DModel } = window.PIXI.live2d;
  const { Spring1D } = window.PetSpring;
  const { BlinkStateMachine } = window.PetBlink;
  const { IdleStateMachine } = window.PetIdle;
  const { Choreographer } = window.PetChoreographer;
  const { ParameterPipeline } = window.PetPipeline;
  const {
    expressionByEmotion,
    faceByEmotion,
    detailFaceByEmotion,
    workPropByTool
  } = window.PetEmotionMap;

  const app = new Application({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true
  });

  document.body.appendChild(app.view);

  const model = await Live2DModel.from('TUGUN-001/tugun-001.model3.json', {
    autoUpdate: false
  });

  model.internalModel.eyeBlink = null;
  model.internalModel.focusController?.target?.(0, 0);

  model.anchor.set(0.5, 0.5);

  const frameUpperBody = () => {
    const baseWidth = 350;
    const baseScale = 0.18;
    const responsiveScale = baseScale * (app.screen.width / baseWidth);
    model.scale.set(Math.min(0.42, Math.max(0.1, responsiveScale)));
    model.x = app.screen.width / 2;
    model.y = app.screen.height * 0.95;
  };

  frameUpperBody();
  app.stage.addChild(model);
  window.addEventListener('resize', frameUpperBody);
  model.motion('idle', 0);

  const bubble = document.getElementById('bubble');
  const bubbleLabel = bubble.querySelector('.bubble-label');
  const bubbleText = bubble.querySelector('.bubble-text');
  const historyBtn = document.getElementById('historyBtn');
  const historyPanel = document.getElementById('historyPanel');
  const signature = document.getElementById('signature');
  const signatureText = signature.querySelector('.signature-text');
  const contextMenu = document.getElementById('contextMenu');
  const chatForm = document.getElementById('chatForm');
  const drivePanel = document.getElementById('drivePanel');
  const DRIVE_LABELS = {
    attachment: 'attach', curiosity: 'curio', reflection: 'refl',
    duty: 'duty', social: 'social', fatigue: 'fatigue',
    libido: 'libido', stress: 'stress'
  };
  const DRIVE_ORDER = ['attachment','curiosity','reflection','duty','social','fatigue','libido','stress'];
  // Clean start: don't carry over props (dog paw/glasses/hair) from previous sessions
  localStorage.removeItem('pet.persistentParams');
  const persistentParams = {};
  const faceTargets = {};
  const faceValues = {};
  const aiMode = await window.petAI.getMode();

  const chatToggle = document.getElementById('chatToggle');

  // body-only 模式下默认隐藏输入框，但保留切换按钮
  let chatFormVisible = localStorage.getItem('pet.chatFormVisible') !== '0';
  if (aiMode.bodyOnly && localStorage.getItem('pet.chatFormVisible') === null) {
    chatFormVisible = false;  // 首次启动默认隐藏
  }
  chatForm.classList.toggle('is-hidden', !chatFormVisible);
  chatToggle.textContent = chatFormVisible ? '−' : '+';
  chatToggle.title = chatFormVisible ? 'Hide chat' : 'Show chat';

  chatToggle.addEventListener('click', () => {
    chatFormVisible = !chatFormVisible;
    chatForm.classList.toggle('is-hidden', !chatFormVisible);
    chatToggle.textContent = chatFormVisible ? '−' : '+';
    chatToggle.title = chatFormVisible ? 'Hide chat' : 'Show chat';
    localStorage.setItem('pet.chatFormVisible', chatFormVisible ? '1' : '0');
  });

  // Live2D loaded - reveal UI now to avoid flash before model appears
  chatForm.classList.add('is-ready');
  chatToggle.classList.add('is-ready');

  let lastPetSpeakAt = 0;
  let speakPendingEmotion = null;
  let signatureFadeTimer = null;

  const chatMessages = [];
  const MAX_CHAT_MSGS = 40;
  let historyOpen = false;

  historyBtn.addEventListener('click', () => {
    historyOpen = !historyOpen;
    historyPanel.classList.toggle('is-open', historyOpen);
    historyBtn.textContent = historyOpen ? '✕' : '⋯';
    if (historyOpen) {
      rebuildHistoryPanel();
    }
  });

  const rebuildHistoryPanel = () => {
    historyPanel.innerHTML = '';
    chatMessages.forEach((m) => {
      const el = document.createElement('div');
      el.className = 'chat-msg';
      if (m.role === 'user') el.classList.add('is-user');

      const label = document.createElement('span');
      label.className = 'chat-msg-label';
      label.textContent = m.role === 'user' ? 'Lily' : 'Leo';

      const txt = document.createElement('span');
      txt.className = 'chat-msg-text';
      txt.textContent = m.text;

      const tm = document.createElement('span');
      tm.className = 'chat-msg-time';
      tm.textContent = m.timeStr;

      el.appendChild(label);
      el.appendChild(txt);
      el.appendChild(tm);
      historyPanel.appendChild(el);
    });
    historyPanel.scrollTop = historyPanel.scrollHeight;
  };

  const addChatMessage = (text, options = {}) => {
    const role = options.role || 'assistant';
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const last = chatMessages[chatMessages.length - 1];
    if (last && last.text === text && last.role === role && now - last.time < 3000) return;

    const msg = { text, role, time: now, timeStr };
    chatMessages.push(msg);
    if (chatMessages.length > MAX_CHAT_MSGS) chatMessages.shift();

    bubbleLabel.textContent = role === 'user' ? 'Lily' : 'Leo';
    bubble.classList.toggle('is-user', role === 'user');
    bubble.classList.remove('is-loading');
    bubble.classList.add('is-visible');
    bubbleText.textContent = text;

    historyBtn.classList.toggle('has-msgs', chatMessages.length > 1);
    if (historyOpen) rebuildHistoryPanel();
  }

  const setSignature = (text) => {
    if (signatureFadeTimer) clearTimeout(signatureFadeTimer);
    signatureText.textContent = text ? `… ${text}` : '';
    signature.classList.toggle('is-visible', Boolean(text));
    if (text) {
      signatureFadeTimer = setTimeout(() => {
        signature.classList.remove('is-visible');
      }, 15000);
    }
  };

  const savePersistentParams = () => {
    localStorage.setItem('pet.persistentParams', JSON.stringify(persistentParams));
  };

  const applyPersistentParams = (coreModel) => {
    Object.entries(persistentParams).forEach(([id, value]) => {
      coreModel.setParameterValueById(id, value);
    });
  };

  // Face expressions: 互斥，只换表情不覆盖 props
  // Props (眼镜/狗耳/发型) 走 persistentParams，不受影响
  const setExpression = async (id) => {
    if (lipSyncActive || speakBusy) return;
    if (id !== '') {
      await model.expression(Number(id));
    } else {
      await model.expression();
    }
    contextMenu.classList.remove('is-open');
  };

  const clearObject = (object) => {
    Object.keys(object).forEach((key) => delete object[key]);
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

  const setFaceTarget = (face = {}) => {
    const map = {
      mouthForm: ['ParamMouthForm', -1, 1],
      mouthOpen: ['ParamMouthOpenY', 0, 1],
      eyeSmile: [['ParamEyeLSmile', 'ParamEyeRSmile'], 0, 1],
      browY: [['ParamBrowLY', 'ParamBrowRY'], -1, 1],
      browAngle: [['ParamBrowLAngle', 'ParamBrowRAngle'], -1, 1],
      browForm: [['ParamBrowLForm', 'ParamBrowRForm'], -1, 1],
      cheek: ['ParamCheek', 0, 1]
    };

    Object.entries(map).forEach(([key, config]) => {
      if (face[key] === undefined) return;
      const [ids, min, max] = config;
      const value = clamp(face[key], min, max);
      (Array.isArray(ids) ? ids : [ids]).forEach((id) => { faceTargets[id] = value; });
    });
  };

  const setDetailFaceTarget = (detailFace = {}) => {
    const map = {
      buttonBrows: [['Param31', 'Param32'], 0, 1],
      browPress: [['Param20', 'Param21'], -1, 1],
      eyeCurveL: ['Param22', -1, 1],
      eyeCurveR: ['Param23', -1, 1],
      smileMouth: ['Param28', 0, 1],
      awkwardMouth: ['Param34', 0, 1],
      cryMouth: ['Param27', 0, 1],
      embarrassedEyes: ['Param36', 0, 1.5],
      tears: ['Param35', 0, 1],
      blush: ['Param25', 0, 1],
      sweat: ['Param30', 0, 1],
      shadowFace: ['Param33', 0, 1],
      paleFace: ['Param29', 0, 1],
      highlightOff: ['Param26', 0, 1],
      eyeGlow: ['Param38', 0, 1]
    };

    Object.entries(map).forEach(([key, config]) => {
      if (detailFace[key] === undefined) return;
      const [ids, min, max] = config;
      const value = clamp(detailFace[key], min, max);
      (Array.isArray(ids) ? ids : [ids]).forEach((id) => { faceTargets[id] = value; });
    });
  };

  const resetFaceTarget = () => {
    [
      'ParamMouthForm', 'ParamMouthOpenY', 'ParamEyeLSmile', 'ParamEyeRSmile',
      'ParamBrowLY', 'ParamBrowRY', 'ParamBrowLAngle', 'ParamBrowRAngle',
      'ParamBrowLForm', 'ParamBrowRForm', 'ParamCheek',
      'Param31', 'Param32', 'Param20', 'Param21', 'Param22', 'Param23',
      'Param28', 'Param34', 'Param27', 'Param36', 'Param35', 'Param25',
      'Param30', 'Param33', 'Param29', 'Param26', 'Param38'
    ].forEach((id) => { faceTargets[id] = 0; });
  };

  const toggleParam = (id) => {
    if (lipSyncActive || speakBusy) return;
    persistentParams[id] = persistentParams[id] ? 0 : 1;
    savePersistentParams();
    contextMenu.classList.remove('is-open');
  };

  const setParamGroup = (onIds, offIds = '') => {
    onIds.split(',').filter(Boolean).forEach((id) => { persistentParams[id] = 1; });
    offIds.split(',').filter(Boolean).forEach((id) => { persistentParams[id] = 0; });
    savePersistentParams();
    contextMenu.classList.remove('is-open');
  };

  const actionParams = {};
  let activeActionKey = '';
  let workState = { active: false, tool: 'default' };
  let workPropOverride = {};

  const updateActionButtons = () => {
    document.querySelectorAll('[data-action-param], [data-motion]').forEach((button) => {
      const key = button.dataset.actionParam
        ? `param:${button.dataset.actionParam}`
        : `motion:${button.dataset.motion}`;
      button.classList.toggle('is-active', key === activeActionKey);
      button.disabled = false;
    });
  };

  const resetActionState = () => {
    clearObject(actionParams);
    activeActionKey = '';
    model.motion('idle', 0);
    updateActionButtons();
  };

  const resetAll = () => {
    if (lipSyncActive || speakBusy) return;
    model.internalModel.motionManager.expressionManager?.resetExpression();
    model.motion('idle', 0);
    clearObject(persistentParams);
    clearObject(actionParams);
    clearObject(workPropOverride);
    activeActionKey = '';
    workState = { active: false, tool: 'default' };
    resetFaceTarget();
    savePersistentParams();
    updateActionButtons();
    contextMenu.classList.remove('is-open');
  };

  const triggerActionParam = (ids, options = {}) => {
    if (lipSyncActive || speakBusy) return;
    const key = `param:${ids}`;
    const source = options.source || 'manual';
    const isSameAction = activeActionKey === key;

    clearObject(actionParams);
    clearObject(workPropOverride);
    model.motion('idle', 0);
    activeActionKey = '';

    if (!isSameAction) {
      ids.split(',').filter(Boolean).forEach((id) => { actionParams[id] = 1; });
      activeActionKey = key;
    }

    updateActionButtons();
    contextMenu.classList.remove('is-open');
    return true;
  };

  const playMotion = (name, options = {}) => {
    if (lipSyncActive || speakBusy) return;
    const key = `motion:${name}`;
    const source = options.source || 'manual';
    const isSameAction = activeActionKey === key;
    if (source === 'ai' && isSameAction) return false;

    clearObject(actionParams);
    activeActionKey = '';

    if (!(source === 'manual' && isSameAction) && name === 'special') {
      model.motion('special', 0);
      activeActionKey = key;
    } else {
      model.motion('idle', 0);
    }

    updateActionButtons();
    contextMenu.classList.remove('is-open');
    return true;
  };

  let lastAppliedEmotion = '';
  let emotionResetTimer = null;
  const EMOTION_RESET_MS = 8000; // 非中性表情 8s 后自动回到默认

  const applyEmotion = async (emotion) => {
    // speaking: block / store pending for later
    if (lipSyncActive || speakBusy) return;
    const key = String(emotion || 'neutral');
    if (key === lastAppliedEmotion) return;
    lastAppliedEmotion = key;

    // Write face params synchronously — mergeFace picks them up within 300ms
    const fe = faceByEmotion[key] || faceByEmotion.neutral;
    const de = detailFaceByEmotion[key] || {};
    for (const k of Object.keys(emotionFace)) delete emotionFace[k];
    for (const k of Object.keys(emotionDetail)) delete emotionDetail[k];
    Object.assign(emotionFace, fe);
    Object.assign(emotionDetail, de);
    faceMergeTarget = (key === 'neutral' || key === 'thinking') ? 0 : 1;

    // No auto-reset — Leo controls when expressions change now
  };
  let lastWorkKey = '';
  const applyWorkState = (work) => {
    if (lipSyncActive || speakBusy) return;
    const active = Boolean(work?.active);
    const tool = String(work?.tool || 'default');
    const workKey = active + ':' + tool;

    if (workKey === lastWorkKey) return;
    lastWorkKey = workKey;

    workState = { active, tool };

    // Phase 4: work state is informational only — track active/idle, never touch props.
    // Props (hair, glasses, dog ears) are Leo's domain via MCP pet_act.
  };

  const applyMotion = (motion) => {
    if (lipSyncActive || speakBusy) return;
    if (motion === 'special') playMotion('special', { source: 'ai' });
    else if (motion === 'idle') resetActionState();
  };

  // TTS queue: single-file, no overlapping audio
  let currentAudio = null;
  let speakBusy = false;
  let activePhonemeTimers = [];
  let currentPhoneme = 0;

  const speakWithTts = async (text) => {
    if (!text || speakBusy) return;
    speakBusy = true;

    // Kill old audio and phoneme timers
    if (currentAudio) { try { currentAudio.pause(); } catch {} currentAudio = null; }
    activePhonemeTimers.forEach(t => clearTimeout(t));
    activePhonemeTimers.length = 0;
    currentPhoneme = 0;

    const myId = ++lipSyncId;
    lipSyncActive = true;
    lipSyncLevel = 0;
    lipSyncForm = 0;

    const cleanup = () => {
      // Error path only — phoneme chain handles its own shutdown on success
      activePhonemeTimers.forEach(t => clearTimeout(t));
      activePhonemeTimers.length = 0;
      lipSyncActive = false;
      lipSyncLevel = 0;
      lipSyncForm = 0;
      speakBusy = false;
    };

    const startPhonemeLoop = (phonemes, audio, myId) => {
      let lastIdx = -1;
      let closingAt = 0;
      const tick = () => {
        if (lipSyncId !== myId) return;
        // Clock source: audio.currentTime while playing, wall-clock drift after ended
        let t = audio.currentTime * 1000;
        if (audio.ended) {
          if (!closingAt) closingAt = Date.now();
          // Continue scanning from where we left off using real elapsed time,
          // so phonemes whose timestamps exceed audio.duration still get reached
          const anchorT = lastIdx >= 0 ? phonemes[lastIdx].t : 0;
          t = anchorT + (Date.now() - closingAt);
        }
        // Linear scan through phonemes
        let idx = lastIdx;
        for (let i = lastIdx + 1; i < phonemes.length; i++) {
          if (phonemes[i].t <= t) idx = i;
          else break;
        }
        if (idx !== lastIdx && idx >= 0) {
          const p = phonemes[idx];
          lipSyncLevel = p.oy || 0.3;
          lipSyncForm = p.of || 0;
          lastIdx = idx;
        }
        // After reaching last phoneme: close mouth after 150ms, shut down after 300ms
        if (lastIdx >= phonemes.length - 1 && closingAt) {
          const elapsed = Date.now() - closingAt;
          if (elapsed >= 400) {
            lipSyncActive = false;
            speakBusy = false;
            currentAudio = null;
            if (speakPendingEmotion) {
              const p = speakPendingEmotion;
              speakPendingEmotion = null;
              emotionLocked = false;
              applyEmotion(p);
            }
            return;
          }
          if (elapsed >= 200) {
            lipSyncLevel = 0;
            lipSyncForm = 0;
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000); // 30s for slow TTS
      const response = await fetch('http://127.0.0.1:39171/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!response.ok) { cleanup(); return; }

      const ct = response.headers.get('Content-Type') || '';
      if (ct.includes('application/json')) {
        const payload = await response.json();
        const byteChars = atob(payload.wav);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        if (payload.phonemes && payload.phonemes.length > 0) {
          startPhonemeLoop(payload.phonemes, audio, myId);
        }
        currentAudio = audio;
        audio.play();
        await new Promise(r => { audio.onended = r; audio.onerror = r; });
        // rAF tick handles mouth close, speakBusy, pending emotion on audio.ended
        URL.revokeObjectURL(url);
      } else {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const pulse = setInterval(() => { if (!lipSyncActive) return; lipSyncLevel = 0.45 + Math.random() * 0.45; }, 100);
        currentAudio = audio;
        audio.play();
        await new Promise(r => { audio.onended = r; audio.onerror = r; });
        clearInterval(pulse);
        lipSyncLevel = 0;
        lipSyncForm = 0;
        setTimeout(() => { lipSyncActive = false; }, 80);
        speakBusy = false;
        currentAudio = null;
        if (speakPendingEmotion) {
          const p = speakPendingEmotion;
          speakPendingEmotion = null;
          emotionLocked = false;
          applyEmotion(p);
        }
        URL.revokeObjectURL(url);
      }
    } catch (e) { console.log('[tts] speak error:', e.message); cleanup(); speakBusy = false; }
  };

  window.petControls = {
    setExpression,
    toggleParam,
    setParamGroup,
    triggerActionParam,
    playMotion,
    resetAll,
    addChatMessage,
    setFaceTarget,
    setDetailFaceTarget
  };

  // Drive panel builder — called when driveState payload arrives
  const DRIVE_COLORS = {
    attachment: '#f4a0b0',  // pink — warmth
    curiosity:   '#a0d2f4',  // sky blue — wonder
    reflection:  '#c4b0e8',  // lavender — thought
    duty:        '#f4c070',  // amber — responsibility
    social:      '#7ec8a0',  // mint — connection
    fatigue:     '#b0a0c8',  // violet — tired
    libido:      '#f0a0a0',  // rose — instinct
    stress:      '#f08080',  // coral red — tension
  };
  const updateDrivePanel = (state) => {
    if (!drivePanel) return;
    let html = '<div class="dp-title">drives</div>';
    for (const key of DRIVE_ORDER) {
      const d = state[key];
      if (!d) continue;
      const pct = Math.round(d.v * 100);
      const color = DRIVE_COLORS[key] || 'rgba(246,247,251,0.35)';
      html += `<div class="drive-row">
        <span class="drive-label">${DRIVE_LABELS[key] || key}</span>
        <span class="drive-bar"><span class="drive-bar-fill" style="width:${pct}%;background:${color}"></span></span>
        <span class="drive-val">${d.v.toFixed(2)}</span>
      </div>`;
    }
    drivePanel.innerHTML = html;
  };

  window.petExternal.onControl((payload) => {
    if (payload.driveState) {
      updateDrivePanel(payload.driveState);
      return; // drive-only push, don't process as speech/emotion/work
    }
    if (payload.bubble?.text) {
      // pet_speak 后 10 秒内，transcript watcher 的气泡不覆盖
      const sinceSpeak = Date.now() - (lastPetSpeakAt || 0);
      if (sinceSpeak < 10000) return;

      addChatMessage(payload.bubble.text, {
        role: payload.bubble.role || 'assistant'
      });
    }

    const isSpeaking = typeof payload.text === 'string' && payload.text && payload.speak;

    // Apply emotion BEFORE speakWithTts (which sets speakBusy=true blocking applyEmotion)
    if (payload.emotion && isSpeaking) {
      applyEmotion(payload.emotion);
    }

    if (isSpeaking) {
      lastPetSpeakAt = Date.now();
      addChatMessage(payload.text, {
        role: payload.role || 'assistant'
      });
      if (payload.tts !== false) {
        speakWithTts(payload.text).catch(console.error);
      }
    }

    if (payload.signature !== undefined) {
      setSignature(String(payload.signature || ''));
    }

    if (payload.work) {
      applyWorkState(payload.work);
    }

    // Non-speaking emotion: only from MCP (pet_act), hook emotion dropped
    if (payload.emotion && !isSpeaking) {
      const fromMcp = payload.source === 'mcp';
      if (fromMcp && !lipSyncActive && !speakBusy) {
        applyEmotion(payload.emotion);
      }
    }

  // Route face to the correct buffer — drive→driveFace, everything else→emotionFace
    // mergeFace will blend them and apply with correct parameter IDs
    if (payload.face) {
      if (payload.source === 'drive') {
        Object.assign(driveFace, payload.face);
      } else {
        Object.assign(emotionFace, payload.face);
      }
    }
    if (payload.detailFace) {
      if (payload.source === 'drive') {
        Object.assign(driveDetail, payload.detailFace);
      } else {
        Object.assign(emotionDetail, payload.detailFace);
      }
    }
    if (payload.reset) resetAll();
    // expression blocked — only pet_speak applyEmotion can use expression presets

    // Props / motion / action params: MCP only (pet_act). Hooks blocked even in idle.
    if (payload.source === 'mcp') {
      if (!lipSyncActive && !speakBusy) {
        if (payload.motion) {
          if (payload.motion === 'idle' || payload.motion === 'none') resetActionState();
          else playMotion(payload.motion, { source: 'ai' });
        }
        if (payload.actionParam) triggerActionParam(payload.actionParam, { source: 'ai' });
        if (payload.toggleParam) toggleParam(payload.toggleParam);
      }
      if (payload.param && payload.value !== undefined) {
        persistentParams[payload.param] = Number(payload.value);
        savePersistentParams();
      }
    }

    if (payload.choreo) {
      choreographer.play(payload.choreo);
    }
  });

    // Phase 4: merge emotion and drive face targets with smooth interpolation
  const mergeFace = () => {
    // spring toward target — quick engage, slow release
    const spd = faceMergeTarget > faceMergeBlend ? 0.28 : 0.06;
    faceMergeBlend += (faceMergeTarget - faceMergeBlend) * spd;

    const merged = {};
    const allKeys = new Set([...Object.keys(emotionFace), ...Object.keys(driveFace)]);
    for (const k of allKeys) {
      const e = emotionFace[k] || 0;
      const d = driveFace[k] || 0;
      merged[k] = e * faceMergeBlend + d * (1 - faceMergeBlend);
    }
    const mergedDetail = {};
    const allDk = new Set([...Object.keys(emotionDetail), ...Object.keys(driveDetail)]);
    for (const k of allDk) {
      const e = emotionDetail[k] || 0;
      const d = driveDetail[k] || 0;
      mergedDetail[k] = e * faceMergeBlend + d * (1 - faceMergeBlend);
    }

    // Push merged targets through proper mapping functions — they convert
    // logical names (blush/eyeSmile) to Live2D parameter IDs (Param25/ParamEyeLSmile)
    setFaceTarget(merged);
    setDetailFaceTarget(mergedDetail);
  };
  const blink = new BlinkStateMachine();
  const idle = new IdleStateMachine();
  const choreographer = new Choreographer();
  const pipeline = new ParameterPipeline();

  const maxAngle = 20;
  const maxEye = 1;
  const maxLean = 8;
  const maxTilt = 6;

  let targetX = 0;
  let targetY = 0;
  let lastMouseX = 0;
  let bodySway = 0;
  let bodySwayVelocity = 0;
  let lipSyncActive = false;
  let lipSyncLevel = 0;
  let lipSyncForm = 0;
  let lipSyncId = 0;         // 实例 ID，防止旧 timer 杀新嘴
  let gazeSettle = 0;         // 视线缓释：说完话后平滑过渡回鼠标跟踪
  let emotionLocked = false;
  let emotionFace = {};
  let driveFace = {};
  let emotionDetail = {};
  let driveDetail = {};
  let faceMergeBlend = 0;
  let faceMergeTarget = 0;  // pet_speak explicit emotion -> lock, hooks can't override

  // Phase 4 merge timer + init — runs after all vars are declared
  setInterval(mergeFace, 300);
  Object.assign(driveFace, faceByEmotion.neutral);
  Object.assign(emotionFace, faceByEmotion.neutral);

  let dizzySpin = 0;
  let dizzySpinVelocity = 0;

  // 鼠标晃头检测：快速左右摆动 → 触发摇晃
  let wiggleDir = 0;
  let wiggleCount = 0;
  let wiggleWindowStart = 0;

  const springEyeX = new Spring1D(0, 220, 24);
  const springEyeY = new Spring1D(0, 220, 24);
  const springHeadX = new Spring1D(0, 120, 18);
  const springHeadY = new Spring1D(0, 120, 18);
  const springLean = new Spring1D(0, 90, 16);
  const springTilt = new Spring1D(0, 80, 14);

  window.addEventListener('mousemove', (event) => {
    if (isDraggingWindow) return;
    lastMouseMoveAt = Date.now();
    targetX = event.clientX / window.innerWidth - 0.5;
    targetY = (event.clientY / window.innerHeight - 0.5) * -1;

    const bodyZone = event.clientY > window.innerHeight * 0.36 && event.clientY < window.innerHeight * 0.86;
    if (bodyZone) {
      const dx = event.clientX - lastMouseX;
      bodySwayVelocity += Math.max(-0.9, Math.min(0.9, dx * 0.018));
    }

    // 晃头检测：鼠标在头部快速左右摆动 → 摇晃回应
    const headZone = event.clientY < window.innerHeight * 0.42;
    if (headZone) {
      const dx = event.clientX - lastMouseX;
      const dir = dx > 4 ? 1 : dx < -4 ? -1 : 0;
      if (dir !== 0 && dir !== wiggleDir) {
        wiggleDir = dir;
        const now = Date.now();
        if (now - wiggleWindowStart > 900) { wiggleCount = 0; wiggleWindowStart = now; }
        wiggleCount++;
        if (wiggleCount >= 5) {
          wiggleCount = 0;
          wiggleWindowStart = now;
          dizzySpinVelocity += 5;
          emitTouch({ type: 'shake', magnitude: 8 });
        }
      }
    }

    lastMouseX = event.clientX;
  });

  const classifyTouch = (x, y) => {
    const nx = x / window.innerWidth;
    const ny = y / window.innerHeight;
    if (ny < 0.28) return 'head';
    if (ny < 0.42) return nx > 0.34 && nx < 0.66 ? 'face' : 'head';
    if (ny < 0.66) return nx < 0.25 || nx > 0.75 ? 'side' : 'chest';
    if (ny < 0.88) return 'waist';
    return 'default';
  };

  let pointerStart = null;
  let isDraggingWindow = false;
  let lastScreenX = 0;
  let lastScreenY = 0;
  let lastTapAt = 0;

  // 触摸微表情：临时参数增幅，每帧衰减
  const touchReactions = {};
  const TOUCH_REACTION_MAP = {
    face: { blush: 0.25, eyeSmile: 0.2 },
    head: { browY: -0.12, browAngle: -0.1 },
    chest: { blush: 0.3, cheek: 0.15, awkwardMouth: 0.15 },
    waist: { awkwardMouth: 0.25, blush: 0.15 },
    side: { blush: 0.2 }
  };
  const addTouchReaction = (area) => {
    const boost = TOUCH_REACTION_MAP[area] || { blush: 0.1 };
    Object.entries(boost).forEach(([key, value]) => {
      touchReactions[key] = Math.max(touchReactions[key] || 0, value);
    });
  };
  const applyTouchReaction = (coreModel) => {
    const map = {
      cheek: 'ParamCheek',
      blush: 'Param25',
      awkwardMouth: 'Param34',
      smileMouth: 'Param28',
      browY: ['ParamBrowLY', 'ParamBrowRY'],
      browAngle: ['ParamBrowLAngle', 'ParamBrowRAngle'],
      eyeSmile: ['ParamEyeLSmile', 'ParamEyeRSmile']
    };
    Object.entries(touchReactions).forEach(([key, value]) => {
      if (value <= 0.001) { delete touchReactions[key]; return; }
      const ids = map[key];
      if (!ids) return;
      (Array.isArray(ids) ? ids : [ids]).forEach((id) => {
        coreModel.setParameterValueById(id, value);
      });
      touchReactions[key] = value * 0.88;
    });
  };

  let lastMouseMoveAt = Date.now();
  let shakeEnergy = 0;
  let lastShakeAt = 0;

  const emitTouch = (payload) => {
    window.petInput?.touch(payload).catch(console.error);
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.pet-ui, .context-menu, .resize-grip')) return;

    // 点击前鼠标在快速移动（< 120ms）→ 可能是切窗口误触，标记为不允许触摸
    const stillFor = Date.now() - lastMouseMoveAt;
    const allowTouch = stillFor >= 120;

    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      area: classifyTouch(event.clientX, event.clientY),
      t: Date.now(),
      allowTouch
    };
    isDraggingWindow = false;
  };

  const onPointerUp = (event) => {
    if (!pointerStart) return;

    // 如果拖拽了窗口，跳过触摸检测
    if (isDraggingWindow) {
      document.body.classList.remove("is-dragging");
      pointerStart = null;
      isDraggingWindow = false;
      return;
    }

    // 移动中误触（stillFor < 120ms）→ 不是有意触摸，跳过
    if (!pointerStart.allowTouch) {
      pointerStart = null;
      return;
    }

    const elapsed = Date.now() - pointerStart.t;
    const area = pointerStart.area;

    // 检查点击位置是否在模型范围内（几何包围盒），避免空白区域误触
    // 模型位于底部居中 (anchor 0.5,0.5 at screenWidth/2, screenHeight*0.95)
    const isOnModel = (cx, cy) => {
      const nx = cx / window.innerWidth;
      const ny = cy / window.innerHeight;
      // 模型覆盖从顶部 ~20% 到底部，中间 ~85% 宽度的区域
      return ny > 0.18 && nx > 0.06 && nx < 0.94;
    };

    // 点击空白处 → 忽略
    if (!isOnModel(event.clientX, event.clientY)) {
      pointerStart = null;
      return;
    }
    const doTouch = () => {
      emitTouch({ type: 'click', area, x: event.clientX, y: event.clientY });
      bodySwayVelocity += (event.clientX < window.innerWidth / 2 ? 1 : -1) * 0.42;
      addTouchReaction(area);
    };

    // 单击 ≥ 80ms 或长按 → 触摸；极快点击（< 80ms）走双击合并逻辑
    if (elapsed >= 80) {
      doTouch();
    } else {
      const now = Date.now();
      if (lastTapAt && now - lastTapAt < 450) {
        doTouch();
        lastTapAt = 0;
      } else {
        lastTapAt = now;
      }
    }

    pointerStart = null;
  };

  // 左键拖拽 = 移动窗口
  window.addEventListener('pointermove', (event) => {
    if (!pointerStart) return;

    if (!isDraggingWindow) {
      const dx = event.screenX - pointerStart.screenX;
      const dy = event.screenY - pointerStart.screenY;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      isDraggingWindow = true;
      document.body.classList.add("is-dragging");
      lastScreenX = event.screenX;
      lastScreenY = event.screenY;
      return;
    }

    const dx = event.screenX - lastScreenX;
    const dy = event.screenY - lastScreenY;
    lastScreenX = event.screenX;
    lastScreenY = event.screenY;
    window.electronDrag?.move(dx, dy);
  });

  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);

  window.addEventListener('devicemotion', (event) => {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const magnitude = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
    if (magnitude > 18) {
      shakeEnergy += magnitude;
      const now = Date.now();
      if (shakeEnergy > 90 && now - lastShakeAt > 2500) {
        lastShakeAt = now;
        shakeEnergy = 0;
        dizzySpinVelocity += 18;
        emitTouch({ type: 'shake', magnitude });
        blink.forceBlink();
      }
    } else {
      shakeEnergy *= 0.85;
    }
  });

  document.querySelectorAll('[data-expression]').forEach((button) => {
    button.addEventListener('click', () => setExpression(button.dataset.expression));
  });
  document.querySelectorAll('[data-toggle-param]').forEach((button) => {
    button.addEventListener('click', () => toggleParam(button.dataset.toggleParam));
  });
  document.querySelectorAll('[data-toggle-group]').forEach((button) => {
    button.addEventListener('click', () => setParamGroup(button.dataset.on, button.dataset.off));
  });
  document.querySelectorAll('[data-action-param]').forEach((button) => {
    button.addEventListener('click', () => triggerActionParam(button.dataset.actionParam));
  });
  document.querySelectorAll('[data-motion]').forEach((button) => {
    button.addEventListener('click', () => playMotion(button.dataset.motion));
  });
  document.querySelectorAll('[data-reset-all]').forEach((button) => {
    button.addEventListener('click', resetAll);
  });

  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const menuWidth = 132;
    const menuHeight = Math.min(310, window.innerHeight - 20);
    contextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - menuWidth)}px`;
    contextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - menuHeight)}px`;
    contextMenu.classList.add('is-open');
  });

  window.addEventListener('pointerdown', (event) => {
    if (!contextMenu.contains(event.target)) contextMenu.classList.remove('is-open');
  });

  chatForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    // body-only mode — inject message into tmux, Leo replies via MCP
    if (aiMode.bodyOnly) {
      addChatMessage(text, { role: 'user' });
      const result = await window.petInput.sendMessage(text);
      if (!result.ok) {
        console.warn('[chat] tmux inject failed:', result.reason);
      }
      input.value = '';
      return;
    }

    const diskHistory = await window.petMemory.loadChatHistory();
    const history = diskHistory.length
      ? diskHistory
      : JSON.parse(localStorage.getItem('pet.chatHistory') || '[]');
    const userMessage = { role: 'user', text, time: new Date().toISOString() };
    history.push(userMessage);
    localStorage.setItem('pet.chatHistory', JSON.stringify(history.slice(-80)));
    await window.petMemory.saveChatHistory(history);

    addChatMessage(text, { role: 'user' });

    bubble.classList.add('is-loading');
    input.value = '';

    try {
      const aiMessage = await window.petAI.chat(history);
      const assistantMessage = {
        role: 'assistant',
        text: aiMessage.text,
        emotion: aiMessage.emotion,
        motion: aiMessage.motion,
        face: aiMessage.face,
        detailFace: aiMessage.detailFace,
        time: new Date().toISOString()
      };
      const nextHistory = [...history, assistantMessage].slice(-80);
      localStorage.setItem('pet.chatHistory', JSON.stringify(nextHistory));
      await window.petMemory.saveChatHistory(nextHistory);

      bubble.classList.remove('is-loading');
      addChatMessage(aiMessage.text);
      if (aiMessage.emotion) {
        applyEmotion(aiMessage.emotion);
      }
      if (aiMessage.face) setFaceTarget(aiMessage.face);
      if (aiMessage.detailFace) setDetailFaceTarget(aiMessage.detailFace);
      if (aiMessage.motion) applyMotion(aiMessage.motion);
    } catch (error) {
      console.error(error);
      bubble.classList.remove('is-loading');
      addChatMessage('接口没接上。');
    }
  });

  const resizeGrip = document.querySelector('.resize-grip');
  let resizeStart = null;

  resizeGrip.addEventListener('pointerdown', (event) => {
    if (isDraggingWindow) return;
    resizeStart = { x: event.screenX, y: event.screenY };
    resizeGrip.setPointerCapture(event.pointerId);
  });
  resizeGrip.addEventListener('pointermove', (event) => {
    if (!resizeStart || isDraggingWindow) return;
    const deltaWidth = event.screenX - resizeStart.x;
    const deltaHeight = event.screenY - resizeStart.y;
    resizeStart = { x: event.screenX, y: event.screenY };
    window.petWindow.resizeBy(deltaWidth, deltaHeight);
  });
  resizeGrip.addEventListener('pointerup', () => { resizeStart = null; });

  pipeline.register('idle', (ctx) => {
    idle.update(ctx.dtMs);
    blink.setBaseOpen(idle.getBlinkBase());
    blink.update(ctx.dtMs);
    choreographer.update(ctx.dtMs);
  });

  pipeline.register('gaze', (ctx) => {
    const gaze = idle.getGazeOffset();
    const dtSec = ctx.dtMs / 1000;

    // 活机模式（说话时）：视线收敛到中央，不追鼠标
    // 待机模式：正常跟踪鼠标
    // 说完话后缓释 ~0.5s，不突然弹回
    if (lipSyncActive) {
      gazeSettle = Math.min(1, gazeSettle + dtSec * 4);
    } else {
      gazeSettle = Math.max(0, gazeSettle - dtSec * 2);
    }
    const settle = gazeSettle * gazeSettle * (3 - 2 * gazeSettle); // smoothstep
    const effectiveTargetX = (targetX + gaze.x) * (1 - settle) + (gaze.x * 0.15) * settle;
    const effectiveTargetY = (targetY + gaze.y) * (1 - settle) + (gaze.y * 0.15) * settle;

    const eyeX = springEyeX.step(effectiveTargetX, dtSec);
    const eyeY = springEyeY.step(effectiveTargetY, dtSec);
    const headX = springHeadX.step(effectiveTargetX, dtSec);
    const headY = springHeadY.step(idle.getHeadDroop() / maxAngle + effectiveTargetY, dtSec);
    const leanY = springLean.step(effectiveTargetY, dtSec);
    const tiltZ = springTilt.step(effectiveTargetX, dtSec);

    bodySwayVelocity += -bodySway * 0.1;
    bodySwayVelocity *= 0.74;
    bodySway += bodySwayVelocity;
    bodySway *= 0.92;
    bodySway = Math.max(-0.45, Math.min(0.45, bodySway));

    dizzySpinVelocity += -dizzySpin * 0.08;
    dizzySpinVelocity *= 0.92;
    dizzySpin += dizzySpinVelocity;
    dizzySpin *= 0.985;

    ctx.coreModel.setParameterValueById('ParamEyeBallX', eyeX * maxEye + Math.sin(dizzySpin) * 0.15);
    ctx.coreModel.setParameterValueById('ParamEyeBallY', eyeY * maxEye + Math.cos(dizzySpin * 0.8) * 0.1);
    ctx.coreModel.setParameterValueById('ParamAngleX', headX * maxAngle);
    ctx.coreModel.setParameterValueById('ParamAngleY', headY * maxAngle);
    ctx.coreModel.setParameterValueById('ParamAngleZ', -tiltZ * maxTilt + bodySway * 0.65 + Math.sin(dizzySpin) * 4);
    ctx.coreModel.setParameterValueById('ParamBodyAngleX', headX * maxAngle * 0.25 + bodySway * 2.8);
    ctx.coreModel.setParameterValueById('ParamBodyAngleZ', bodySway * 3.6);
    ctx.coreModel.setParameterValueById('ParamBodyAngleY', leanY * maxAngle * 0.18);
    ctx.coreModel.setParameterValueById('ParamBodyUpper', -leanY * maxLean);
  });

  pipeline.register('expression', (ctx) => {
    Object.entries(faceTargets).forEach(([id, target]) => {
      // 说话中不碰嘴的参数，让 lipSync 全权控制
      if (lipSyncActive && (id === 'ParamMouthOpenY' || id === 'ParamMouthForm')) return;
      const current = faceValues[id] || 0;
      const next = current + (target - current) * 0.16;
      faceValues[id] = next;
      ctx.coreModel.setParameterValueById(id, next);
    });
  });

  pipeline.register('touchReaction', (ctx) => {
    applyTouchReaction(ctx.coreModel);
  });

  pipeline.register('choreographer', (ctx) => {
    choreographer.apply(ctx.coreModel);
  });

  pipeline.register('lipSync', (ctx) => {
    if (!lipSyncActive) return;
    const open = clamp(lipSyncLevel, 0, 1);
    const form = clamp(lipSyncForm, -1, 1);
    ctx.coreModel.setParameterValueById('ParamMouthOpenY', open);
    ctx.coreModel.setParameterValueById('ParamMouthForm', form);
  });

  pipeline.register('persistent', (ctx) => {
    applyPersistentParams(ctx.coreModel);
    Object.entries(actionParams).forEach(([id, value]) => {
      ctx.coreModel.setParameterValueById(id, value);
    });
    Object.entries(workPropOverride).forEach(([id, value]) => {
      ctx.coreModel.setParameterValueById(id, value);
    });
  });

  pipeline.register('blink', (ctx) => {
    blink.apply(ctx.coreModel);
  });

  updateActionButtons();

  app.ticker.add(() => {
    const dtMs = Math.min(app.ticker.deltaMS, 100);
    model.update(dtMs);

    const coreModel = model.internalModel.coreModel;
    const ctx = { dtMs, coreModel };

    pipeline.run(ctx);
  });
})();
