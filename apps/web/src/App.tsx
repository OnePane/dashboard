import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { isDemoMode } from './mode'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`
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
type Recipient = { id: string; name: string; destination: string; method: string; currency?: string }
type SourceAccount = { id: string; provider: string; nickname: string; currency: string; balance: string }
type Page = 'overview' | 'accounts' | 'transfers' | 'recipients' | 'activity' | 'insights' | 'connections'

function pageFromPath(pathname: string): Page {
  const path = pathname.replace(/\/$/, '')
  if (path === '/accounts') return 'accounts'
  if (path === '/transfers') return 'transfers'
  if (path === '/recipients') return 'recipients'
  if (path === '/activity') return 'activity'
  if (path === '/insights') return 'insights'
  if (path === '/settings' || path === '/connections') return 'connections'
  return 'overview'
}

const providerDetails: Record<string, { mark: string; tone: string }> = {
  stripe: { mark: 'S', tone: 'stripe' },
  'bank-of-america': { mark: 'BofA', tone: 'boa' },
  venmo: { mark: 'V', tone: 'venmo' },
  paypal: { mark: 'P', tone: 'paypal' },
}

const providerOptions = [
  { id: 'bank-of-america', name: 'Bank of America', description: 'Connect checking and savings accounts', method: 'api-key' },
  { id: 'stripe', name: 'Stripe', description: 'Connect balances and payouts', method: 'api-key' },
  { id: 'paypal', name: 'PayPal', description: 'Authorize PayPal and Venmo payments', method: 'oauth' },
]

const demoAccounts: ProviderView[] = [{ provider: 'Stripe', mark: 'S', tone: 'stripe', accounts: [{ nickname: 'Operating balance', identifier: 'fa_demo_usd', currencies: [{ code: 'USD', flag: '🇺🇸', balance: '$218,402.42' }, { code: 'EUR', flag: '🇪🇺', balance: '€18,450.00' }], fxTotal: '$238,348.42' }] }, { provider: 'Bank of America', mark: 'BofA', tone: 'boa', accounts: [{ nickname: 'Operating account', identifier: '•••• 4821', currencies: [{ code: 'USD', flag: '🇺🇸', balance: '$79,861.40' }], fxTotal: '$79,861.40' }] }]
const demoRecipients: Recipient[] = [{ id: 'demo_recipient_1', name: 'Acme Payroll', destination: 'payroll@acme.example', method: 'paypal', currency: 'USD' }, { id: 'demo_recipient_2', name: 'Sarah Chen', destination: '@sarahchen', method: 'venmo', currency: 'USD' }]
const demoConnections: ApiConnection[] = [{ id: 'demo_stripe', provider: 'stripe', label: 'Stripe', keyLast4: 'demo', connectedAt: new Date().toISOString() }, { id: 'demo_boa', provider: 'bank-of-america', label: 'Bank of America', keyLast4: 'demo', connectedAt: new Date().toISOString() }]

async function apiFetch(path: string, init: RequestInit = {}) {
  const session = await supabase?.auth.getSession()
  const headers = new Headers(init.headers)
  if (session?.data.session?.access_token) headers.set('Authorization', `Bearer ${session.data.session.access_token}`)
  return fetch(`${apiBaseUrl}${path}`, { ...init, headers })
}

function App() {
  const [showProviderFlow, setShowProviderFlow] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [editingConnection, setEditingConnection] = useState<ApiConnection | null>(null)
  const [activePage, setActivePage] = useState<Page>(() => pageFromPath(window.location.pathname))
  const [accountData, setAccountData] = useState<ProviderView[]>(isDemoMode ? demoAccounts : [])
  const [connections, setConnections] = useState<ApiConnection[]>(isDemoMode ? demoConnections : [])
  const [recipients, setRecipients] = useState<Recipient[]>(isDemoMode ? demoRecipients : (() => { try { return JSON.parse(localStorage.getItem('onepane.recipients') || '[]') as Recipient[] } catch { return [] } })())
  const [recipientSearch, setRecipientSearch] = useState('')
  const [selectedRecipient, setSelectedRecipient] = useState('')
  const [showRecipientForm, setShowRecipientForm] = useState(false)
  const [showSendMoneyModal, setShowSendMoneyModal] = useState(false)
  const [sendMoneyStep, setSendMoneyStep] = useState(1)
  const [sourceAccountId, setSourceAccountId] = useState('')
  const [sendMoneyAmount, setSendMoneyAmount] = useState('')
  const [loading, setLoading] = useState(!isDemoMode)
  const [apiError, setApiError] = useState('')
  const [profile, setProfile] = useState({ firstName: isDemoMode ? 'Jordan' : '', lastName: isDemoMode ? 'Davis' : '', username: isDemoMode ? 'jordan_davis' : '', companyName: isDemoMode ? 'Acme, Inc.' : '' })

  const refreshAccounts = async () => {
    if (isDemoMode) return
    const user = await supabase?.auth.getUser()
    const userId = user?.data.user?.id
    if (!userId) return
    setLoading(true)
    setApiError('')
    try {
      const [dashboardResponse, connectionsResponse, recipientsResponse] = await Promise.all([
        apiFetch('/dashboard'),
        apiFetch('/platform-connections'),
        apiFetch('/recipients?provider=stripe'),
      ])
      if (!dashboardResponse.ok || !connectionsResponse.ok) throw new Error('The backend could not load your dashboard.')
      const dashboard = await dashboardResponse.json() as { data?: { providers?: ApiProvider[] } }
      const connectionPayload = await connectionsResponse.json() as { data?: ApiConnection[] }
      const recipientPayload = recipientsResponse.ok ? await recipientsResponse.json() as { data?: Recipient[] } : { data: [] }
      setConnections(connectionPayload.data || [])
      setRecipients((current) => [...(recipientPayload.data || []), ...current.filter((recipient) => recipient.id.startsWith('local_'))])
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
  useEffect(() => {
    const onPopState = () => setActivePage(pageFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => { if (!isDemoMode) localStorage.setItem('onepane.recipients', JSON.stringify(recipients.filter((recipient) => recipient.id.startsWith('local_')))) }, [recipients])
  useEffect(() => { if (isDemoMode) return; void apiFetch('/profile').then(async (response) => { if (!response.ok) return; const payload = await response.json() as { data: { first_name?: string; last_name?: string; username?: string; company_name?: string } }; setProfile({ firstName: payload.data.first_name || '', lastName: payload.data.last_name || '', username: payload.data.username || '', companyName: payload.data.company_name || '' }) }) }, [])

  const totalBalance = accountData.flatMap((provider) => provider.accounts).reduce((total, account) => total + account.currencies.reduce((subtotal, currency) => subtotal + Number(currency.balance.replace(/[^0-9.-]/g, '')) * (fxRates[currency.code] || 1), 0), 0)
  const accountCount = accountData.reduce((total, provider) => total + provider.accounts.length, 0)
  const sourceAccounts: SourceAccount[] = accountData.flatMap((provider) => provider.accounts.flatMap((account) => account.currencies.map((currency) => ({ id: `${provider.provider}:${account.identifier}:${currency.code}`, provider: provider.provider, nickname: account.nickname, currency: currency.code, balance: currency.balance }))))
  const selectedSourceAccount = sourceAccounts.find((account) => account.id === sourceAccountId)
  const selectedTransferRecipient = recipients.find((recipient) => recipient.id === selectedRecipient)
  const visibleRecipients = recipients.filter((recipient) => `${recipient.name} ${recipient.destination} ${recipient.method} ${recipient.currency || 'USD'}`.toLowerCase().includes(recipientSearch.toLowerCase().trim()))
  const closeSendMoneyModal = () => { setShowSendMoneyModal(false); setSendMoneyStep(1); setSendMoneyAmount('') }
  const navigate = (page: Page) => {
    const path = page === 'overview' ? '/' : page === 'connections' ? '/connections' : `/${page}`
    window.history.pushState({}, '', path)
    setActivePage(page)
  }
  const pageTitles: Record<Page, string> = { overview: 'Overview', accounts: 'Accounts', transfers: 'Transfers', recipients: 'Recipients', activity: 'Activity', insights: 'Insights', connections: 'Platform connections' }

  return (
    <div className={`app-shell ${activePage === 'connections' ? 'settings-view' : ''}`}>
      <aside className="sidebar">
        <a className="wordmark" href="/" aria-label="Onepane home" onClick={(event) => { event.preventDefault(); navigate('overview') }}><span>o</span> onepane</a>
        <nav aria-label="Primary navigation">
          <a className={`nav-link ${activePage === 'overview' ? 'active' : ''}`} href="/" onClick={(event) => { event.preventDefault(); navigate('overview') }}><i>⌂</i> Overview</a>
          <a className={`nav-link ${activePage === 'accounts' ? 'active' : ''}`} href="/accounts" onClick={(event) => { event.preventDefault(); navigate('accounts') }}><i>▣</i> Accounts</a>
          <a className={`nav-link ${activePage === 'transfers' ? 'active' : ''}`} href="/transfers" onClick={(event) => { event.preventDefault(); navigate('transfers') }}><i>⇄</i> Transfers</a>
          <a className={`nav-link ${activePage === 'recipients' ? 'active' : ''}`} href="/recipients" onClick={(event) => { event.preventDefault(); navigate('recipients') }}><i>◎</i> Recipients</a>
          <a className={`nav-link ${activePage === 'connections' ? 'active' : ''}`} href="/connections" onClick={(event) => { event.preventDefault(); navigate('connections') }}><i>⌘</i> Connections</a>
          <a className={`nav-link ${activePage === 'activity' ? 'active' : ''}`} href="/activity" onClick={(event) => { event.preventDefault(); navigate('activity') }}><i>↗</i> Activity</a>
          <a className={`nav-link ${activePage === 'insights' ? 'active' : ''}`} href="/insights" onClick={(event) => { event.preventDefault(); navigate('insights') }}><i>◔</i> Insights</a>
        </nav>
        <div className="sidebar-footer">
          <a className="nav-link" href="/connections" onClick={(event) => { event.preventDefault(); navigate('connections') }}><i>⚙</i> Settings</a>
          <button className="profile" type="button"><span className="avatar">{`${profile.firstName.slice(0, 1)}${profile.lastName.slice(0, 1)}`.toUpperCase() || 'U'}</span><span>{`${profile.firstName} ${profile.lastName}`.trim() || profile.username || 'Account'}<small>{profile.username ? `@${profile.username}` : (profile.companyName || 'Personal account')}</small></span><b>⌄</b></button>
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Open navigation">☰</button>
          <div><p className="eyebrow">{activePage === 'connections' ? 'Settings' : (profile.companyName || 'Workspace')}</p><h1>{pageTitles[activePage]}</h1></div>
          <div className="top-actions">{activePage === 'overview' && <button className="new-button" type="button" onClick={() => { setSendMoneyStep(1); setShowSendMoneyModal(true) }}>Move money <span>→</span></button>}</div>
        </header>

        {activePage === 'overview' && <section className="balance-section" aria-labelledby="balance-heading">
          <p id="balance-heading" className="eyebrow">Total connected balance</p>
          <div className="balance-line"><h2>{loading ? <span className="balance-loading" aria-label="Loading balance">Loading…</span> : formatUsd(Math.round(totalBalance * 100))}</h2></div>
          <p className="base-currency">USD equivalent · using backend account data</p>
          <p className="connected-status"><span /> {loading ? 'Syncing accounts…' : `${accountCount} accounts loaded`}</p>
          {apiError && <p className="auth-error">{apiError}</p>}
        </section>}

        {activePage === 'connections' ? <section className="settings-grid">
          <article className="panel connections-panel" id="settings">
            <div className="panel-heading"><div><h2>Platform connections</h2><p>Manage every connected platform and API key</p></div><button className="quiet-button" type="button" onClick={() => { setEditingConnection(null); setSelectedProvider(''); setShowProviderFlow(true) }}>Add connection</button></div>
            <div className="oauth-callout"><ProviderMark mark="P" tone="paypal" /><div><strong>PayPal & Venmo</strong><small>Authorize PayPal to prepare PayPal and Venmo payment actions.</small></div><button className="quiet-button" type="button" onClick={() => { setSelectedProvider('paypal'); setShowProviderFlow(true) }}>Connect PayPal</button></div>
            <p className="settings-note">PayPal OAuth is not configured on the backend yet. Add PayPal app credentials and a callback URL before enabling this connection.</p>
            <div className="connection-list">{connections.length ? connections.map((connection) => { const details = providerDetails[connection.provider] || { mark: connection.provider.slice(0, 1), tone: 'boa' }; return <div className="connection" key={connection.id}><ProviderMark mark={details.mark} tone={details.tone} /><div><strong>{connection.label || connection.provider}</strong><small>•••• {connection.keyLast4} · Connected {new Date(connection.connectedAt).toLocaleString()}</small></div><div className="connection-actions"><button type="button" onClick={() => { setEditingConnection(connection); setSelectedProvider(connection.provider); setShowProviderFlow(true) }}>Edit</button><button type="button" onClick={async () => { if (!window.confirm(`Remove ${connection.label || connection.provider}?`)) return; const response = await apiFetch(`/platform-connections/${connection.id}`, { method: 'DELETE' }); if (!response.ok) { setApiError('The connection could not be removed.'); return } setConnections((current) => current.filter((item) => item.id !== connection.id)); void refreshAccounts() }}>Delete</button></div></div> }) : <p className="empty-state">No platform connections yet.</p>}</div>
          </article>
        </section> : activePage === 'recipients' ? <section className="settings-grid"><article className="panel connections-panel recipients-page"><div className="panel-heading"><div><h2>Recipients</h2><p>{recipients.length} recipients across all connected accounts</p></div><button className="quiet-button" type="button" onClick={() => navigate('transfers')}>Send money</button></div><label className="recipient-search"><span>Search recipients</span><input type="search" value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="Search by name, email, provider, or currency" /></label><div className="connection-list recipient-page-list">{visibleRecipients.length ? visibleRecipients.map((recipient) => <div className="connection recipient-page-row" key={recipient.id}><span className={`recipient-avatar ${recipient.method}`}>{recipient.name.slice(0, 1).toUpperCase()}</span><div><strong>{recipient.name}</strong><small>{recipient.destination} · {recipient.method === 'venmo' ? 'Venmo' : recipient.method === 'stripe-account' ? 'Stripe recipient account' : recipient.method === 'stripe' ? 'Stripe customer' : 'PayPal'} · {recipient.currency || 'USD'}</small></div><button type="button" onClick={() => { setSelectedRecipient(recipient.id); navigate('transfers') }}>Use recipient</button></div>) : <p className="empty-state">{recipients.length ? 'No recipients match your search.' : 'No recipients yet. Connect Stripe or add a recipient from the Transfers page.'}</p>}</div></article></section> : <section className={`dashboard-grid ${activePage !== 'overview' ? 'route-single' : ''}`}>
          <article className={`panel accounts-panel ${activePage !== 'overview' && activePage !== 'accounts' ? 'route-hidden' : ''}`} id="accounts">
            <div className="panel-heading"><div><h2>Connected accounts</h2><p>{accountData.length} providers · {accountCount} accounts</p></div><button className="quiet-button" type="button">Manage accounts</button></div>
            <div className="account-list">{accountData.length ? accountData.map((provider) => <section className="provider-group" key={provider.provider}><div className="provider-heading"><ProviderMark mark={provider.mark} tone={provider.tone} /><strong>{provider.provider}</strong><span>{provider.accounts.length} {provider.accounts.length === 1 ? 'account' : 'accounts'}</span></div>{provider.accounts.map((account) => <button className="account-row" type="button" key={account.nickname}><span className="account-copy"><strong>{account.nickname}</strong><small>{account.identifier}</small></span><span className="currency-balances">{account.currencies.map((currency) => <span key={currency.code}><em><span aria-hidden="true">{currency.flag}</span>{currency.code}</em><b>{currency.balance}</b></span>)}</span><span className="fx-total"><em>USD total</em><b>{account.fxTotal}</b></span><i>›</i></button>)}</section>) : <p className="empty-state">No connected accounts yet. Add a platform connection to begin.</p>}</div>
            <button className="connect-account" type="button" onClick={() => setShowProviderFlow(true)}><span>+</span> Add a provider</button>
          </article>

          <article className={`panel movement-panel ${activePage !== 'overview' && activePage !== 'transfers' ? 'route-hidden' : ''}`} id="transfers"><div className="panel-heading"><div><h2>Move money</h2><p>Choose a source and recipient</p></div><button className="quiet-button" type="button" onClick={() => setShowRecipientForm((visible) => !visible)}>{showRecipientForm ? 'Close' : 'Add recipient'}</button></div>{showRecipientForm && <form className="recipient-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const recipient = { id: `local_${crypto.randomUUID()}`, name: String(form.get('name')), destination: String(form.get('destination')), method: String(form.get('method')), currency: String(form.get('currency')) }; setRecipients((current) => [...current, recipient]); setSelectedRecipient(recipient.id); setShowRecipientForm(false); event.currentTarget.reset() }}><label>Name<input name="name" placeholder="Recipient name" required /></label><label>PayPal email or Venmo handle<input name="destination" placeholder="name@example.com or @handle" required /></label><label>Method<select name="method" defaultValue="paypal"><option value="paypal">PayPal</option><option value="venmo">Venmo</option></select></label><label>Destination currency<select name="currency" defaultValue="USD"><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label><button className="transfer-button" type="submit">Save recipient</button></form>}<div className="recipient-list">{recipients.length ? recipients.map((recipient) => <button className={`recipient-row ${selectedRecipient === recipient.id ? 'selected' : ''}`} type="button" key={recipient.id} onClick={() => setSelectedRecipient(recipient.id)}><span className={`recipient-avatar ${recipient.method}`}>{recipient.name.slice(0, 1).toUpperCase()}</span><span><strong>{recipient.name}</strong><small>{recipient.destination} · {recipient.method === 'venmo' ? 'Venmo' : recipient.method === 'stripe-account' ? 'Stripe recipient account' : recipient.method === 'stripe' ? 'Stripe customer' : 'PayPal'} · {recipient.currency || 'USD'}</small></span><i>{selectedRecipient === recipient.id ? '✓' : '›'}</i></button>) : <p className="empty-state">No recipients yet. Add one or connect Stripe.</p>}</div><div className="transfer-route"><div><ProviderMark mark="From" tone="boa" /><span><small>Source account</small><strong>{selectedSourceAccount?.nickname || (accountCount ? 'Select an account' : 'Connect an account first')}</strong></span></div><span className="route-arrow">↓</span><div><ProviderMark mark="To" tone="paypal" /><span><small>Recipient</small><strong>{selectedTransferRecipient?.name || 'Choose a recipient'}</strong></span></div></div><button className="transfer-button" type="button" onClick={() => { setSendMoneyStep(1); setShowSendMoneyModal(true) }} disabled={!accountCount || !recipients.length}>Send money <span>→</span></button><p className="settings-note">Stripe customers and Accounts v2 recipients are loaded from the connected Stripe account. Transfers remain gated until the destination provider is authorized.</p></article>

          <article className={`panel cash-flow ${activePage !== 'overview' && activePage !== 'insights' ? 'route-hidden' : ''}`}><div className="panel-heading"><div><h2>Cash flow</h2><p>Across all providers · Last 30 days</p></div><button className="quiet-button" type="button">View report</button></div><div className="chart-summary"><div><span>Inflow</span><strong>$32,420</strong></div><div><span>Outflow</span><strong>$12,842</strong></div><div className="net"><span>Net flow</span><strong>+$19,578</strong></div></div><div className="chart" aria-label="Cash flow chart"><div className="gridline g1" /><div className="gridline g2" /><div className="gridline g3" /><svg viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="Income rose over the month"><path className="area" d="M0,111 C45,101 56,120 92,104 S143,91 174,100 S218,61 254,78 S309,88 344,55 S395,61 431,42 S488,66 520,35 S568,45 600,11 L600,150 L0,150 Z" /><path className="line" d="M0,111 C45,101 56,120 92,104 S143,91 174,100 S218,61 254,78 S309,88 344,55 S395,61 431,42 S488,66 520,35 S568,45 600,11" /></svg><div className="chart-labels"><span>Aug 6</span><span>Aug 13</span><span>Aug 20</span><span>Aug 27</span><span>Sep 3</span></div></div></article>

          <article className={`panel activity-panel ${activePage !== 'overview' && activePage !== 'activity' ? 'route-hidden' : ''}`} id="activity"><div className="panel-heading"><div><h2>Recent activity</h2><p>Activity will appear after transfers are enabled</p></div></div><p className="empty-state">No activity yet.</p></article>
        </section>}
        {showProviderFlow && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowProviderFlow(false); setSelectedProvider(''); setEditingConnection(null) } }}><section className="provider-modal" role="dialog" aria-modal="true" aria-labelledby="provider-modal-title"><div className="modal-heading"><div><p className="eyebrow">{editingConnection ? 'Edit connection' : 'Add provider'}</p><h2 id="provider-modal-title">{selectedProvider ? `${editingConnection ? 'Edit' : 'Connect'} your provider` : 'Choose a provider'}</h2></div><button className="modal-close" type="button" aria-label="Close" onClick={() => { setShowProviderFlow(false); setSelectedProvider(''); setEditingConnection(null) }}>×</button></div>{!selectedProvider ? <div className="provider-options">{providerOptions.map((option) => { const details = providerDetails[option.id]; return <button className="provider-option" type="button" key={option.id} onClick={() => setSelectedProvider(option.id)}><ProviderMark mark={details.mark} tone={details.tone} /><span><strong>{option.name}</strong><small>{option.description}</small></span><i>›</i></button> })}</div> : selectedProvider === 'paypal' ? <div className="provider-step"><div className="provider-step-icon"><ProviderMark mark="P" tone="paypal" /></div><h3>Authorize PayPal</h3><p>PayPal authorization will let this account prepare PayPal and Venmo payment actions without storing a PayPal password.</p><button className="transfer-button" type="button" disabled>Continue with PayPal</button><p className="settings-note">OAuth callback setup is required before this can be enabled.</p><button className="modal-back" type="button" onClick={() => setSelectedProvider('')}>Choose another provider</button></div> : <form className="provider-step" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const nickname = String(form.get('nickname') || '').trim(); const apiKey = String(form.get('apiKey') || '').trim(); if (isDemoMode) { const demoConnection = { id: editingConnection?.id || `demo_${selectedProvider}_${Date.now()}`, provider: selectedProvider, label: nickname || providerOptions.find((option) => option.id === selectedProvider)?.name || selectedProvider, keyLast4: apiKey ? apiKey.slice(-4) : (editingConnection?.keyLast4 || 'demo'), connectedAt: editingConnection?.connectedAt || new Date().toISOString() }; setConnections((current) => editingConnection ? current.map((connection) => connection.id === editingConnection.id ? demoConnection : connection) : [...current, demoConnection]); setShowProviderFlow(false); setSelectedProvider(''); setEditingConnection(null); return } const response = await apiFetch(editingConnection ? `/platform-connections/${editingConnection.id}` : '/platform-connections', { method: editingConnection ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: selectedProvider, displayName: nickname || undefined, ...(apiKey ? { apiKey } : {}) }) }); if (!response.ok) { setApiError('The backend could not save this connection.'); return } setShowProviderFlow(false); setSelectedProvider(''); setEditingConnection(null); void refreshAccounts() }}><div className="provider-step-icon"><ProviderMark mark={providerDetails[selectedProvider].mark} tone={providerDetails[selectedProvider].tone} /></div><h3>{editingConnection ? `Edit ${editingConnection.label || providerOptions.find((option) => option.id === selectedProvider)?.name}` : `Connect ${providerOptions.find((option) => option.id === selectedProvider)?.name}`}</h3><p>Each connection stores its own key and nickname, so you can connect multiple accounts from the same platform.</p><label>Nickname<input name="nickname" type="text" placeholder="e.g. Production Stripe" autoComplete="off" maxLength={80} defaultValue={editingConnection?.label || ''} /></label><label>API key<input name="apiKey" type="password" placeholder={editingConnection ? 'Leave blank to keep current key' : 'Paste API key'} autoComplete="off" minLength={8} required={!editingConnection} /></label><button className="transfer-button" type="submit">{editingConnection ? 'Save changes' : 'Connect securely'}</button><button className="modal-back" type="button" onClick={() => { setSelectedProvider(''); setEditingConnection(null) }}>Choose another provider</button></form>}</section></div>}
        {showSendMoneyModal && <SendMoneyModal step={sendMoneyStep} setStep={setSendMoneyStep} sourceAccounts={sourceAccounts} sourceAccountId={sourceAccountId} setSourceAccountId={setSourceAccountId} recipients={recipients} selectedRecipient={selectedRecipient} setSelectedRecipient={setSelectedRecipient} amount={sendMoneyAmount} setAmount={setSendMoneyAmount} selectedSource={selectedSourceAccount} selectedTransferRecipient={selectedTransferRecipient} onClose={closeSendMoneyModal} />}
      </main>
    </div>
  )
}

function SendMoneyModal({ step, setStep, sourceAccounts, sourceAccountId, setSourceAccountId, recipients, selectedRecipient, setSelectedRecipient, amount, setAmount, selectedSource, selectedTransferRecipient, onClose }: { step: number; setStep: (step: number) => void; sourceAccounts: SourceAccount[]; sourceAccountId: string; setSourceAccountId: (id: string) => void; recipients: Recipient[]; selectedRecipient: string; setSelectedRecipient: (id: string) => void; amount: string; setAmount: (amount: string) => void; selectedSource?: SourceAccount; selectedTransferRecipient?: Recipient; onClose: () => void }) {
  const sourceCurrency = selectedSource?.currency || 'USD'
  const destinationCurrency = selectedTransferRecipient?.currency || 'USD'
  const conversionRequired = sourceCurrency !== destinationCurrency
  const conversionRate = (fxRates[sourceCurrency] || 1) / (fxRates[destinationCurrency] || 1)
  const destinationAmount = Number(amount || 0) * conversionRate
  const formatTransferAmount = (value: number, currency: string) => `${currencySymbols[currency] || ''}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
  const selectionComplete = Boolean(selectedSource && selectedTransferRecipient && Number(amount) > 0)

  return <div className="modal-backdrop transfer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="provider-modal send-money-modal" role="dialog" aria-modal="true" aria-labelledby="send-money-title"><div className="modal-heading"><div><p className="eyebrow">Send money · Step {step} of 2</p><h2 id="send-money-title">{step === 2 ? 'Review transfer' : 'Set up transfer'}</h2></div><button className="modal-close" type="button" aria-label="Close" onClick={onClose}>×</button></div><div className="step-indicator"><span className={step >= 1 ? 'active' : ''} /><span className={step >= 2 ? 'active' : ''} /></div>{step === 1 && <div className="provider-step"><h3>Where should the money go?</h3><label>Source account<select value={sourceAccountId} onChange={(event) => setSourceAccountId(event.target.value)}><option value="">Select an account</option>{sourceAccounts.map((account) => <option value={account.id} key={account.id}>{account.nickname} · {account.balance} {account.currency}</option>)}</select></label><label>Recipient<select value={selectedRecipient} onChange={(event) => setSelectedRecipient(event.target.value)}><option value="">Select a recipient</option>{recipients.map((recipient) => <option value={recipient.id} key={recipient.id}>{recipient.name} · {recipient.currency || 'USD'}</option>)}</select></label><label>Amount<input type="number" name="amount" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></label>{selectedSource && selectedTransferRecipient && <p className="settings-note">Sending from {sourceCurrency} to {destinationCurrency}. {conversionRequired ? 'Currency conversion will be applied.' : 'This is a like-for-like transfer.'}</p>}<button className="transfer-button" type="button" disabled={!selectionComplete} onClick={() => setStep(2)}>Review transfer <span>→</span></button></div>}{step === 2 && <div className="provider-step"><h3>Confirm what will happen</h3><div className={`transfer-diagram ${conversionRequired ? 'has-conversion' : ''}`}><div className="transfer-node"><small>Originates from</small><strong>{selectedSource?.nickname}</strong><span>{formatTransferAmount(Number(amount), sourceCurrency)}</span><em>{selectedSource?.provider}</em></div>{conversionRequired && <><span className="diagram-arrow">→</span><div className="conversion-node"><small>Currency conversion</small><strong>1 {sourceCurrency} = {conversionRate.toFixed(4)} {destinationCurrency}</strong><span>{formatTransferAmount(destinationAmount, destinationCurrency)} arrives</span><em>Indicative rate</em></div></>}<span className="diagram-arrow">→</span><div className="transfer-node"><small>Destination</small><strong>{selectedTransferRecipient?.name}</strong><span>{formatTransferAmount(conversionRequired ? destinationAmount : Number(amount), destinationCurrency)}</span><em>{selectedTransferRecipient?.method}</em></div></div><div className="review-list"><div><span>Recipient</span><strong>{selectedTransferRecipient?.destination}</strong></div><div><span>Delivery currency</span><strong>{destinationCurrency}</strong></div><div><span>Transfer type</span><strong>{conversionRequired ? 'Cross-currency conversion' : 'Like-for-like transfer'}</strong></div></div><div className="modal-actions"><button className="modal-back" type="button" onClick={() => setStep(1)}>Back</button><button className="transfer-button" type="button" disabled={!isDemoMode} onClick={onClose}>Submit transfer</button></div>{!isDemoMode && <p className="settings-note">Submission will be enabled after destination authorization and money-movement APIs are connected.</p>}</div>}</section></div>
}

export default App
