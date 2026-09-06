import { useEffect, useState } from 'react'

const accounts = [
  {
    provider: 'Bank of America', mark: 'BofA', tone: 'boa',
    accounts: [
      { nickname: 'Operating', identifier: '···· 4821', currencies: [{ code: 'USD', flag: '🇺🇸', balance: '$218,402.42' }], fxTotal: '$218,402.42' },
      { nickname: 'Europe reserve', identifier: '···· 9204', currencies: [{ code: 'EUR', flag: '🇪🇺', balance: '€18,450.00' }, { code: 'USD', flag: '🇺🇸', balance: '$4,120.00' }], fxTotal: '$24,046.00' },
    ],
  },
  {
    provider: 'Stripe', mark: 'S', tone: 'stripe',
    accounts: [{ nickname: 'Online sales', identifier: 'Primary', currencies: [{ code: 'USD', flag: '🇺🇸', balance: '$42,196.00' }, { code: 'GBP', flag: '🇬🇧', balance: '£7,820.00' }], fxTotal: '$52,127.40' }],
  },
  {
    provider: 'Venmo', mark: 'V', tone: 'venmo',
    accounts: [{ nickname: 'Business wallet', identifier: '@acme', currencies: [{ code: 'USD', flag: '🇺🇸', balance: '$23,634.00' }], fxTotal: '$23,634.00' }],
  },
]

const activity = [
  { name: 'Stripe payout', detail: 'Stripe → Bank of America', amount: '+$4,820.00', date: 'Today, 10:42 AM', mark: 'S', tone: 'stripe', positive: true },
  { name: 'Wire transfer', detail: 'Bank of America → Mercury', amount: '-$12,500.00', date: 'Yesterday', mark: 'BofA', tone: 'boa' },
  { name: 'Client payment', detail: 'Venmo business payment', amount: '+$1,340.00', date: 'Sep 3', mark: 'V', tone: 'venmo', positive: true },
]

function ProviderMark({ mark, tone }: { mark: string; tone: string }) {
  return <span className={`provider-mark ${tone}`}>{mark}</span>
}

