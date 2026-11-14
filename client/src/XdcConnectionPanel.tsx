import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

type Status = { connected: boolean; verified: boolean; source: 'none' | 'environment' | 'dashboard' }

async function request(path: string, body?: object) {
  const response = await fetch('/api/' + path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json', 'x-defi-ui': '1' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error('Could not reach the local backend.')
  return response.json()
}

export function XdcConnectionPanel() {
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { let active = true; request('xdc-status').then(value => { if (active) setStatus(value) }).catch(() => { if (active) setMessage('Could not reach the local backend.') }); return () => { active = false } }, [])
  async function connect(event: React.FormEvent) {
    event.preventDefault()
    const key = input.current?.value.trim() ?? ''
    if (input.current) input.current.value = ''
    setBusy(true); setMessage('')
    try {
      const result = await request('xdc-connect', { key })
      if (result.status !== 'ok') throw new Error(result.message || 'Connection failed.')
      setStatus(result); setMessage('XDC AI wallet connected.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection failed.') }
    finally { setBusy(false) }
  }
  async function disconnect() {
    setBusy(true); setMessage('')
    try { setStatus(await request('xdc-disconnect', {})); setMessage('Disconnected for this backend session.') }
    catch { setMessage('Could not disconnect. Check the backend connection.') }
    finally { setBusy(false) }
  }
  return <section className="panel xdc-panel" aria-label="XDC AI connection">
    <div className="panel-title"><h2 className="section-icon-title"><span className="section-icon"><Icon name="wallet"/></span>XDC AI wallet</h2><span>{!status ? 'CHECKING' : status.connected ? status.verified ? 'CONNECTED' : 'CONFIGURED' : 'NOT CONNECTED'}</span></div>
    <p className="xdc-description">Connect your XDC AI account to ask your agent about its wallet and marketplace.</p>
    {status?.connected ? <div className="xdc-connected"><span>{status.source === 'environment' ? 'Backend key configured · connection not yet verified' : 'Verified · available until backend restart'}</span><button className="secondary" type="button" disabled={busy} onClick={disconnect}>Disconnect</button></div> : <form className="xdc-form" onSubmit={connect}><label htmlFor="xdc-api-key">API key</label><div><input id="xdc-api-key" ref={input} type="password" placeholder="xdcai_…" autoComplete="off" spellCheck={false} required maxLength={1024}/><button disabled={busy || !status} type="submit">{busy ? 'Connecting…' : 'Connect'}</button></div></form>}
    <p className="xdc-note">Keys entered here stay in backend memory until restart. XDC AI keys may allow payments; this app only uses read-only wallet and marketplace tools.</p>
    {message && <p className="xdc-message" role="status">{message}</p>}
  </section>
}
