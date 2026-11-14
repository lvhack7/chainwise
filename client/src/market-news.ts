export const newsTopics = { crypto: 'All crypto', bitcoin: 'Bitcoin', ethereum: 'Ethereum', base: 'Base', defi: 'DeFi', stablecoins: 'Stablecoins', security: 'Security' } as const
export type NewsTopic = keyof typeof newsTopics
export type NewsRequest = { topic: NewsTopic; freshness: 'day' | 'week' }
export type NewsArticle = { title: string; url: string; source: string; sourceDate: string | null; summary: string; evidence: 'search_highlights' | 'search_snippet' | 'headline_only' }
export type NewsFeed = NewsRequest & { status: 'ok' | 'stale' | 'unconfigured' | 'unavailable'; provider: string; articles: NewsArticle[]; retrievedAt: string | null; nextRefreshAt: string; message: string }

export async function fetchMarketNews(input: NewsRequest, signal: AbortSignal): Promise<NewsFeed> {
  let response: Response
  try { response = await fetch('/api/market-news', { method: 'POST', headers: { 'content-type': 'application/json', 'x-defi-ui': '1' }, body: JSON.stringify(input), signal }) }
  catch { throw new Error('News backend is unreachable. Start the backend and open http://localhost:3100/dashboard, or check the development API proxy.') }
  if (!response.ok) throw new Error(response.status === 404 ? 'News API returned HTTP 404. Start or restart the backend and reload the dashboard.' : `News API returned HTTP ${response.status}. Check that the backend is running.`)
  let result
  try { result = await response.json() } catch { throw new Error('News API did not return JSON. Start or restart the backend and check the development API proxy.') }
  if (!result || result.topic !== input.topic || result.freshness !== input.freshness || !['ok', 'stale', 'unconfigured', 'unavailable'].includes(result.status) || !Array.isArray(result.articles) || !Number.isFinite(Date.parse(result.nextRefreshAt))) throw new Error('News response does not match the selected topic.')
  for (const item of result.articles) {
    if (!item || typeof item.title !== 'string' || typeof item.summary !== 'string' || typeof item.source !== 'string' || typeof item.url !== 'string') throw new Error('Invalid news article response.')
    const url = new URL(item.url)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid news source link.')
  }
  return result
}
