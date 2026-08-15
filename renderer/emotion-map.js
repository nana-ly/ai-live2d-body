(function () {
  // TUGUN-001 expressions (12 files, none is a pure smile):
  //   0=bloodstain(prop)  1=cry(face)  2=dogEars_black(prop)  3=dogEars_red(prop)
  //   4=embarrassed(face) 5=glasses(prop)  6=puppy(prop)  7=scorn(face)
  //   8=singing(prop)     9=terrified(face)  10=hair1(prop)  11=hair2(prop)
  // Only 4 face expressions: 1=cry 4=embarrassed 7=scorn 9=terrified
  // Phase 4: NO expression presets — all emotions use pure face params.
  // Expression presets (scorn/embarrassed/terrified) fight with lipSync on mouth params.
  const expressionByEmotion = {
    amused: '',          // pure params: eyeSmile + warm brows
    deadpan: '',         // pure params: flat brows, shadow
    concerned: '',       // pure params: worried brows + cheek flush
    warm: '',            // pure params: blush + eyeSmile + cheek
    thinking: '',
    neutral: '',
    surprise: '',        // pure params: wide eyes + sweat + pale
    shy: ''              // pure params: blush + embarrassed eyes
  };

  const faceByEmotion = {
    neutral:   { eyeSmile: 0,    browY: 0,     browAngle: 0,    browForm: 0,    cheek: 0 },
    amused:    { eyeSmile: 0.35, browY: 0.12,  browAngle: 0.3,  browForm: 0.18, cheek: 0 },
    thinking:  { eyeSmile: 0,    browY: -0.12, browAngle: -0.2,  browForm: 0.15, cheek: 0 },
    concerned: { eyeSmile: 0,    browY: -0.18, browAngle: -0.25, browForm: 0.2,  cheek: 0.15 },
    deadpan:   { eyeSmile: 0,    browY: -0.25, browAngle: -0.05, browForm: -0.2, cheek: 0 },
    warm:      { eyeSmile: 0.55, browY: 0.08,  browAngle: 0.05,  browForm: 0.05, cheek: 0.35 },
    surprise:  { eyeSmile: 0,    browY: 0.45,  browAngle: 0.1,  browForm: 0.3,  cheek: 0 },
    shy:       { eyeSmile: 0.12, browY: 0.05,  browAngle: 0.08,  browForm: 0.08, cheek: 0.2 }
  };

  // No mouth params (smileMouth, awkwardMouth, cryMouth) — lipSync owns the mouth.
  const detailFaceByEmotion = {
    neutral:   {},
    amused:    { buttonBrows: 0.2, browPress: -0.15 },
    thinking:  { buttonBrows: 0.15, browPress: -0.1 },
    concerned: { buttonBrows: 0.25 },
    deadpan:   { buttonBrows: 0.4, browPress: -0.25, shadowFace: 0.2 },
    warm:      { buttonBrows: 0.1, blush: 0.45, browPress: -0.05 },
    surprise:  { buttonBrows: 0.5, browPress: -0.3, eyeCurveL: 0.4, eyeCurveR: 0.4, highlightOff: 0.3, sweat: 0.2 },
    shy:       { buttonBrows: 0.15, blush: 0.4, embarrassedEyes: 0.3 }
  };

  const workPropByTool = {
    Read: { actionParam: '', toggleParam: '' },
    Edit: { actionParam: '', toggleParam: '' },
    Write: { actionParam: '', toggleParam: '' },
    Bash: { actionParam: '', toggleParam: '' },
    Grep: { actionParam: '', toggleParam: '' },
    Shell: { actionParam: '', toggleParam: '' },
    default: { actionParam: '', toggleParam: '' }
  };

  const keywordEmotion = [
    { re: /开心|高兴|哈哈|嘿嘿|amused|happy|lol/i, emotion: 'amused' },
    { re: /难过|伤心|焦虑|害怕|崩溃|哭|sad|anxious|worried/i, emotion: 'concerned' },
    { re: /爱你|喜欢|想你|抱抱|warm|love/i, emotion: 'warm' },
    { re: /生气|愤怒|angry|mad/i, emotion: 'deadpan' },
    { re: /害羞|embarrass/i, emotion: 'concerned' },
    { re: /思考|想想|查|搜索|thinking|debug|code|bug/i, emotion: 'thinking' }
  ];

  function detectEmotionFromText(text) {
    const sample = String(text || '');
    for (const rule of keywordEmotion) {
      if (rule.re.test(sample)) return rule.emotion;
    }
    return 'neutral';
  }

  window.PetEmotionMap = {
    expressionByEmotion,
    faceByEmotion,
    detailFaceByEmotion,
    workPropByTool,
    detectEmotionFromText
  };
})();
