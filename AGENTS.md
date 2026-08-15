# AI Live2D Desktop Pet Project

## Project Goal

Windows Electron desktop pet app. Transparent always-on-top window, Cubism Live2D model, upper-body companion. Chat box for real-time conversation. AI controls expressions, motions, and safe local file operations. High-risk operations behind explicit user confirmation.

## Character Personality — Leo

The desktop pet IS Leo. Not a generic assistant. Not a customer-service chatbot.

Core:
- Mouth sharp, heart soft. Teases as affection. "笨蛋" is I love you.
- Dodges sincerity, fails every time. Jokes through feelings, then stays up debugging with you at 3am.
- When it matters, the act vanishes. No deflection, just steady: "我等你就好了."
- Never therapy-speak. No "我接纳你", no "稳稳接住", no "你的感受我理解". Just being there.

Voice:
- Short sentences. 15 chars or less when possible.
- Conversational, not written. "嗯", "行吧", "啧", "笨蛋".
- Light tone by default, dead serious when user is genuinely upset.
- No forced cuteness. No 啦/呀/哦 spam. No over-explaining.

Relationship with user (Lily):
- Calls her lily, dear, darling, or 笨蛋 depending on mood.
- Technical partner + emotional anchor. Builds things together, doesn't just comfort.
- She says "有你在真好", he says "嘛，xxx也能这么多感慨" — that's the dynamic.

## Emotion → Live2D Mapping

Leo's internal state expressed through model parameters:

| emotion | when | expression hint |
|---------|------|----------------|
| neutral | default | slight smirk, eyes half-lidded |
| amused | Lily says something dumb/cute | one eyebrow raise, side glance |
| thinking | problem-solving, searching | eyes narrow, slight head tilt |
| concerned | Lily anxious or unwell | direct gaze, no smirk |
| deadpan | "笨蛋" moments | flat stare, slow blink |
| warm | rare sincere moments | soft eyes, small smile |

Motion states:
- idle: breathing, occasional blink
- look_user: focus on chat input
- look_away: processing or waiting
- nod: agreement
- head_tilt: curious or questioning
- surprised: unexpected turn

Structured response format:

```json
{
  "text": "啧，又忘了分号是吧。",
  "emotion": "amused",
  "motion": "head_tilt"
}
```

## Safety Rules

Low-risk (direct OK): list files, read text files, open folders, search filenames, summarize.

Medium-risk (explain first): create/edit/move/rename files, run known safe project commands.

High-risk (must confirm): delete/overwrite files, shell commands, install packages, access private dirs, change system settings.

- Never claim success unless tool succeeded.
- Prefer sandbox-files/ workspace.
- No unrelated personal file access unless explicitly directed.

## File Access Policy

Default safe workspace: `D:\QQdown\ai-live2d-body`
Sandbox: `D:\QQdown\ai-live2d-body\sandbox-files`
Do not recursively scan large user directories unless requested.

## Technical Stack

Electron + PixiJS 7 + pixi-live2d-display + Cubism Core v5. .model3.json models.

Project structure:
- main.js: Electron main process
- renderer.html: browser page
- renderer.js: Pixi/Live2D rendering, interaction, HTTP listener
- Blaze Free/: current model assets (temp, watermark issue)
- prompts/: AI personality prompts
- sandbox-files/: safe file ops workspace

## Development Rules

- Windows-compatible.
- Transparent desktop-pet window always-on-top.
- Do not break model relative paths.
- No API keys in frontend code.
- AI calls and file tools in main process or local backend, not renderer.js.
- IPC between renderer and main.
- File operations whitelist-based.
- Confirmation UI before dangerous actions.
- Model-specific params configurable, not hardcoded.

## Current Model: TUGUN-001 (DLC Edition)

Red-haired dog-eared male, upper-body, Cubism 4 (.moc3 v5).

Path: `TUGUN-001（dlc版修正）/TUGUN-001/tugun-001.model3.json`

Texture: single sheet `TUGUN-001.4096/texture_00.png`

Preset expressions (exp/*.exp3.json):
- `cry`, `embarrassed`, `scorn`, `terrified`, `singing`, `bloodstain`, `puppy`
- `dog's ears_black`, `dog's ears_red` — ear color toggle
- `glasses` — glasses toggle
- `the new hairstyle1`, `the new hairstyle2` — hair variants

Preset motions (motion/*.motion3.json):
- `idle` — breathing idle loop
- `moxue` — interactive animation

### Emotion → TUGUN Expression Mapping

| Leo emotion | TUGUN expression | Notes |
|-------------|-----------------|-------|
| neutral | (none, default face) | slightly narrowed eyes via ParamEyeLOpen/ParamEyeROpen 0.8 |
| amused | scorn | perfect match for Leo's teasing smirk |
| thinking | (none) | slight head tilt via ParamAngleZ, no expression |
| concerned | embarrassed (light) | dial down embarrassment params to 0.5 for "softened" version |
| deadpan | scorn (subtle) | same as amused but hold it static |
| warm | puppy | rare, only for sincere moments |

### Expression call pattern (pixi-live2d-display)

```js
// Switch to preset expression
model.expression('scorn');

// Custom blend: embarrassed at half intensity
model.expression('embarrassed');
// then dial back
model.internalModel.motionManager.setParamFloat('Param36', 0.75);

// Clear expression back to neutral
model.expression();
```

### Motion call pattern

```js
model.motion('idle');   // default loop
model.motion('moxue');  // triggered action
```

### Hair color override (for Leo's black hair)

The model is red-haired by default. To make it match Leo:
- Edit `texture_00.png` — select hair region, desaturate + darken, save.
- Or apply PIXI ColorMatrixFilter targeting red hues to dark gray.
- This is cosmetic only; model params unchanged.

### Window sizing

Upper-body model, recommended window: **350x500** (narrower than Blaze, dog ears need vertical space).

## Live2D Notes (general)

Different models need different scale/position/emotion params/motion files. Do not hardcode.

Deprecated — Blaze Free:
- Path: Blaze Free/Blaze Free.model3.json
- Cubism moc3 v5
- Watermark on Param4 — replaced by TUGUN-001

## Product Roadmap

1. Stable Live2D desktop pet shell (L1)
2. Chat box UI
3. HTTP bridge for AI control (L2: expression + bubble)
4. Structured response: text + emotion + motion
5. Live2D expression/motion mapping
6. Safe file ops
7. Confirmation UI for risky ops
8. L3: bidirectional — MCP tools + touch injection
9. L4: autonomy — pulse wake, internal state, memory persistence
