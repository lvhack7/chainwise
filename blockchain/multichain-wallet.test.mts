import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMultichainWallet } from './multichain-wallet.mts';

test('returns a configuration status without exposing a key or contacting a provider', async () => {
  const result = await getMultichainWallet({ evmAddress: '0x4259e3c12Bc0ceB7345E38F88809a02Ff83cF502', solanaAddress: '' }, { apiKey: '', fetch: async () => { throw new Error('must not call'); } });
  assert.equal(result.status, 'unconfigured');
});

test('keeps chain-specific balances and reports partial provider failures', async () => {
  const requests: any[] = [];
  const mockFetch: typeof fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body)); requests.push(request);
    const network = request.addresses[0].networks[0];
    return new Response(JSON.stringify({ data: { tokens: [{ network, tokenAddress: null, tokenBalance: '0xf4240', tokenMetadata: { decimals: 6, symbol: network === 'sol-mainnet' ? 'SOL' : 'USDC', name: 'Example' }, tokenPrices: [{ currency: 'usd', value: '1', lastUpdatedAt: '2026-01-01' }] }] }, ...(network === 'eth-mainnet' ? { error: { partialErrors: [{ network: 'base-mainnet' }] } } : {}) }), { status: 200 });
  };
  const result = await getMultichainWallet({ evmAddress: '0x4259e3c12Bc0ceB7345E38F88809a02Ff83cF502', solanaAddress: '11111111111111111111111111111111' }, { apiKey: 'test', fetch: mockFetch });
  assert.equal(result.status, 'partial');
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.addresses[0].networks.length <= 5));
  assert.ok(result.tokens.some(token => token.network === 'sol-mainnet' && token.balance === '1'));
  assert.ok(result.warnings.some(warning => warning.includes('base-mainnet')));
});

test('rejects invalid Solana addresses before contacting the provider', async () => {
  await assert.rejects(getMultichainWallet({ evmAddress: '', solanaAddress: '0xnot-solana' }, { apiKey: 'test' }), /Invalid Solana/);
});

test('continues paginated responses without losing earlier balances', async () => {
  let pages = 0;
  const mockFetch: typeof fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    const network = request.addresses[0].networks[0];
    if (network !== 'eth-mainnet') return new Response(JSON.stringify({ data: { tokens: [] } }));
    pages++;
    return new Response(JSON.stringify({ data: { tokens: [{ network, tokenAddress: request.pageKey ? 'second' : 'first', tokenBalance: '0x01', tokenMetadata: { decimals: 0 } }], pageKey: request.pageKey ? null : 'next' } }));
  };
  const result = await getMultichainWallet({ evmAddress: '0x4259e3c12Bc0ceB7345E38F88809a02Ff83cF502', solanaAddress: '' }, { apiKey:'test', fetch:mockFetch });
  assert.equal(result.status, 'ok');
  assert.equal(pages, 2);
  assert.deepEqual(result.tokens.map(token => token.tokenAddress), ['first', 'second']);
});
