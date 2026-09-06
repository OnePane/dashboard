import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`
type Profile = { first_name: string | null; last_name: string | null; username: string | null; company_name: string | null }

async function fetchProfile(accessToken: string) {
  const response = await fetch(`${apiBaseUrl}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Could not load your profile.')
  const payload = await response.json() as { data: Profile }
  return payload.data
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const client = supabase
  const [session, setSession] = useState<Awaited<ReturnType<NonNullable<typeof supabase>['auth']['getSession']>>['data']['session']>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadProfile(nextSession: typeof session) {
    if (!nextSession) { setProfile(null); return }
    try { setProfile(await fetchProfile(nextSession.access_token)) } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load your profile.') }
  }

  useEffect(() => {
    if (!client) return
    void client.auth.getSession().then(async ({ data }) => { setSession(data.session); await loadProfile(data.session) })
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => { setSession(next); void loadProfile(next) })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (!client) return <div className="auth-shell"><h1>Configuration required</h1><p>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p></div>
  if (session && (!profile || profile.username?.startsWith('user_') || !profile.first_name || !profile.last_name)) return <ProfileSetup session={session} profile={profile} onComplete={(nextProfile) => setProfile(nextProfile)} />
  if (session) return <>{children}</>

  async function submit(event: FormEvent<HTMLFormElement>) {
    if (!client) return
    event.preventDefault(); setError(''); setMessage('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')); const password = String(form.get('password'))
    const result = mode === 'signup' ? await client.auth.signUp({ email, password }) : await client.auth.signInWithPassword({ email, password })
    if (result.error) setError(result.error.message)
    else if (mode === 'signup' && !result.data.session) setMessage('Check your email to confirm your account, then sign in to finish your profile.')
  }

  return <main className="auth-shell"><div className="auth-card"><span className="auth-brand">o onepane</span><h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1><p>{mode === 'signup' ? 'Start with your email and password.' : 'Sign in to view your connected accounts.'}</p><form onSubmit={submit}><input name="email" type="email" placeholder="Email" autoComplete="email" required /><input name="password" type="password" placeholder="Password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required /><button type="submit">{mode === 'signup' ? 'Create account' : 'Sign in'} →</button></form>{error && <p className="auth-error">{error}</p>}{message && <p className="auth-message">{message}</p>}<button className="auth-toggle" type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>{mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}</button></div></main>
}

function ProfileSetup({ session, profile, onComplete }: { session: NonNullable<Awaited<ReturnType<NonNullable<typeof supabase>['auth']['getSession']>>['data']['session']>; profile: Profile | null; onComplete: (profile: Profile) => void }) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('')
    const form = new FormData(event.currentTarget)
    const firstName = String(form.get('firstName')).trim(); const lastName = String(form.get('lastName')).trim(); const username = String(form.get('username')).trim()
    try {
      const response = await fetch(`${apiBaseUrl}/profile`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ firstName, lastName, username }) })
      const payload = await response.json() as { data?: Profile; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || 'Could not save your profile.')
      await supabase?.auth.updateUser({ data: { first_name: firstName, last_name: lastName, username, full_name: `${firstName} ${lastName}` } })
      onComplete(payload.data)
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save your profile.') } finally { setSaving(false) }
  }
  return <main className="auth-shell"><div className="auth-card"><span className="auth-brand">o onepane</span><h1>Complete your profile</h1><p>Choose the name and unique username other people will see.</p><form onSubmit={submit}><div className="auth-name-fields"><input name="firstName" placeholder="First name" defaultValue={profile?.first_name || ''} autoComplete="given-name" required /><input name="lastName" placeholder="Last name" defaultValue={profile?.last_name || ''} autoComplete="family-name" required /></div><input name="username" placeholder="Username" defaultValue={profile?.username?.startsWith('user_') ? '' : (profile?.username || '')} autoComplete="username" pattern="[A-Za-z0-9_]{3,32}" minLength={3} maxLength={32} required /><small className="profile-help">3–32 characters: letters, numbers, and underscores.</small><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'} →</button></form>{error && <p className="auth-error">{error}</p>}</div></main>
}
