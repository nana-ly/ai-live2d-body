# AI Live2D Body

Leo's Windows Live2D desktop body. Claude Code is the primary brain; Electron,
PixiJS, MCP, HTTP, tmux injection, VOICEVOX, and the renderer form the body and
its senses.

## Runtime boundary

- **Brain:** Claude Code in a persistent WSL/tmux session.
- **Body:** Electron + PixiJS + `pixi-live2d-display`.
- **Active expression:** MCP tools for speech, actions, and durable memory.
- **Passive reflection:** hooks, transcript watching, touch injection, drives,
  and one drive-aware MurMur/pulse scheduler.
- **Legacy fallback:** the embedded OpenAI-compatible client is disabled in the
  default body-only mode.

## Local prerequisites

- Node.js and npm
- Electron dependencies installed with `npm install`
- WSL + tmux + Claude Code
- VOICEVOX installed locally
- A compatible Live2D model at `TUGUN-001/tugun-001.model3.json`
- Optional DeepLX executable at `deeplx_windows_amd64.exe`

Licensed model assets, reference documents, secrets, binaries, and private
runtime memory are intentionally excluded from Git.

## Configuration

Copy `.env.example` to `.env` and adjust machine-local paths and credentials.
The body and MCP bridge currently use loopback port `39271`.

Claude Code loads its project instructions through `CLAUDE.md`, which imports:

- `prompts/personality.md`
- `prompts/conversation-rules.md`
- `prompts/tool-rules.md`

## Start

```powershell
npm run start:all
```

The launcher starts the WSL tmux session, DeepLX when available, and Electron.
VOICEVOX and the TTS bridge currently remain separate:

```powershell
npm run tts
```

## Test

```powershell
npm test
```

The current automated suite covers structured memory persistence, search,
fact-version tracing, plans, letters, identity, and the MCP stdio/tool bridge.

## Important directories

- `mcp/`: Claude Code tools for body control and durable memory
- `services/`: control, drives, MurMur, pulse, transcript, touch, TTS, memory
- `renderer/`: reusable Live2D parameter and motion components
- `prompts/`: personality, conversation, and tool policy
- `hooks/`: Claude Code work-state hooks and tmux setup
- `tests/`: deterministic Node tests

## Current roadmap

1. Seed only confirmed durable memories and verify recall across sessions.
2. Visually validate drive micro-expressions and MurMur behavior in Live2D.
3. Continue splitting the renderer and main-process entrypoints.
4. Add a runtime doctor and improve one-command startup.
