import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
const currencySymbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' }

function ProviderMark({ mark, tone }: { mark: string; tone: string }) {
  return <span className={`provider-mark ${tone}`}>{mark}</span>
}

const flags: Record<string, string> = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' }
const fxRates: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27 }
const formatUsd = (minor: number) => `$${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
type ApiBalance = { currency: string; amount: number }
type ApiAccount = { nickname: string; id: string; balances: ApiBalance[] }
type ApiProvider = { name: string; accounts: ApiAccount[] }
type ApiConnection = { id: string; provider: string; label?: string; keyLast4: string; connectedAt: string }
type ProviderView = { provider: string; mark: string; tone: string; accounts: { nickname: string; identifier: string; currencies: { code: string; flag: string; balance: string }[]; fxTotal: string }[] }

const providerDetails: Record<string, { mark: string; tone: string }> = {
  stripe: { mark: 'S', tone: 'stripe' },
  'bank-of-america': { mark: 'BofA', tone: 'boa' },
  venmo: { mark: 'V', tone: 'venmo' },
}

function App() {
  const [showApiKeyForm, setShowApiKeyForm] = useState(false)
  const [activePage, setActivePage] = useState<'overview' | 'connections'>('overview')
  const [accountData, setAccountData] = useState<ProviderView[]>([])
  const [connections, setConnections] = useState<ApiConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState('')

  const refreshAccounts = async () => {
    const user = await supabase?.auth.getUser()
    const userId = user?.data.user?.id
    if (!userId) return
    setLoading(true)
    setApiError('')
    try {
      const [dashboardResponse, connectionsResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/v1/dashboard?userId=${encodeURIComponent(userId)}`),
        fetch(`${apiBaseUrl}/v1/platform-connections?userId=${encodeURIComponent(userId)}`),
      ])
      if (!dashboardResponse.ok || !connectionsResponse.ok) throw new Error('The backend could not load your dashboard.')
      const dashboard = await dashboardResponse.json() as { data?: { providers?: ApiProvider[] } }
      const connectionPayload = await connectionsResponse.json() as { data?: ApiConnection[] }
      setConnections(connectionPayload.data || [])
      setAccountData((dashboard.data?.providers || []).map((provider) => {
        const details = providerDetails[provider.name.toLowerCase()] || { mark: provider.name.slice(0, 1), tone: 'boa' }
        return { provider: provider.name, ...details, accounts: provider.accounts.map((account) => ({ nickname: account.nickname, identifier: account.id, currencies: account.balances.map((balance) => ({ code: balance.currency, flag: flags[balance.currency] || '🌐', balance: `${currencySymbols[balance.currency] || ''}${(balance.amount / 100).toLocaleString()}` })), fxTotal: formatUsd(account.balances.reduce((total, balance) => total + balance.amount * (fxRates[balance.currency] || 1), 0)) })) }
      }))
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'The backend could not load your dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refreshAccounts() }, [])

  const totalBalance = accountData.flatMap((provider) => provider.accounts).reduce((total, account) => total + account.currencies.reduce((subtotal, currency) => subtotal + Number(currency.balance.replace(/[^0-9.-]/g, '')) * (fxRates[currency.code] || 1), 0), 0)
  const accountCount = accountData.reduce((total, provider) => total + provider.accounts.length, 0)

  return (
    <div className={`app-shell ${activePage === 'connections' ? 'settings-view' : ''}`}>
      <aside className="sidebar">
        <a className="wordmark" href="#overview" aria-label="Onepane home"><span>o</span> onepane</a>
        <nav aria-label="Primary navigation">
          <a className={`nav-link ${activePage === 'overview' ? 'active' : ''}`} href="#overview" onClick={() => setActivePage('overview')}><i>⌂</i> Overview</a>
          <a className="nav-link" href="#accounts"><i>▣</i> Accounts</a>
          <a className="nav-link" href="#transfers"><i>⇄</i> Transfers</a>
          <a className="nav-link" href="#activity"><i>↗</i> Activity</a>
          <a className="nav-link" href="#insights"><i>◔</i> Insights</a>
        </nav>
        <div className="sidebar-footer">
          <a className={`nav-link ${activePage === 'connections' ? 'active' : ''}`} href="#settings" onClick={(event) => { event.preventDefault(); setActivePage('connections') }}><i>⚙</i> Settings</a>
          <button className="profile" type="button"><span className="avatar">JD</span><span>Jordan Davis<small>Acme, Inc.</small></span><b>⌄</b></button>
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Open navigation">☰</button>
          <div><p className="eyebrow">{activePage === 'connections' ? 'Settings' : 'Acme, Inc.'}</p><h1>{activePage === 'connections' ? 'Platform connections' : 'Overview'}</h1></div>
          <div className="top-actions">{activePage === 'overview' && <button className="new-button" type="button" onClick={() => document.getElementById('transfers')?.scrollIntoView({ behavior: 'smooth' })}>Move money <span>→</span></button>}</div>
        </header>

        {activePage === 'overview' && <section className="balance-section" aria-labelledby="balance-heading">
          <p id="balance-heading" className="eyebrow">Total connected balance</p>
          <div className="balance-line"><h2>{formatUsd(Math.round(totalBalance * 100))}</h2></div>
          <p className="base-currency">USD equivalent · using backend account data</p>
          <p className="connected-status"><span /> {loading ? 'Syncing accounts…' : `${accountCount} accounts loaded`}</p>
          {apiError && <p className="auth-error">{apiError}</p>}
        </section>}

        {activePage === 'connections' ? <section className="settings-grid">
          <article className="panel connections-panel" id="settings">
            <div className="panel-heading"><div><h2>Platform connections</h2><p>Credentials and sync status</p></div><button className="quiet-button" type="button" onClick={() => setShowApiKeyForm((visible) => !visible)}>{showApiKeyForm ? 'Close' : 'Add platform'}</button></div>
            {showApiKeyForm && <form className="api-key-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const user = await supabase?.auth.getUser(); const userId = user?.data.user?.id; if (!userId) return; const response = await fetch(`${apiBaseUrl}/v1/platform-connections`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': userId }, body: JSON.stringify({ provider: form.get('provider'), apiKey: form.get('apiKey') }) }); if (!response.ok) { setApiError('The backend could not save this connection.'); return } setShowApiKeyForm(false); void refreshAccounts() }}><label>Platform<select name="provider" defaultValue=""><option value="" disabled>Select a platform</option><option value="bank-of-america">Bank of America</option><option value="stripe">Stripe</option><option value="venmo">Venmo</option></select></label><label>API key<input name="apiKey" type="password" placeholder="Paste an API key" autoComplete="off" /></label><button className="transfer-button" type="submit">Connect securely</button><small>Connect this form to a server-side secret store; keys should never be persisted in the browser.</small></form>}
            <div className="oauth-callout"><ProviderMark mark="P" tone="paypal" /><div><strong>PayPal & Venmo</strong><small>Authorize PayPal to prepare PayPal and Venmo payment actions.</small></div><button className="quiet-button" type="button" disabled>Connect PayPal</button></div>
            <p className="settings-note">PayPal OAuth is not configured on the backend yet. Add PayPal app credentials and a callback URL before enabling this connection.</p>
            <div className="connection-list">{connections.length ? connections.map((connection) => { const details = providerDetails[connection.provider] || { mark: connection.provider.slice(0, 1), tone: 'boa' }; return <div className="connection" key={connection.id}><ProviderMark mark={details.mark} tone={details.tone} /><div><strong>{connection.label || connection.provider}</strong><small>•••• {connection.keyLast4} · Connected {new Date(connection.connectedAt).toLocaleString()}</small></div><button type="button">Manage</button></div> }) : <p className="empty-state">No platform connections yet.</p>}</div>
          </article>
        </section> : <section className="dashboard-grid">
          <article className="panel accounts-panel" id="accounts">
            <div className="panel-heading"><div><h2>Connected accounts</h2><p>{accountData.length} providers · {accountCount} accounts</p></div><button className="quiet-button" type="button">Manage accounts</button></div>
            <div className="account-list">{accountData.length ? accountData.map((provider) => <section className="provider-group" key={provider.provider}><div className="provider-heading"><ProviderMark mark={provider.mark} tone={provider.tone} /><strong>{provider.provider}</strong><span>{provider.accounts.length} {provider.accounts.length === 1 ? 'account' : 'accounts'}</span></div>{provider.accounts.map((account) => <button className="account-row" type="button" key={account.nickname}><span className="account-copy"><strong>{account.nickname}</strong><small>{account.identifier}</small></span><span className="currency-balances">{account.currencies.map((currency) => <span key={currency.code}><em><span aria-hidden="true">{currency.flag}</span>{currency.code}</em><b>{currency.balance}</b></span>)}</span><span className="fx-total"><em>USD total</em><b>{account.fxTotal}</b></span><i>›</i></button>)}</section>) : <p className="empty-state">No connected accounts yet. Add a platform connection to begin.</p>}</div>
            <button className="connect-account" type="button"><span>+</span> Connect an account</button>
          </article>

          <article className="panel movement-panel" id="transfers"><div className="panel-heading"><div><h2>Move money</h2><p>Choose a source, destination, and amount</p></div></div><div className="transfer-route"><div><ProviderMark mark="From" tone="boa" /><span><small>Source account</small><strong>{accountCount ? 'Select an account' : 'Connect an account first'}</strong></span></div><span className="route-arrow">↓</span><div><ProviderMark mark="To" tone="paypal" /><span><small>Destination</small><strong>PayPal or Venmo</strong></span></div></div><button className="transfer-button" type="button" disabled={!accountCount}>Start a transfer <span>→</span></button><p className="settings-note">Transfers will be enabled after the destination provider is authorized.</p></article>

          <article className="panel cash-flow"><div className="panel-heading"><div><h2>Cash flow</h2><p>Across all providers · Last 30 days</p></div><button className="quiet-button" type="button">View report</button></div><div className="chart-summary"><div><span>Inflow</span><strong>$32,420</strong></div><div><span>Outflow</span><strong>$12,842</strong></div><div className="net"><span>Net flow</span><strong>+$19,578</strong></div></div><div className="chart" aria-label="Cash flow chart"><div className="gridline g1" /><div className="gridline g2" /><div className="gridline g3" /><svg viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="Income rose over the month"><path className="area" d="M0,111 C45,101 56,120 92,104 S143,91 174,100 S218,61 254,78 S309,88 344,55 S395,61 431,42 S488,66 520,35 S568,45 600,11 L600,150 L0,150 Z" /><path className="line" d="M0,111 C45,101 56,120 92,104 S143,91 174,100 S218,61 254,78 S309,88 344,55 S395,61 431,42 S488,66 520,35 S568,45 600,11" /></svg><div className="chart-labels"><span>Aug 6</span><span>Aug 13</span><span>Aug 20</span><span>Aug 27</span><span>Sep 3</span></div></div></article>

          <article className="panel activity-panel" id="activity"><div className="panel-heading"><div><h2>Recent activity</h2><p>Activity will appear after transfers are enabled</p></div></div><p className="empty-state">No activity yet.</p></article>
        </section>}
      </main>
    </div>
  )
}

export default App
