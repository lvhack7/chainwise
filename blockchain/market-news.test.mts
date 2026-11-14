import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMarketNewsService, NEWS_TOPICS } from './market-news.mts';

const now = Date.parse('2026-11-14T18:00:00Z');
const article = { title: 'Ethereum market update', url: 'https://www.coindesk.com/markets/eth-update', page_age: '2026-11-14T17:00:00Z', contents: { highlights: ['Ethereum liquidity and market developments.'] } };

test('crypto news uses documented You.com POST search and returns dated, cited excerpts without trading authority', async () => {
  const news = createMarketNewsService({ apiKey: () => 'test-secret', now: () => now, fetch: async (url, init) => {
    assert.equal(url, 'https://ydc-index.io/v1/search');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('X-API-Key'), 'test-secret');
    const body = JSON.parse(String(init?.body));
    assert.match(body.query, /Ethereum/);
    assert.equal(body.freshness, 'day');
    assert.equal(body.count, 10);
    assert.equal(body.extraction.extraction_mode, 'highlights');
    return Response.json({ results: { web: [article] } });
  } });
  const result = await news({ topic: 'ethereum' });
  assert.equal(result.status, 'ok');
  assert.equal(result.articles.length, 1);
  assert.equal(result.articles[0].url, article.url);
  assert.equal(result.articles[0].source, 'coindesk.com');
  assert.equal(result.articles[0].sourceDate, '2026-11-14T17:00:00.000Z');
  assert.equal(result.articles[0].evidence, 'search_highlights');
  assert.equal(result.tradingAuthority, 'none');
  assert.ok(!JSON.stringify(result).includes('test-secret'));
  assert.ok(!('transaction' in result));
});

test('dashboard and agent share a two-minute cache and concurrent requests share one provider call', async () => {
  let calls = 0, time = now;
  const news = createMarketNewsService({ apiKey: () => 'test', now: () => time, fetch: async () => { calls++; return Response.json({ results: { web: [article] } }); } });
  await Promise.all([news({ topic: 'ethereum' }), news({ topic: 'ethereum' })]);
  assert.equal(calls, 1);
  await news({ topic: 'ethereum' });
  assert.equal(calls, 1);
  time += 120001;
  await news({ topic: 'ethereum' });
  assert.equal(calls, 2);
  await news({ topic: 'ethereum', freshness: 'week' });
  assert.equal(calls, 3);
});

test('news filters stale and unsafe results, deduplicates tracking URLs and marks unknown source dates', async () => {
  const rows = [
    { ...article, url: article.url + '?utm_source=mail#top' },
    { ...article, url: article.url + '?fbclid=duplicate' },
    { ...article, title: 'Undated coverage', url: 'https://reuters.com/crypto-update', page_age: undefined },
    { ...article, url: 'https://coindesk.com/old', page_age: '2026-10-01' },
    { ...article, url: 'https://coindesk.com/future', page_age: '2026-12-01' },
    { ...article, url: 'javascript:alert(1)' },
    { ...article, url: 'https://coindesk.com.attacker.example/news' },
    { ...article, url: 'https://secret@coindesk.com/news' },
  ];
  const news = createMarketNewsService({ apiKey: () => 'test', now: () => now, fetch: async () => Response.json({ results: { web: rows } }) });
  const feed = await news({});
  assert.equal(feed.articles.length, 2);
  assert.equal(feed.articles[0].url, article.url);
  assert.equal(feed.articles[1].sourceDate, null);
  assert.equal(feed.contentTrust, 'untrusted_external_evidence');
});

test('a missing key returns actionable setup status without contacting You.com', async () => {
  const news = createMarketNewsService({ apiKey: () => undefined, now: () => now, fetch: async () => { throw new Error('Must not request news without a key'); } });
  const result = await news({});
  assert.equal(result.status, 'unconfigured');
  assert.equal(result.retrievedAt, null);
  assert.equal(result.articles.length, 0);
  assert.match(result.message, /YDC_API_KEY/);
});

test('provider failures retain clearly stale coverage briefly, honor cooldowns and never expose error bodies', async () => {
  let calls = 0, time = now;
  const news = createMarketNewsService({ apiKey: () => 'test-secret', now: () => time, fetch: async () => {
    calls++;
    return calls === 1 ? Response.json({ results: { web: [article] } }) : Response.json({ error: 'test-secret raw provider body' }, { status: 429, headers: { 'Retry-After': '60' } });
  } });
  const original = await news({});
  time += 120001;
  const stale = await news({});
  assert.equal(stale.status, 'stale');
  assert.equal(stale.retrievedAt, original.retrievedAt);
  assert.equal(stale.articles.length, 1);
  assert.match(stale.message, /rate.limit/i);
  assert.equal(Date.parse(stale.nextRefreshAt), time + 60000);
  assert.ok(!JSON.stringify(stale).includes('test-secret'));
  await news({});
  assert.equal(calls, 2);
  time += 16 * 60000;
  const unavailable = await news({});
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.articles.length, 0);
  assert.equal(unavailable.retrievedAt, null);
});

test('invalid model fields are rejected before sending queries or wallet information to You.com', async () => {
  let calls = 0;
  const news = createMarketNewsService({ apiKey: () => 'test', fetch: async () => { calls++; return Response.json({ results: {} }); } });
  for (const input of [null, [], { topic: '__proto__' }, { topic: null }, { freshness: null }, { freshness: 'year' }, { query: 'arbitrary query' }, { wallet: '0x1234' }, { apiKey: 'secret' }]) await assert.rejects(news(input), /Invalid news/);
  assert.equal(calls, 0);
});

test('polling and agent topic changes share a bounded hourly provider budget', async () => {
  let calls = 0, time = now, message = '';
  const news = createMarketNewsService({ apiKey: () => 'test', now: () => time, fetch: async () => { calls++; return Response.json({ results: {} }); } });
  for (let round = 0; round < 5; round++) {
    for (const topic of Object.keys(NEWS_TOPICS)) for (const freshness of ['day', 'week']) message = (await news({ topic, freshness })).message;
    time += 120001;
  }
  assert.equal(calls, 60);
  assert.match(message, /budget/i);
});

test('a valid search response with no results section is an empty feed, not an outage', async () => {
  const news = createMarketNewsService({ apiKey: () => 'test', now: () => now, fetch: async () => Response.json({ metadata: { search_uuid: 'empty' } }) });
  const feed = await news({});
  assert.equal(feed.status, 'ok');
  assert.deepEqual(feed.articles, []);
});

test('cached coverage expires during a provider cooldown without making an early retry', async () => {
  let calls = 0, time = now;
  const news = createMarketNewsService({ apiKey: () => 'test', now: () => time, fetch: async () => ++calls === 1 ? Response.json({ results: { web: [article] } }) : new Response(null, { status: 429, headers: { 'Retry-After': '600' } }) });
  await news({});
  time += 14 * 60000;
  assert.equal((await news({})).status, 'stale');
  time += 2 * 60000;
  const feed = await news({});
  assert.equal(feed.status, 'unavailable');
  assert.equal(feed.articles.length, 0);
  assert.doesNotMatch(feed.message, /Showing older cached/);
  assert.equal(calls, 2);
});
