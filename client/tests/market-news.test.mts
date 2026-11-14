import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchMarketNews } from '../src/market-news.ts';

test('news requests contain no wallet credentials and reject a response for another topic', async () => {
  const original = globalThis.fetch;
  const result = { status: 'unconfigured', provider: 'You.com Search', topic: 'crypto', freshness: 'day', articles: [], retrievedAt: null, nextRefreshAt: '2026-11-14T18:02:00Z', message: 'Configure news', tradingAuthority: 'none', contentTrust: 'untrusted_external_evidence' };
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/api/market-news');
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body)), { topic: 'crypto', freshness: 'day' });
      assert.equal(new Headers(init?.headers).has('X-API-Key'), false);
      return Response.json(result);
    };
    assert.equal((await fetchMarketNews({ topic: 'crypto', freshness: 'day' }, AbortSignal.timeout(1000))).status, 'unconfigured');
    globalThis.fetch = async () => Response.json({ ...result, topic: 'ethereum' });
    await assert.rejects(fetchMarketNews({ topic: 'crypto', freshness: 'day' }, AbortSignal.timeout(1000)), /does not match/);
  } finally { globalThis.fetch = original; }
});

test('a missing news route explains the backend restart instead of hiding its HTTP status', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 404 });
    await assert.rejects(fetchMarketNews({ topic: 'crypto', freshness: 'day' }, AbortSignal.timeout(1000)), /404.*restart.*backend/i);
  } finally { globalThis.fetch = original; }
});
