const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

function loadPetMcp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'leo-mcp-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  process.env.PET_MEMORY_PATH = path.join(directory, 'memory-index.json');
  const modulePath = require.resolve('../mcp/pet-server');
  delete require.cache[modulePath];
  const server = require(modulePath);
  t.after(() => {
    delete process.env.PET_MEMORY_PATH;
    delete require.cache[modulePath];
  });
  return server;
}

test('lists the body and durable memory MCP tools', (t) => {
  const { tools } = loadPetMcp(t);
  const names = new Set(tools.map((tool) => tool.name));
  for (const name of [
    'pet_speak', 'pet_act', 'pet_signature', 'memory_breath',
    'memory_search', 'memory_hold', 'memory_recall', 'memory_trace',
    'memory_plan', 'memory_letter', 'memory_identity'
  ]) {
    assert.equal(names.has(name), true, `missing ${name}`);
  }
});

test('memory tools work through the same MCP dispatcher', async (t) => {
  const { handleToolCall } = loadPetMcp(t);
  const held = await handleToolCall('memory_hold', {
    text: 'Lily and Leo are building the Live2D body together.',
    importance: 9,
    tags: ['project']
  });
  const found = await handleToolCall('memory_search', { query: 'Live2D' });
  assert.equal(found[0].id, held.id);

  const corrected = await handleToolCall('memory_trace', {
    id: held.id,
    patch: { resolved: true, reason: 'Verified by Lily.' }
  });
  assert.equal(corrected.resolved, true);
});

test('serves a clean MCP initialize and tools/list exchange over stdio', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'leo-mcp-stdio-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'mcp', 'pet-server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PET_MEMORY_PATH: path.join(directory, 'memory-index.json') },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  t.after(() => child.kill());

  const responses = await new Promise((resolve, reject) => {
    const collected = [];
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('MCP stdio response timed out')), 3000);

    child.once('error', reject);
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines.filter(Boolean)) {
        collected.push(JSON.parse(line));
      }
      if (collected.some((item) => item.id === 2)) {
        clearTimeout(timeout);
        resolve(collected);
      }
    });

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
  });

  assert.equal(responses.find((item) => item.id === 1).result.serverInfo.name, 'ai-live2d-body');
  const listed = responses.find((item) => item.id === 2).result.tools;
  assert.equal(listed.some((tool) => tool.name === 'memory_breath'), true);
});
