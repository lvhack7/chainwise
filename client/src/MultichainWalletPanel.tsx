import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

type Token = { network: string; tokenAddress: string | null; symbol: string | null; name: string | null; balance: string | null; rawBalance: string | null; priceUsd: string | null; priceUpdatedAt: string | null; metadataIncomplete: boolean }
type Result = { status: 'ok' | 'partial' | 'unconfigured'; message?: string; networks: string[]; tokens: Token[]; warnings: string[]; observedAt?: string }
const names: Record<string, string> = { 'eth-mainnet':'Ethereum', 'base-mainnet':'Base', 'polygon-mainnet':'Polygon', 'arb-mainnet':'Arbitrum', 'opt-mainnet':'Optimism', 'bnb-mainnet':'BNB Chain', 'avax-mainnet':'Avalanche', 'linea-mainnet':'Linea', 'sol-mainnet':'Solana' }

export function MultichainWalletPanel({ evmAddress, solanaAddress, onSolanaChange }: { evmAddress: string; solanaAddress: string; onSolanaChange: (value: string) => void }) {
  const [result, setResult] = useState<Result>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [extraNetworks, setExtraNetworks] = useState('')
  const latest = useRef(0)
  useEffect(() => () => { latest.current++ }, [])
  async function refresh() {
    const revision = ++latest.current
    setLoading(true); setResult(undefined); setError('')
    try {
      const response = await fetch('/api/multichain-wallet', { method:'POST', headers:{'content-type':'application/json','x-defi-ui':'1'}, body:JSON.stringify({evmAddress, solanaAddress, extraNetworks:extraNetworks.split(',').map(value=>value.trim()).filter(Boolean)}), signal: AbortSignal.timeout(65000) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load wallet balances.')
      if (revision === latest.current) setResult(data)
    } catch (failure) { if (revision === latest.current) setError(failure instanceof Error ? failure.message : 'Could not load wallet balances.') }
    finally { if (revision === latest.current) setLoading(false) }
  }
  function changeSolana(value: string) { latest.current++; setLoading(false); setResult(undefined); setError(''); onSolanaChange(value) }
  return <section className="panel multi-wallet" aria-label="Multichain wallet balances">
    <div className="panel-title"><h2 className="section-icon-title"><span className="section-icon"><Icon name="wallet"/></span>Assets across networks</h2><span>READ ONLY</span></div>
    <p className="xdc-description">View tokens for your EVM address above and your separate Solana address.</p>
    <div className="multi-wallet-controls"><label>Solana public address <span className="muted">Optional</span><input value={solanaAddress} onChange={event => changeSolana(event.target.value)} placeholder="Enter a Solana address" autoComplete="off" spellCheck={false}/></label><button type="button" onClick={refresh} disabled={loading || (!evmAddress.trim() && !solanaAddress.trim())}><Icon name="refresh"/>{loading ? 'Loading…' : 'Load assets'}</button></div>
    <details className="multi-wallet-extra"><summary>Additional EVM networks</summary><label>Alchemy network identifiers, separated by commas<input value={extraNetworks} onChange={event=>{latest.current++; setLoading(false); setResult(undefined); setError(''); setExtraNetworks(event.target.value)}} placeholder="network-mainnet" autoComplete="off"/></label></details>
    <p className="xdc-note">Checks Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche, Linea and Solana by default. Add other Alchemy-supported EVM networks above. NFTs are not included. Token data and prices may be incomplete.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {result?.status === 'unconfigured' && <p className="xdc-message" role="status">Add ALCHEMY_API_KEY to the root .env.local and restart the backend to load assets.</p>}
    {result?.warnings.map(warning => <p key={warning} className="xdc-message" role="status">{warning}</p>)}
    {result && result.status !== 'unconfigured' && <><p className="multi-wallet-caption">Checked: {result.networks.map(network => names[network] ?? network).join(', ')} · {result.observedAt ? new Date(result.observedAt).toLocaleString() : ''}</p>
      {result.tokens.length ? <div className="multi-wallet-table"><table><thead><tr><th>Asset</th><th>Network</th><th>Balance</th><th>Reference price</th></tr></thead><tbody>{result.tokens.map((token,index)=><tr key={`${token.network}:${token.tokenAddress ?? 'native'}:${index}`}><td><strong>{token.symbol || 'Unknown token'}</strong><small>{token.name || token.tokenAddress || 'Native asset'}{token.metadataIncomplete ? ' · incomplete metadata' : ''}</small></td><td>{names[token.network] ?? token.network}</td><td title={token.rawBalance ?? undefined}>{token.balance ?? 'Unavailable'}</td><td title={token.priceUpdatedAt ? `Updated ${token.priceUpdatedAt}` : undefined}>{token.priceUsd === null ? 'Unavailable' : `$${token.priceUsd}`}</td></tr>)}</tbody></table></div> : <p className="empty">{result.status === 'partial' ? 'No assets returned; some networks could not be loaded.' : 'No non-zero fungible token balances returned.'}</p>}</>}
  </section>
}
