import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { fetchMarketNews, newsTopics, type NewsFeed, type NewsTopic } from './market-news'

type Props = { busy: boolean; onAsk: (prompt: string) => void }
const timeLabel = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function MarketNewsPanel({ busy, onAsk }: Props) {
  const [topic, setTopic] = useState<NewsTopic>('crypto')
  const [freshness, setFreshness] = useState<'day' | 'week'>('day')
  const [revision, setRevision] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [state, setState] = useState<{ key: string; loading: boolean; feed?: NewsFeed; error?: string }>()
  const key = topic + ':' + freshness
  const current = state?.key === key ? state : undefined
  const feed = current?.feed
  const loading = !current || current.loading
  const canAnalyze = feed?.status === 'ok' && feed.articles.length > 0 && !current?.error

  useEffect(() => {
    let active = true, fetching = false
    let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      if (!active || fetching) return
      if (document.visibilityState === 'hidden') { timer = setTimeout(load, 120000); return }
      fetching = true
      controller = new AbortController()
      setState(previous => previous?.key === key ? { ...previous, loading: true, error: undefined } : { key, loading: true })
      let wait = 120000
      try {
        const feed = await fetchMarketNews({ topic, freshness }, AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]))
        if (active) setState({ key, loading: false, feed })
        wait = Math.max(120000, Date.parse(feed.nextRefreshAt) - Date.now())
      } catch (error) {
        if (active) setState(previous => ({ key, loading: false, feed: previous?.key === key ? previous.feed : undefined, error: (error instanceof Error ? error.message : 'News connection unavailable.') + (previous?.key === key && previous.feed?.articles.length ? ' Retained results may be out of date.' : '') }))
      } finally {
        fetching = false
        if (active) timer = setTimeout(load, wait)
      }
    }
    const visible = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); void load() } }
    void load()
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; controller?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible) }
  }, [key, topic, freshness, revision])

  const status = current?.error ? 'Offline' : feed?.status === 'stale' ? 'Cached coverage' : feed?.status === 'unconfigured' ? 'Not connected' : feed?.status === 'unavailable' ? 'Unavailable' : feed?.retrievedAt ? 'Updated ' + timeLabel(feed.retrievedAt) : 'Loading coverage…'
  const articles = feed?.articles ?? []
  return <section className="panel news-panel" id="news" aria-label="Crypto financial news">
    <div className="panel-title news-heading"><h2 className="section-icon-title"><span className="section-icon"><Icon name="news"/></span>Crypto news</h2><span className="news-provider">You.com</span><div className="news-heading-actions"><button className="secondary" disabled={busy || !canAnalyze} onClick={() => onAsk(`Review current ${newsTopics[topic]} news relevant to my ETH/USDC portfolio. Cite the sources and dates, distinguish reported facts from interpretation, and explain portfolio implications. Discuss options; do not prepare a trade unless I request one.`)}><Icon name="agent"/> Analyze news</button><button className="secondary news-refresh" disabled={loading} onClick={() => setRevision(value => value + 1)} aria-label="Refresh crypto news"><Icon name="refresh"/></button></div></div>
    <div className="news-controls"><div className="news-topics" role="group" aria-label="News topics">{(Object.keys(newsTopics) as NewsTopic[]).map(value => <button type="button" key={value} aria-pressed={value === topic} className={value === topic ? 'selected' : ''} onClick={() => { setTopic(value); setExpanded(false) }}>{newsTopics[value]}</button>)}</div><select aria-label="News time window" value={freshness} onChange={event => { setFreshness(event.target.value as 'day' | 'week'); setExpanded(false) }}><option value="day">Last 24 hours</option><option value="week">Last 7 days</option></select></div>
    <div className={'news-status ' + (current?.error || feed?.status === 'stale' ? 'stale' : '')} aria-live="polite"><span>{status}{loading && feed ? ' · Updating…' : ''}</span>{feed?.status === 'ok' && !current?.error && <span>Auto-refresh · 2 min</span>}</div>
    {current?.error && <p className="news-alert" role="status">{current.error}</p>}
    {feed?.status === 'stale' && <p className="news-alert" role="status">{feed.message}</p>}
    {loading && !feed && <div className="news-skeleton" aria-label="Loading news"><div/><div/><div/><div/></div>}
    {feed?.status === 'unconfigured' && <div className="news-empty"><Icon name="news"/><h3>Your crypto briefing starts here.</h3><p>Connect You.com on the backend to bring current financial and crypto coverage into your workspace.</p></div>}
    {feed?.status === 'unavailable' && <p className="news-empty" role="status">{feed.message}</p>}
    {feed?.status === 'ok' && articles.length === 0 && <p className="news-empty">No coverage found in this window. Try another topic or the last 7 days.</p>}
    {articles.length > 0 && <div className="news-grid">{articles.slice(0, expanded ? 10 : 4).map(item => <article className="news-card" key={item.url}>
      <div className="news-card-meta"><span>{item.source}</span>{item.sourceDate ? <time dateTime={item.sourceDate} title="Date supplied by the search provider; may reflect a page update.">{new Date(item.sourceDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {timeLabel(item.sourceDate)}</time> : <span>Source date unknown</span>}</div>
      <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}<Icon name="arrow"/></a></h3>
      {item.summary && <p>{item.summary}</p>}
      <div className="news-card-footer"><span>{item.evidence === 'headline_only' ? 'Headline' : 'Search excerpt'}</span><button className="secondary" disabled={busy || !canAnalyze} onClick={() => onAsk(`Assess this report for my ETH/USDC portfolio: ${item.title} (${item.url}). Check current related coverage for corroboration, cite the sources, and explain any uncertainties before suggesting a trade.`)}>Discuss <Icon name="arrow"/></button></div>
    </article>)}</div>}
    {articles.length > 4 && <button className="secondary news-more" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer' : `Show all ${articles.length} articles`}</button>}
  </section>
}
