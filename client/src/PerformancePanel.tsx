import { useEffect,useState } from 'react'
import { Icon } from './Icon'

type Entry={id:string;hash:string;kind:string;blockNumber:string;executedAt:string|null;ethAmount:string;usdcAmount:string;feeEth:string|null;knownFeeEth:string|null;executionPriceUsdc?:string|null}
type View={wallet:string;network:string;status:string;currency:string;summary:{averageEntryUsdc:string|null;averageBuyUsdc:string|null;realizedPnlUsdc:string|null;unrealizedPnlUsdc:string|null;unknownBasisEth:string;tradePnl:{id:string;realizedPnlUsdc:string|null}[]};history:{entries:Entry[];metadataRemaining:number;coverage:string;syncFailures:number};fees:{totalEth:string|null;knownEth:string;incompleteCount:number};openingEth:string|null;openingBasis:{priceUsdc:string;recordedAt:string}|null;warnings:string[]}
type Props={wallet:string;network:'base'|'mainnet'|'sepolia';explorer:string;revision:string;busy:boolean}
const number=(value:string|null|undefined,digits=8)=>value==null?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:digits}).format(Number(value))
const gain=(value:string|null)=>value===null?'':Number(value)>0?'pass':Number(value)<0?'fail':''
async function request(path:string,body:unknown,signal?:AbortSignal){
  const response=await fetch('/api/'+path,{method:'POST',headers:{'content-type':'application/json','x-defi-ui':'1'},body:JSON.stringify(body),signal}).catch(()=>{throw new Error('Performance backend is unreachable. Start the backend and refresh the dashboard.')})
  if(response.status===404)throw new Error('Performance API unavailable. Restart the backend to load trade history.')
  const data=await response.json().catch(()=>null)
  if(!response.ok)throw new Error(data?.error??`Performance API returned HTTP ${response.status}. Check that the backend is running.`)
  if(!data)throw new Error('Performance API did not return JSON. Restart the backend and check the API proxy.')
  return data
}
export function PerformancePanel({wallet,network,explorer,revision,busy}:Props){
  const [data,setData]=useState<View>(),[error,setError]=useState(''),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[price,setPrice]=useState(''),[refresh,setRefresh]=useState(0),[sync,setSync]=useState(false),[expanded,setExpanded]=useState(false)
  const valid=/^0x[\da-fA-F]{40}$/.test(wallet)
  useEffect(()=>{
    if(!valid)return
    let active=true
    const controller=new AbortController()
    setLoading(true);setError('')
    request('performance',{wallet,network,sync},AbortSignal.any([controller.signal,AbortSignal.timeout(90000)]))
      .then((result:View)=>{if(result.network!==network||result.wallet.toLowerCase()!==wallet.toLowerCase())throw new Error('Performance belongs to another wallet or chain');if(active){setData(result);setPrice(current=>current||result.openingBasis?.priceUsdc||'')}})
      .catch(error=>{if(active)setError(error instanceof Error?error.message:'Could not load performance')})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false;controller.abort()}
  },[wallet,network,valid,revision,refresh,sync])
  function reload(withSync=false){setSync(withSync);setRefresh(value=>value+1)}
  async function save(){
    setSaving(true);setError('')
    try{await request('opening-cost-basis',{wallet,network,priceUsdc:price});reload()}catch(error){setError(error instanceof Error?error.message:'Could not save opening cost')}finally{setSaving(false)}
  }
  const entries=data?.history.entries??[],rows=[...entries].reverse().slice(0,expanded?entries.length:20),pnl=new Map(data?.summary.tradePnl.map(row=>[row.id,row.realizedPnlUsdc]))
  return <section className="panel performance-panel" id="history">
    <div className="panel-title"><h2 className="section-icon-title"><span className="section-icon"><Icon name="history"/></span>Trade history & performance</h2><div className="performance-actions"><button className="secondary" disabled={!valid||loading||busy} onClick={()=>reload(true)} title="Read on-chain timestamps and fees for up to five older records">Sync history</button><button className="secondary" disabled={!valid||loading||busy} onClick={()=>reload()} aria-label="Refresh performance"><Icon name="refresh"/></button></div></div>
    {!valid?<p className="empty">Connect a wallet or enter an address to view its trade history.</p>:<>
      {error&&<p className="error" role="alert">{error}</p>}
      {loading&&<p className="muted" role="status">{sync?'Synchronizing receipt dates and fees…':'Updating trade performance…'}</p>}
      {data&&<>
        <p className="performance-caption">ETH trading P&L · {data.currency} · Before network fees</p>
        <div className="performance-metrics"><div><span>Average entry</span><strong title={data.summary.averageEntryUsdc??undefined}>{number(data.summary.averageEntryUsdc,4)}</strong><small>USDC / ETH{data.summary.averageBuyUsdc!==null?' · Tracked buys '+number(data.summary.averageBuyUsdc,4):''}</small></div><div><span>Realized P&L</span><strong className={gain(data.summary.realizedPnlUsdc)}>{number(data.summary.realizedPnlUsdc)}</strong><small>Closed trades · {data.currency}</small></div><div><span>Unrealized P&L</span><strong className={gain(data.summary.unrealizedPnlUsdc)}>{number(data.summary.unrealizedPnlUsdc)}</strong><small>Remaining ETH · {data.currency}</small></div></div>
        <p className="muted">{entries.filter(e=>e.kind==='buy'||e.kind==='sell').length} verified swaps · Network fees {data.fees.totalEth!==null?number(data.fees.totalEth,12):data.fees.knownEth==='0'?'unavailable':'at least '+number(data.fees.knownEth,12)} ETH{data.history.metadataRemaining>0?` · ${data.history.metadataRemaining} records need receipt metadata`:''}</p>
        {data.warnings.length>0&&<details className="performance-notes"><summary>Data coverage · {data.warnings.length} notes</summary>{data.warnings.map(note=><p key={note}>{note}</p>)}</details>}
        {data.summary.unknownBasisEth!=='0'&&<p className="performance-basis-notice">Some ETH has unknown acquisition cost. Enter your opening average price below to calculate complete P&L where history allows.</p>}
        <details className="opening-basis"><summary>{data.openingBasis?'Edit opening cost basis':'Set opening cost basis'}</summary><p>Average price you paid for the {number(data.openingEth,10)} ETH held {entries.length?'before the first tracked transaction':'at this starting checkpoint'}. This is your reported acquisition cost.</p><form onSubmit={event=>{event.preventDefault();void save()}}><label>Opening average price (USDC / ETH)<input aria-label="Opening average ETH price in USDC" inputMode="decimal" value={price} onChange={event=>setPrice(event.target.value)} placeholder="e.g. 2200" disabled={saving||loading||busy}/></label><button disabled={saving||loading||busy||data.openingEth===null||!price.trim()}>{saving?'Saving…':'Save opening cost'}</button></form>{data.openingBasis&&<small>Saved locally {new Date(data.openingBasis.recordedAt).toLocaleString()}</small>}</details>
        {rows.length>0?<div className="history-table"><table><thead><tr><th>Executed</th><th>Action</th><th>ETH</th><th>USDC</th><th>Rate · USDC/ETH</th><th>Realized P&L</th><th>Fee · ETH</th></tr></thead><tbody>{rows.map(entry=><tr key={entry.hash}><td><a href={`${explorer}/tx/${entry.hash}`} target="_blank" rel="noreferrer">{entry.executedAt?new Date(entry.executedAt).toLocaleString():'Sync receipt date'} ↗</a></td><td><span className={'history-kind '+entry.kind}>{entry.kind==='buy'?'Buy ETH':entry.kind==='sell'?'Sell ETH':entry.kind==='approval'?'USDC approval':'Reverted'}</span></td><td title={entry.ethAmount}>{entry.kind==='buy'||entry.kind==='sell'?number(entry.ethAmount,10):'—'}</td><td>{entry.kind==='buy'||entry.kind==='sell'?number(entry.usdcAmount,6):'—'}</td><td>{number(entry.executionPriceUsdc,4)}</td><td className={gain(pnl.get(entry.id)??null)}>{number(pnl.get(entry.id))}</td><td title={entry.feeEth??undefined}>{entry.feeEth!==null?number(entry.feeEth,12):entry.knownFeeEth?'≥ '+number(entry.knownFeeEth,12):'Unknown'}</td></tr>)}</tbody></table></div>:<p className="empty">No verified trades recorded for this wallet on this network.</p>}
        {entries.length>20&&<button className="secondary news-more" onClick={()=>setExpanded(value=>!value)}>{expanded?'Show recent 20':`Show all ${entries.length} records`}</button>}
        <p className="performance-coverage">App-recorded transactions only. External deposits with unknown cost are flagged. Values use moving-average cost; fees are reported separately.</p>
      </>}
    </>}
  </section>
}
