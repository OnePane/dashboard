import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const client = supabase
  const [session, setSession] = useState<Awaited<ReturnType<NonNullable<typeof supabase>['auth']['getSession']>>['data']['session']>(null)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!client) return
    void client.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (!client) return <div className="auth-shell"><h1>Configuration required</h1><p>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p></div>
  if (session) return <>{children}</>

  async function submit(event: FormEvent<HTMLFormElement>) {
    if (!client) return
    event.preventDefault(); setError(''); setMessage('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')); const password = String(form.get('password')); const fullName = String(form.get('fullName') || '')
    const result = mode === 'signup'
      ? await client.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      : await client.auth.signInWithPassword({ email, password })
    if (result.error) setError(result.error.message)
    else if (mode === 'signup' && !result.data.session) setMessage('Check your email to confirm your account.')
  }

  return <main className="auth-shell"><div className="auth-card"><span className="auth-brand">o onepane</span><h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1><p>{mode === 'signup' ? 'Connect your financial platforms in one place.' : 'Sign in to view your connected accounts.'}</p><form onSubmit={submit}>{mode === 'signup' && <input name="fullName" placeholder="Full name" autoComplete="name" required />}<input name="email" type="email" placeholder="Email" autoComplete="email" required /><input name="password" type="password" placeholder="Password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required /><button type="submit">{mode === 'signup' ? 'Create account' : 'Sign in'} →</button></form>{error && <p className="auth-error">{error}</p>}{message && <p className="auth-message">{message}</p>}<button className="auth-toggle" type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>{mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}</button></div></main>
}
