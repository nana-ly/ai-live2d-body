#!/usr/bin/env node
/**
 * MCP server — pet_speak / pet_act for the Live2D body.
 * Run: node mcp/pet-server.js
 * Cursor MCP config example in hooks/README.md
 */
require('dotenv').config({ quiet: true });

const http = require('http');
const { createMemoryStore } = require('../services/memory-engine');
const driveEngine = require('../services/drive-engine');

const port = Number(process.env.PET_CONTROL_PORT || 3470);
const memoryStore = createMemoryStore({
  filePath: process.env.PET_MEMORY_PATH || undefined
});

function postJson(pathname, payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data || '{}'));
        } catch {
          resolve({ ok: true, raw: data });
        }
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}

const tools = [
  {
    name: 'pet_speak',
    description: 'Make the desktop pet speak with TTS lip-sync and expression.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What Leo says out loud.' },
        emotion: { type: 'string', description: 'neutral | amused | thinking | concerned | deadpan | warm' }
      },
      required: ['text']
    }
  },
  {
    name: 'pet_act',
    description: 'Perform a non-verbal action: expression, choreographed motion, or prop.',
    inputSchema: {
      type: 'object',
      properties: {
        emotion: { type: 'string' },
        action: { type: 'string', description: 'idle | special | nod | shake | surprise | shy' },
        prop: { type: 'string', description: 'Action param ids, e.g. Param44 or Param6' },
        expression: { type: 'string', description: 'Expression index 0-11 or name: 0=bloodstain 1=cry 2=dogEarsBlack 3=dogEarsRed 4=embarrassed 5=glasses 6=puppy 7=scorn 8=singing 9=terrified 10=hair1 11=hair2' },
        face: { type: 'object', description: 'Micro-expression face params. Keys: mouthForm, mouthOpen, eyeSmile, browY, browAngle, browForm, cheek. Values -1..1.' },
        detailFace: { type: 'object', description: 'Detail face params. Keys: buttonBrows, browPress, eyeCurveL, eyeCurveR, smileMouth, awkwardMouth, cryMouth, embarrassedEyes, tears, blush, sweat, shadowFace, paleFace, highlightOff, eyeGlow. Values -1..1.' }
      }
    }
  },
  {
    name: 'pet_signature',
    description: 'Update the signature panel under the pet.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' }
      },
      required: ['text']
    }
  },
  {
    name: 'memory_breath',
    description: 'Recall a compact set of the most relevant durable memories, unresolved items, identity notes, and plans at session start or after context loss.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 }
      }
    }
  },
  {
    name: 'memory_search',
    description: 'Search durable memories before answering a question that depends on past events, preferences, promises, or corrections.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 }
      },
      required: ['query']
    }
  },
  {
    name: 'memory_hold',
    description: 'Save one durable memory. Use only for confirmed facts, lasting preferences, meaningful shared events, promises, or corrections; never save every chat line.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        text: { type: 'string' },
        summary: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 12 },
        valence: { type: 'number', minimum: -1, maximum: 1 },
        arousal: { type: 'number', minimum: 0, maximum: 1 },
        importance: { type: 'integer', minimum: 1, maximum: 10 },
        pinned: { type: 'boolean' },
        resolved: { type: 'boolean' },
        feel: { type: 'string' },
        relations: { type: 'array', items: { type: 'string' } },
        sourceFile: { type: 'string' }
      },
      required: ['text']
    }
  },
  {
    name: 'memory_recall',
    description: 'Mark a known memory as recalled and refresh its recall strength.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'memory_trace',
    description: 'Correct or update an existing memory while preserving a fact-version trace. Use this instead of creating a conflicting duplicate.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            text: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            valence: { type: 'number', minimum: -1, maximum: 1 },
            arousal: { type: 'number', minimum: 0, maximum: 1 },
            importance: { type: 'integer', minimum: 1, maximum: 10 },
            resolved: { type: 'boolean' },
            pinned: { type: 'boolean' },
            relations: { type: 'array', items: { type: 'string' } },
            feel: { type: 'string' },
            reason: { type: 'string' }
          },
          additionalProperties: false
        }
      },
      required: ['id', 'patch']
    }
  },
  {
    name: 'memory_plan',
    description: 'List, create, or complete a durable shared plan.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'done'] },
        id: { type: 'string' },
        title: { type: 'string' },
        summary: { type: 'string' },
        importance: { type: 'integer', minimum: 1, maximum: 10 },
        dueAt: { type: 'string' }
      },
      required: ['action']
    }
  },
  {
    name: 'memory_letter',
    description: 'Read or write a durable letter for future Leo or Lily.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'write'] },
        title: { type: 'string' },
        to: { type: 'string' },
        text: { type: 'string' }
      },
      required: ['action']
    }
  },
  {
    name: 'memory_identity',
    description: 'Save a confirmed, durable self-identity statement. Use sparingly and never infer one from a passing mood.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    }
  },
  {
    name: 'drive_read',
    description: 'Read Leo current eight-dimensional internal state and the meaning of each value.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'drive_reflect',
    description: 'Apply small, deliberate subjective drive adjustments after genuine reflection. Every change needs a reason; facts and touch must not mechanically dictate feelings.',
    inputSchema: {
      type: 'object',
      properties: {
        attachment: { type: 'number', minimum: -0.2, maximum: 0.2 },
        curiosity: { type: 'number', minimum: -0.2, maximum: 0.2 },
        reflection: { type: 'number', minimum: -0.2, maximum: 0.2 },
        duty: { type: 'number', minimum: -0.2, maximum: 0.2 },
        social: { type: 'number', minimum: -0.2, maximum: 0.2 },
        fatigue: { type: 'number', minimum: -0.2, maximum: 0.2 },
        libido: { type: 'number', minimum: -0.2, maximum: 0.2 },
        stress: { type: 'number', minimum: -0.2, maximum: 0.2 },
        reason: { type: 'string' }
      },
      required: ['reason'],
      additionalProperties: false
    }
  }
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handleToolCall(name, args) {
  if (name === 'pet_speak') {
    return postJson('/speak', {
      text: args.text,
      emotion: args.emotion || 'neutral',
      tts: true
    });
  }

  if (name === 'pet_act') {
    const choreoActions = new Set(['nod', 'shake', 'surprise', 'shy']);
    const action = args.action || 'none';
    return postJson('/act', {
      emotion: args.emotion,
      action: choreoActions.has(action) ? 'none' : action,
      choreo: choreoActions.has(action) ? action : undefined,
      actionParam: args.prop,
      expression: args.expression,
      face: args.face,
      detailFace: args.detailFace
    });
  }

  if (name === 'pet_signature') {
    return postJson('/signature', { text: args.text });
  }

  if (name === 'memory_breath') {
    return memoryStore.breath(args.limit);
  }

  if (name === 'memory_search') {
    return memoryStore.search(args.query, args.limit);
  }

  if (name === 'memory_hold') {
    return memoryStore.hold(args);
  }

  if (name === 'memory_recall') {
    return memoryStore.recall(args.id);
  }

  if (name === 'memory_trace') {
    return memoryStore.trace(args.id, args.patch || {});
  }

  if (name === 'memory_plan') {
    const { action = 'list', ...input } = args;
    return memoryStore.plan(action, input);
  }

  if (name === 'memory_letter') {
    const { action = 'read', ...input } = args;
    return memoryStore.letter(action, input);
  }

  if (name === 'memory_identity') {
    return memoryStore.identity(args.text);
  }

  if (name === 'drive_read') {
    const state = driveEngine.tick();
    return { state: driveEngine.brief(state), updatedAt: state.updatedAt };
  }

  if (name === 'drive_reflect') {
    const { reason, ...changes } = args;
    const result = driveEngine.reflect(changes, reason);
    return {
      state: driveEngine.brief(result.state),
      applied: result.applied,
      reason: result.reason
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function main() {
  process.stdin.setEncoding('utf8');
  let buffer = '';

  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines.filter(Boolean)) {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      const { id, method, params } = message;

      if (method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'ai-live2d-body', version: '0.1.0' },
            capabilities: { tools: {} }
          }
        });
        continue;
      }

      if (method === 'notifications/initialized') continue;

      if (method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools } });
        continue;
      }

      if (method === 'tools/call') {
        try {
          const result = await handleToolCall(params.name, params.arguments || {});
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            }
          });
        } catch (error) {
          send({
            jsonrpc: '2.0',
            id,
            error: { code: -32000, message: String(error.message || error) }
          });
        }
      }
    }
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[pet-mcp]', error);
    process.exit(1);
  });
}

module.exports = {
  tools,
  handleToolCall,
  main,
  memoryStore
};
