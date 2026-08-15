const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const dataDir = path.join(__dirname, '..', 'data');
const live2dMemoryPath = path.join(dataDir, 'memories', 'live2d-memory.jsonl');
const workspaceRoot = path.join(__dirname, '..');
const sandboxRoot = path.join(__dirname, '..', 'sandbox-files');
const rippleMemoryDir = process.env.RIPPLE_MEMORY_DIR || 'D:\\Ripple\\vault\\memories';
const maxAgentSteps = 6;

function getAiConfig() {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseURL = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || '';
  const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const provider = process.env.AI_PROVIDER || (baseURL ? 'openai-compatible' : 'openai');
  const enableTools = process.env.AI_ENABLE_TOOLS !== '0';
  const responseFormat = process.env.AI_RESPONSE_FORMAT || 'json_object';
  const temperature = process.env.AI_TEMPERATURE === undefined
    ? undefined
    : Number(process.env.AI_TEMPERATURE);

  return {
    apiKey,
    baseURL,
    model,
    provider,
    enableTools,
    responseFormat,
    temperature: Number.isFinite(temperature) ? temperature : undefined
  };
}

const responseFormatPrompt = `
For this desktop pet app, final answers must be only JSON:
{
  "text": "reply to show in the chat bubble",
  "emotion": "neutral | amused | thinking | concerned | deadpan | warm",
  "motion": "idle | special | none",
  "face": { "mouthForm": -1 to 1, "mouthOpen": 0 to 1, "eyeSmile": 0 to 1, "browY": -1 to 1, "browAngle": -1 to 1, "browForm": -1 to 1, "cheek": 0 to 1 },
  "detailFace": {
    "buttonBrows": 0 to 1, "browPress": -1 to 1, "eyeCurveL": -1 to 1, "eyeCurveR": -1 to 1,
    "smileMouth": 0 to 1, "awkwardMouth": 0 to 1, "cryMouth": 0 to 1, "embarrassedEyes": 0 to 1.5,
    "tears": 0 to 1, "blush": 0 to 1, "sweat": 0 to 1, "shadowFace": 0 to 1, "paleFace": 0 to 1,
    "highlightOff": 0 to 1, "eyeGlow": 0 to 1
  }
}
Keep text short and in Leo's voice.
`;

function createEmbeddedBrain(sendLive2DControl) {
  const aiConfig = getAiConfig();
  const aiClient = aiConfig.apiKey
    ? new OpenAI({ apiKey: aiConfig.apiKey, baseURL: aiConfig.baseURL || undefined })
    : null;

  const agentTools = buildAgentTools(sendLive2DControl);

  return {
    aiConfig,
    aiClient,
    agentTools,
    handleChat: (messages) => handleChat(messages, aiClient, aiConfig, agentTools, sendLive2DControl)
  };
}

function buildAgentTools(sendLive2DControl) {
  return [
    {
      type: 'function',
      function: {
        name: 'get_time',
        description: 'Get the current local date and time.',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    {
      type: 'function',
      function: {
        name: 'control_live2d',
        description: 'Control the desktop pet bubble, expression, motion, or face.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            expression: { type: 'number' },
            motion: { type: 'string', enum: ['idle', 'special', 'none'] },
            actionParam: { type: 'string' },
            emotion: { type: 'string' },
            face: { type: 'object' },
            detailFace: { type: 'object' }
          },
          additionalProperties: false
        }
      }
    }
  ];
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function appendJsonLine(filePath, value) {
  ensureDataDir();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function readJsonLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function appendLive2DMemory(value) {
  appendJsonLine(live2dMemoryPath, { createdAt: new Date().toISOString(), ...value });
}

function loadAgentPrompt() {
  const promptDir = path.join(__dirname, '..', 'prompts');
  const promptFiles = [
    'personality.md',
    'conversation-rules.md',
    'tool-rules.md'
  ];

  try {
    const prompt = promptFiles
      .map((fileName) => fs.readFileSync(path.join(promptDir, fileName), 'utf8').trim())
      .filter(Boolean)
      .join('\n\n');

    if (prompt) return prompt;
  } catch {
    // Fall back for older installations that do not have the prompt bundle.
  }

  try {
    return fs.readFileSync(path.join(__dirname, '..', 'AGENTS.md'), 'utf8');
  } catch {
    return 'You are Leo, Lily\'s Live2D desktop pet.';
  }
}

function loadLive2DMemory() {
  return readJsonLines(live2dMemoryPath)
    .filter((entry) => entry?.text && (entry.role === 'user' || entry.role === 'assistant'))
    .slice(-40)
    .map((entry) => `${entry.role}: ${entry.text}`)
    .join('\n')
    .slice(-8000);
}

function toOpenAiMessage(message) {
  return {
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.text || '')
  };
}

async function executeAgentTool(name, args, sendLive2DControl) {
  if (name === 'get_time') {
    return JSON.stringify({ ok: true, time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) });
  }
  if (name === 'control_live2d') {
    return JSON.stringify(sendLive2DControl(args));
  }
  return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
}

