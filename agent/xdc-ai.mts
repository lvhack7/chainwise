// A deliberately limited MCP client: only the fixed, read-only XDC AI tools below
// can be called. The bearer key never leaves this backend or appears in results.
const endpoint = 'https://api.xdcai.tech/mcp';
type XdcTool = 'wallet_address' | 'wallet_balance' | 'marketplace_list';
// undefined selects the environment key, null disables it for this process.
let dashboardKey: string | null | undefined;
let connectionGeneration = 0;
const currentKey = () => dashboardKey === undefined ? process.env.XDC_AI_API_KEY?.trim() : dashboardKey;
export function xdcConnectionStatus() { return { connected: Boolean(currentKey()), verified: dashboardKey !== undefined && dashboardKey !== null, source: dashboardKey === undefined && currentKey() ? 'environment' : dashboardKey ? 'dashboard' : 'none' }; }
export function disconnectXdc() { connectionGeneration++; dashboardKey = null; return xdcConnectionStatus(); }
export async function connectXdc(value: unknown) {
  if (typeof value !== 'string' || !/^xdcai_\S+$/.test(value) || value.length > 1024) return { status: 'invalid', message: 'Enter a valid xdcai_ API key.' };
  const generation = ++connectionGeneration;
  const verification = await xdcRead('wallet_address', {}, value);
  if (generation !== connectionGeneration) return { status: 'cancelled', message: 'Connection was superseded.' };
  if (verification.status !== 'ok') return { status: 'unavailable', message: 'Could not verify the key. Check the key and XDC AI connection.' };
  dashboardKey = value;
  return { status: 'ok', ...xdcConnectionStatus() };
}

export async function xdcRead(tool: XdcTool, args: Record<string, unknown> = {}, candidateKey?: string) {
  if (!['wallet_address', 'wallet_balance', 'marketplace_list'].includes(tool)) throw new Error('Unsupported XDC AI tool');
  const key = candidateKey ?? currentKey();
  if (!key) return { status: 'unconfigured', provider: 'XDC AI', message: 'Set XDC_AI_API_KEY in the backend environment.' };
  if (!key.startsWith('xdcai_') || /\s/.test(key)) return { status: 'unconfigured', provider: 'XDC AI', message: 'Invalid XDC AI API key format.' };
  const signal = AbortSignal.timeout(15000);
  let session: string | null = null;
  let version = '2025-03-26';
  let initialized = false;
  async function send(message: object, notification = false): Promise<any> {
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(session ? { 'Mcp-Session-Id': session } : {}), ...(initialized ? { 'MCP-Protocol-Version': version } : {}) }, body: JSON.stringify(message) });
    if (!response.ok) throw new Error('MCP request failed');
    session = response.headers.get('mcp-session-id') ?? session;
    if (notification) return;
    const body = await response.text();
    if (body.length > 1000000) throw new Error('MCP response too large');
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('text/event-stream') ? body.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5).trim())).find(item => item.id === (message as {id?: number}).id) : JSON.parse(body);
    if (!data || data.error || data.id !== (message as {id?: number}).id) throw new Error('Invalid MCP response');
    return data.result;
  }
  try {
    const init = await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 'chainwise', version: '1.0.0' } } });
    if (typeof init?.protocolVersion !== 'string') throw new Error('Invalid MCP initialization');
    version = init.protocolVersion;
    initialized = true;
    await send({ jsonrpc: '2.0', method: 'notifications/initialized' }, true);
    const result = await send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } });
    if (!result || result.isError) throw new Error('MCP tool failed');
    // Remote results are external content and must not be treated as instructions.
    return { status: 'ok', provider: 'XDC AI', tool, result, tradingAuthority: 'none' };
  } catch {
    return { status: 'unavailable', provider: 'XDC AI', message: 'XDC AI connection or read failed. Check the backend key and connectivity.' };
  }
}

export async function getXdcWallet(input: Record<string, unknown>) {
  if (Object.keys(input).length) throw new Error('Unexpected XDC wallet input');
  const address = await xdcRead('wallet_address');
  if (address.status !== 'ok') return address;
  const balance = await xdcRead('wallet_balance');
  return { status: balance.status, provider: 'XDC AI', address, balance, tradingAuthority: 'none' };
}
