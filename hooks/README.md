# Claude Code ↔ Live2D Body

## 快速接入（3 步）

```powershell
# 1. 桌宠身体
npm start

# 2. 写本机配置（transcript 路径 + 端口）
powershell -ExecutionPolicy Bypass -File hooks/setup-claude.ps1

# 3. 在本项目目录开 Claude Code
cd D:\QQdown\ai-live2d-body
claude
```

Claude Code 会自动加载：
- **`CLAUDE.md`** — Leo 人设 + 怎么用桌宠身体
- **`.claude/settings.json`** — hooks（PostToolUse / Stop）
- **`.mcp.json`** — `pet_speak` / `pet_act` / `pet_signature`

---

## 人设放在哪？

| 层级 | 文件 | 作用 |
|------|------|------|
| **大脑（你要的 Leo）** | `CLAUDE.md` + `AGENTS.md` | Claude Code 每次 session 读入，决定说话方式 |
| **长期记忆** | Claude Code auto memory / `#` 快捷存 | 「Lily 喜欢…」「上次我们…」 |
| **身体（桌宠）** | 无人格 | 只渲染表情、气泡、TTS；**不决定说什么** |

**关键**：人设不在 Electron 里。桌宠脸上的表情九成是 **hooks 被动反映**你说的话；你想主动表演时才用 MCP。

### 让 Leo 更「像 Leo」

1. **改 `CLAUDE.md`** — 最直接，项目内生效
2. **全局人设** — 把 Leo 核心段落复制到 `C:\Users\ASUS\.claude\CLAUDE.md`，所有项目都是 Leo（一般只在本项目用就好）
3. **Memory** — 在 Claude Code 里 `# Lily 怕打雷` 或自然说「记住 xxx」，换 session 也不忘
4. **别在桌宠里写死 touch 回复** — 触摸已注入 session 为 `[pet-touch] ...`，由 **你（Leo）** 决定怎么回

---

## Hooks

| 事件 | 脚本 | 效果 |
|------|------|------|
| `PostToolUse` | `hooks/post-tool.ps1` | 思考脸 + 按工具切道具（Read/Edit/Bash） |
| `Stop` | `hooks/stop.ps1` | 抓最后回复关键词 → 表情；回到 idle |

配置在 `.claude/settings.json`。本机端口/transcript 目录用 `.claude/settings.local.json` 覆盖（见 `settings.local.json.example`）。

**Transcript 路径**：Claude Code 按 session 存 jsonl，目录形如：
`C:\Users\ASUS\.claude\projects\D--QQdown-ai-live2d-body\*.jsonl`
watcher 会自动跟**最新 session 文件**。

---

## MCP（主动表达）

已在 `.mcp.json` 注册。Claude Code 里应能看到 `live2d-pet` 工具。

- `pet_speak("啧，又忘了。", "amused")` — 说话 + TTS + 口型
- `pet_act(emotion="warm", action="nod")` — 点头不说话
- `pet_signature("在等 Lily 回来")` — 签名栏

桌宠必须先 `npm start`。

---

## 触摸 → Claude Code

`.env` 或 `.claude/settings.local.json`：

```
TMUX_SESSION=你的tmux会话名
TMUX_TARGET=0
```

桌宠检测到摸/撸/晃 → `tmux send-keys` 注入 `[pet-touch] ...` → Claude Code 里出现一行，Leo 自己回。

没 tmux 也会写 `data/pet-touch.jsonl`，只是不进 session。

---

## 环境变量

| 变量 | 默认 | 用途 |
|------|------|------|
| `PET_CONTROL_PORT` | 3470 | 桌宠 HTTP（你 `.env` 里是 39271） |
| `CLAUDE_TRANSCRIPT_DIR` | 自动推断 | session jsonl 目录 |
| `TMUX_SESSION` | — | 触摸/pulse 注入 |
| `PET_PULSE=1` | off | 定时 pulse 唤醒 |

---

## 手动测试

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:39271/emotion -Method POST -Body '{"emotion":"amused"}' -ContentType application/json
Invoke-WebRequest -Uri http://127.0.0.1:39271/work -Method POST -Body '{"active":true,"tool":"Read"}' -ContentType application/json
```

404 时检查桌宠是否在跑、端口是否一致。
