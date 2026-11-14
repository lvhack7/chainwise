export const NEWS_TOPICS = {
  crypto: 'Cryptocurrency Bitcoin Ethereum digital assets financial market news',
  bitcoin: 'Bitcoin BTC financial market news',
  ethereum: 'Ethereum ETH cryptocurrency market news',
  base: 'Base Ethereum layer 2 network ecosystem news',
  defi: 'DeFi decentralized finance Uniswap liquidity market news',
  stablecoins: 'USDC Circle stablecoin reserves regulation market news',
  security: 'Cryptocurrency DeFi security exploits protocol incident news',
} as const;
export type NewsTopic = keyof typeof NEWS_TOPICS;
export type NewsFreshness = 'day' | 'week';
export type NewsArticle = { title: string; url: string; source: string; sourceDate: string | null; summary: string; evidence: 'search_highlights' | 'search_snippet' | 'headline_only' };
export type NewsFeed = {
  status: 'ok' | 'stale' | 'unconfigured' | 'unavailable'; provider: 'You.com Search'; topic: NewsTopic; freshness: NewsFreshness;
  retrievedAt: string | null; nextRefreshAt: string; articles: NewsArticle[]; message: string;
  tradingAuthority: 'none'; contentTrust: 'untrusted_external_evidence';
};
const DOMAINS = ['coindesk.com', 'theblock.co', 'decrypt.co', 'cointelegraph.com', 'reuters.com', 'bloomberg.com', 'ft.com', 'cnbc.com', 'ethereum.org', 'circle.com', 'uniswap.org', 'base.org'];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function newsInput(input: unknown) {
  if (!record(input) || Object.keys(input).some(key => key !== 'topic' && key !== 'freshness')) throw new Error('Invalid news input');
  const topic = input.topic === undefined ? 'crypto' : input.topic, freshness = input.freshness === undefined ? 'day' : input.freshness;
  if (typeof topic !== 'string' || !Object.hasOwn(NEWS_TOPICS, topic) || freshness !== 'day' && freshness !== 'week') throw new Error('Invalid news topic or freshness');
  return { topic: topic as NewsTopic, freshness: freshness as NewsFreshness };
}
function articlesFrom(payload: unknown, now: number, freshness: NewsFreshness): NewsArticle[] {
  if (!record(payload) || payload.results !== undefined && !record(payload.results)) throw new Error('Invalid news response');
  const rows = (payload.results as Record<string, unknown> | undefined)?.web ?? [];
  if (!Array.isArray(rows)) throw new Error('Invalid news results');
  const items: NewsArticle[] = [], seen = new Set<string>();
  for (const row of rows.slice(0, 30)) {
    if (!record(row) || typeof row.url !== 'string' || row.url.length > 2048 || typeof row.title !== 'string' || !row.title.trim()) continue;
    let url: URL;
    try { url = new URL(row.url); } catch { continue; }
    const source = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !DOMAINS.some(domain => source === domain || source.endsWith('.' + domain))) continue;
    const date = typeof row.page_age === 'string' ? Date.parse(row.page_age) : NaN;
    if (Number.isFinite(date) && (date > now + 300000 || now - date > (freshness === 'day' ? 86400000 : 604800000))) continue;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    const canonical = source + url.pathname.replace(/\/$/, '') + url.search;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const highlights = record(row.contents) && Array.isArray(row.contents.highlights) ? row.contents.highlights.filter((value): value is string => typeof value === 'string') : [];
    const snippets = Array.isArray(row.snippets) ? row.snippets.filter((value): value is string => typeof value === 'string') : [];
    const text = highlights.length ? highlights.join(' ') : snippets.join(' ') || (typeof row.description === 'string' ? row.description : '');
    items.push({ title: row.title.trim().slice(0, 240), url: url.href, source, sourceDate: Number.isFinite(date) ? new Date(date).toISOString() : null, summary: text.slice(0, 700), evidence: highlights.length ? 'search_highlights' : text ? 'search_snippet' : 'headline_only' });
  }
  return items.sort((a, b) => (b.sourceDate ? Date.parse(b.sourceDate) : 0) - (a.sourceDate ? Date.parse(a.sourceDate) : 0)).slice(0, 10);
}
type Dependencies = { fetch?: typeof globalThis.fetch; now?: () => number; apiKey?: () => string | undefined };
export function createMarketNewsService(deps: Dependencies = {}) {
  const fetcher: typeof globalThis.fetch = deps.fetch ?? ((...args) => globalThis.fetch(...args));
  const clock = deps.now ?? Date.now;
  const cache = new Map<string, NewsFeed>(), inFlight = new Map<string, Promise<NewsFeed>>();
  let requests: number[] = [];
  return async function getMarketNews(input: unknown = {}): Promise<NewsFeed> {
    const { topic, freshness } = newsInput(input);
    const apiKey = (deps.apiKey ? deps.apiKey() : process.env.YDC_API_KEY)?.trim();
    if (!apiKey) return { status: 'unconfigured', provider: 'You.com Search', topic, freshness, retrievedAt: null, nextRefreshAt: new Date(clock() + 120000).toISOString(), articles: [], message: 'Add YDC_API_KEY to the root .env.local and restart the backend to enable crypto news.', tradingAuthority: 'none', contentTrust: 'untrusted_external_evidence' };
    const key = topic + ':' + freshness, cached = cache.get(key);
    if (cached && clock() < Date.parse(cached.nextRefreshAt)) return cached.status === 'stale' && clock() - Date.parse(cached.retrievedAt!) > 900000 ? { ...cached, status: 'unavailable', articles: [], retrievedAt: null, message: 'News is unavailable and cached coverage is too old to use. Waiting before retrying.' } : cached;
    const pending = inFlight.get(key);
    if (pending) return pending;
    const request = (async (): Promise<NewsFeed> => {
      let message = 'News request failed or timed out. Try again shortly.', delay = 30000;
      try {
        requests = requests.filter(time => clock() - time < 3600000);
        if (requests.length >= 60) { message = 'Local news request budget reached (60 provider requests per hour). Waiting before retrying.'; delay = Math.max(30000, requests[0] + 3600000 - clock()); throw new Error('News budget exhausted'); }
        requests.push(clock());
        const response = await fetcher('https://ydc-index.io/v1/search', {
          method: 'POST', headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: NEWS_TOPICS[topic], freshness, count: 10, language: 'EN', include_domains: DOMAINS, extraction: { extraction_mode: 'highlights', highlights: { total_max_tokens: 1024 } } }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          message = response.status === 401 || response.status === 403 ? 'You.com authentication failed. Check YDC_API_KEY on the backend.' : response.status === 402 ? 'You.com credits are unavailable. Check your developer account.' : response.status === 429 ? 'You.com rate limit reached. Waiting before retrying.' : 'You.com news is temporarily unavailable.';
          const retry = response.headers.get('Retry-After');
          if (retry) { const seconds = Number(retry); delay = Math.min(600000, Math.max(30000, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - clock() || 30000)); }
          await response.body?.cancel();
          throw new Error('Provider rejected request');
        }
        const articles = articlesFrom(await response.json(), clock(), freshness), time = clock();
        const feed: NewsFeed = { status: 'ok', provider: 'You.com Search', topic, freshness, retrievedAt: new Date(time).toISOString(), nextRefreshAt: new Date(time + 120000).toISOString(), articles, message: 'Search excerpts for news research; verify claims against linked sources. Provider page dates may reflect updates, not original publication.', tradingAuthority: 'none', contentTrust: 'untrusted_external_evidence' };
        cache.set(key, feed);
        return feed;
      } catch {
        const recent = cached?.retrievedAt && clock() - Date.parse(cached.retrievedAt) <= 900000;
        const feed: NewsFeed = { status: recent ? 'stale' : 'unavailable', provider: 'You.com Search', topic, freshness, retrievedAt: recent ? cached.retrievedAt : null, nextRefreshAt: new Date(clock() + delay).toISOString(), articles: recent ? cached.articles : [], message: recent ? message + ' Showing older cached excerpts; do not treat them as current trading evidence.' : message, tradingAuthority: 'none', contentTrust: 'untrusted_external_evidence' };
        cache.set(key, feed);
        return feed;
      }
    })();
    inFlight.set(key, request);
    try { return await request; } finally { inFlight.delete(key); }
  };
}
export const getMarketNews = createMarketNewsService();