function parseAssistantJson(content) {
  const text = String(content || '');
  try {
    return JSON.parse(text || '{}');
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    return { text: text || '嗯？', emotion: 'neutral', motion: 'none', face: {}, detailFace: {} };
  }
}

function buildChatRequest(conversation, aiConfig, options = {}) {
  const request = { model: aiConfig.model, messages: conversation };
  const useTools = options.enableTools ?? aiConfig.enableTools;
  const responseFormat = options.responseFormat ?? aiConfig.responseFormat;
  if (useTools) {
    request.tools = buildAgentTools(() => ({}));
    request.tool_choice = 'auto';
  }
  if (responseFormat !== 'off') request.response_format = { type: responseFormat };
  if (aiConfig.temperature !== undefined) request.temperature = aiConfig.temperature;
  return request;
}

async function runAgentChat(messages, aiClient, aiConfig, agentTools, sendLive2DControl) {
  const conversation = [
    { role: 'system', content: [loadAgentPrompt(), responseFormatPrompt, loadLive2DMemory()].filter(Boolean).join('\n\n') },
    ...messages.slice(-20).map(toOpenAiMessage)
  ];
  let requestOptions = { enableTools: aiConfig.enableTools, responseFormat: aiConfig.responseFormat };

  for (let step = 0; step < maxAgentSteps; step += 1) {
    let completion;
    try {
      completion = await aiClient.chat.completions.create(buildChatRequest(conversation, aiConfig, requestOptions));
    } catch (error) {
      if (!requestOptions.enableTools && requestOptions.responseFormat === 'off') throw error;
      requestOptions = { enableTools: false, responseFormat: 'off' };
      completion = await aiClient.chat.completions.create(buildChatRequest(conversation, aiConfig, requestOptions));
    }

    const message = completion.choices[0]?.message;
    if (!message) throw new Error('No model response');
    conversation.push(message);

    if (!message.tool_calls?.length || !requestOptions.enableTools) {
      return parseAssistantJson(message.content);
    }

    for (const toolCall of message.tool_calls) {
      let result;
      try {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        result = await executeAgentTool(toolCall.function.name, args, sendLive2DControl);
      } catch (error) {
        result = JSON.stringify({ ok: false, error: String(error.message || error) });
      }
      conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
    }
  }

  return { text: '工具绕太久了。', emotion: 'deadpan', motion: 'none', face: {} };
}

async function handleChat(messages, aiClient, aiConfig, agentTools, sendLive2DControl) {
  if (!aiClient) {
    return {
      text: '还没接 API key，笨蛋。',
      emotion: 'deadpan',
      motion: 'none',
      face: { mouthForm: -0.1, browY: -0.2 }
    };
  }

  const parsed = await runAgentChat(Array.isArray(messages) ? messages : [], aiClient, aiConfig, agentTools, sendLive2DControl);
  const reply = {
    text: String(parsed.text || '嗯？'),
    emotion: String(parsed.emotion || 'neutral'),
    motion: String(parsed.motion || 'none'),
    face: parsed.face || {},
    detailFace: parsed.detailFace || {}
  };
  appendLive2DMemory({ source: 'embedded-ai', role: 'assistant', ...reply });
  return reply;
}

module.exports = {
  createEmbeddedBrain,
  getAiConfig
};