const flags: Record<string, string> = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' }
const fxRates: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27 }
const formatUsd = (minor: number) => `$${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
type ApiBalance = { currency: string; amount: number }
type ApiAccount = { nickname: string; id: string; balances: ApiBalance[] }
type ApiProvider = { name: string; accounts: ApiAccount[] }

function App() {
  const [showApiKeyForm, setShowApiKeyForm] = useState(false)
  const [activePage, setActivePage] = useState<'overview' | 'connections'>('overview')
  const [accountData, setAccountData] = useState(accounts)

  const refreshAccounts = () => fetch('/v1/dashboard?userId=cus_demo').then((response) => response.json()).then((payload: { data?: { providers?: ApiProvider[] } }) => {
      if (!payload.data?.providers?.length) return
      setAccountData(payload.data.providers.map((provider) => ({ provider: provider.name, mark: provider.name === 'Stripe' ? 'S' : provider.name === 'Venmo' ? 'V' : 'BofA', tone: provider.name === 'Stripe' ? 'stripe' : provider.name === 'Venmo' ? 'venmo' : 'boa', accounts: provider.accounts.map((account) => ({ nickname: account.nickname, identifier: account.id, currencies: account.balances.map((balance) => ({ code: balance.currency, flag: flags[balance.currency] || '🌐', balance: `${balance.currency === 'EUR' ? '€' : balance.currency === 'GBP' ? '£' : '$'}${(balance.amount / 100).toLocaleString()}` })), fxTotal: formatUsd(account.balances.reduce((total, balance) => total + balance.amount * (fxRates[balance.currency] || 1), 0)) })) })))
    }).catch(() => undefined)

  useEffect(() => { void refreshAccounts() }, [])

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
          <div className="top-actions"><button className="icon-button" type="button" aria-label="Notifications">◌</button><button className="new-button" type="button">Move money <span>→</span></button></div>
        </header>

        <section className="balance-section" aria-labelledby="balance-heading">
          <p id="balance-heading" className="eyebrow">Total connected balance</p>
          <div className="balance-line"><h2>$318,209.82</h2><span className="balance-change">↑ 12.6% <small>from last month</small></span></div>
          <p className="base-currency">USD equivalent · using live FX rates</p>
          <p className="connected-status"><span /> All accounts synced just now</p>
        </section>

        <section className="dashboard-grid">
          <article className="panel accounts-panel" id="accounts">
            <div className="panel-heading"><div><h2>Connected accounts</h2><p>3 providers · 4 accounts · 4 currencies</p></div><button className="quiet-button" type="button">Manage accounts</button></div>
            <div className="account-list">{accountData.map((provider) => <section className="provider-group" key={provider.provider}><div className="provider-heading"><ProviderMark mark={provider.mark} tone={provider.tone} /><strong>{provider.provider}</strong><span>{provider.accounts.length} {provider.accounts.length === 1 ? 'account' : 'accounts'}</span></div>{provider.accounts.map((account) => <button className="account-row" type="button" key={account.nickname}><span className="account-copy"><strong>{account.nickname}</strong><small>{account.identifier}</small></span><span className="currency-balances">{account.currencies.map((currency) => <span key={currency.code}><em><span aria-hidden="true">{currency.flag}</span>{currency.code}</em><b>{currency.balance}</b></span>)}</span><span className="fx-total"><em>USD total</em><b>{account.fxTotal}</b></span><i>›</i></button>)}</section>)}</div>
            <button className="connect-account" type="button"><span>+</span> Connect an account</button>
          </article>

          <article className="panel connections-panel" id="settings">
            <div className="panel-heading"><div><h2>Platform connections</h2><p>Credentials and sync status</p></div><button className="quiet-button" type="button" onClick={() => setShowApiKeyForm((visible) => !visible)}>{showApiKeyForm ? 'Close' : 'Add platform'}</button></div>
            {showApiKeyForm && <form className="api-key-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await fetch('/v1/platform-connections', { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': 'cus_demo' }, body: JSON.stringify({ provider: form.get('provider'), apiKey: form.get('apiKey') }) }); setShowApiKeyForm(false); void refreshAccounts() }}><label>Platform<select name="provider" defaultValue=""><option value="" disabled>Select a platform</option><option value="bank-of-america">Bank of America</option><option value="stripe">Stripe</option><option value="venmo">Venmo</option></select></label><label>API key<input name="apiKey" type="password" placeholder="Paste an API key" autoComplete="off" /></label><button className="transfer-button" type="submit">Connect securely</button><small>Connect this form to a server-side secret store; keys should never be persisted in the browser.</small></form>}
            <div className="connection-list"><div className="connection"><ProviderMark mark="BofA" tone="boa" /><div><strong>Bank of America</strong><small>Client ID ···· 4K2A · Synced just now</small></div><button type="button">Manage</button></div><div className="connection"><ProviderMark mark="S" tone="stripe" /><div><strong>Stripe</strong><small>Restricted key ···· P8x9 · Synced 2 min ago</small></div><button type="button">Manage</button></div><div className="connection"><ProviderMark mark="V" tone="venmo" /><div><strong>Venmo</strong><small>Access token ···· Gx72 · Synced 6 min ago</small></div><button type="button">Manage</button></div></div>
          </article>

          <article className="panel movement-panel"><div className="panel-heading"><div><h2>Move money</h2><p>Between your connected accounts</p></div></div><div className="transfer-route"><div><ProviderMark mark="BofA" tone="boa" /><span><small>From</small><strong>Operating account</strong></span></div><span className="route-arrow">↓</span><div><ProviderMark mark="S" tone="stripe" /><span><small>To</small><strong>Stripe balance</strong></span></div></div><button className="transfer-button" type="button">Start a transfer <span>→</span></button></article>

          <article className="panel cash-flow"><div className="panel-heading"><div><h2>Cash flow</h2><p>Across all providers · Last 30 days</p></div><button className="quiet-button" type="button">View report</button></div><div className="chart-summary"><div><span>Inflow</span><strong>$32,420</strong></div><div><span>Outflow</span><strong>$12,842</strong></div><div className="net"><span>Net flow</span><strong>+$19,578</strong></div></div><div className="chart" aria-label="Cash flow chart"><div className="gridline g1" /><div className="gridline g2" /><div className="gridline g3" /><svg viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="Income rose over the month"><path className="area" d="M0,111 C45,101 56,120 92,104 S143,91 174,100 S218,61 254,78 S309,88 344,55 S395,61 431,42 S488,66 520,35 S568,45 600,11 L600,150 L0,150 Z" /><path className="line" d="M0,111 C45,101 56,120 92,104 S143,91 174,100 S218,61 254,78 S309,88 344,55 S395,61 431,42 S488,66 520,35 S568,45 600,11" /></svg><div className="chart-labels"><span>Aug 6</span><span>Aug 13</span><span>Aug 20</span><span>Aug 27</span><span>Sep 3</span></div></div></article>

          <article className="panel activity-panel" id="activity"><div className="panel-heading"><div><h2>Recent activity</h2><p>Across all providers</p></div><button className="quiet-button" type="button">See all</button></div><div className="activity-list">{activity.map((item) => <div className="activity" key={item.name}><ProviderMark mark={item.mark} tone={item.tone} /><div><strong>{item.name}</strong><small>{item.detail} · {item.date}</small></div><b className={item.positive ? 'positive' : ''}>{item.amount}</b></div>)}</div></article>
        </section>
      </main>
    </div>
  )
}

export default App
