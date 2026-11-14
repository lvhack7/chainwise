import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTool, toolDeclarations } from '../tools.mts';
import { connectXdc, disconnectXdc, xdcConnectionStatus } from '../xdc-ai.mts';

test('XDC wallet is available without a dashboard wallet and reports missing configuration', async () => {
  assert.ok(toolDeclarations.find(tool => tool.name === 'get_xdc_wallet'));
  const original = process.env.XDC_AI_API_KEY;
  delete process.env.XDC_AI_API_KEY;
  try {
    const result = await handleTool('get_xdc_wallet', {}, 'test', { network: 'base', wallet: null, walletSource: 'none' });
    assert.equal(result.status, 'unconfigured');
  } finally { if (original !== undefined) process.env.XDC_AI_API_KEY = original; }
});

test('stateless MCP requests include the negotiated protocol version', async () => {
  const originalKey = process.env.XDC_AI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.XDC_AI_API_KEY = 'xdcai_test';
  const headers: any[] = [];
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    headers.push(init?.headers);
    if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: request.method === 'initialize' ? { protocolVersion: '2025-03-26' } : { content: [] } }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    await handleTool('search_xdc_marketplace', {}, 'test');
    assert.equal(headers[2]['MCP-Protocol-Version'], '2025-03-26');
  } finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.XDC_AI_API_KEY; else process.env.XDC_AI_API_KEY = originalKey; }
});

test('marketplace uses bearer-authenticated MCP and only calls the discovery tool', async () => {
  const originalKey = process.env.XDC_AI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.XDC_AI_API_KEY = 'xdcai_test_secret';
  const requests: any[] = [];
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    requests.push({ request, headers: init?.headers });
    if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const result = request.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'test', version: '1' } } : { content: [{ type: 'text', text: 'listing' }] };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { headers: { 'content-type': 'application/json', 'mcp-session-id': 'session' } });
  };
  try {
    const result = await handleTool('search_xdc_marketplace', { search: 'defi' }, 'test');
    assert.equal(result.status, 'ok');
    assert.equal(requests[0].headers.Authorization, 'Bearer xdcai_test_secret');
    assert.equal(requests[2].request.params.name, 'marketplace_list');
    assert.deepEqual(requests[2].request.params.arguments, { search: 'defi' });
    assert.equal(JSON.stringify(result).includes('xdcai_test_secret'), false);
  } finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.XDC_AI_API_KEY; else process.env.XDC_AI_API_KEY = originalKey; }
});

test('dashboard key is verified before it becomes available to the agent and disconnect clears it', async () => {
  const originalKey = process.env.XDC_AI_API_KEY;
  const originalFetch = globalThis.fetch;
  delete process.env.XDC_AI_API_KEY;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: request.method === 'initialize' ? { protocolVersion: '2025-03-26' } : { content: [{ type: 'text', text: '0x123' }] } }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    assert.equal(xdcConnectionStatus().connected, false);
    assert.equal((await connectXdc('xdcai_test')).status, 'ok');
    assert.equal(xdcConnectionStatus().connected, true);
    assert.equal((await handleTool('search_xdc_marketplace', {}, 'test')).status, 'ok');
    disconnectXdc();
    assert.equal(xdcConnectionStatus().connected, false);
  } finally { disconnectXdc(); globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.XDC_AI_API_KEY; else process.env.XDC_AI_API_KEY = originalKey; }
});

test('a rejected candidate never replaces an existing connection or exposes the key', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    if ((init?.headers as Record<string, string>).Authorization === 'Bearer xdcai_bad_secret') return new Response('denied', { status: 401 });
    if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: request.method === 'initialize' ? { protocolVersion: '2025-03-26' } : { content: [] } }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    assert.equal((await connectXdc('xdcai_good')).status, 'ok');
    const result = await connectXdc('xdcai_bad_secret');
    assert.equal(result.status, 'unavailable');
    assert.equal(JSON.stringify(result).includes('xdcai_bad_secret'), false);
    assert.equal(xdcConnectionStatus().connected, true);
    assert.equal((await handleTool('search_xdc_marketplace', {}, 'test')).status, 'ok');
  } finally { disconnectXdc(); globalThis.fetch = originalFetch; }
});

