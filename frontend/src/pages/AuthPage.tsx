import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { Logo } from '../components/layout/Logo.tsx'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function AuthPage() {
  useDocumentTitle('Login')
  const { login } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 6) {
      setError('Use at least 6 characters for the password.')
      return
    }
    const displayName = mode === 'register' ? name.trim() : email.split('@')[0]
    login({ name: displayName || 'Customer', email })
    navigate('/')
  }

  return (
    <div className="bg-gradient-to-b from-cream to-canvas px-4 py-14 sm:py-20">
      <form onSubmit={submit} className="card mx-auto w-full max-w-md p-7 shadow-pop sm:p-9">
        <div className="text-center"><Logo className="mx-auto h-16 w-auto" /><h1 className="mt-4 text-2xl font-extrabold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1><p className="mt-1 text-sm text-muted">Track orders, save favourites and check out faster.</p></div>
        <div className="mt-6 grid grid-cols-2 rounded-full bg-canvas p-1 text-sm font-bold">
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-full py-2.5 transition ${mode === item ? 'bg-white text-brand shadow-sm' : 'text-muted'}`}
            >
              {item === 'login' ? 'Login' : 'Register'}
            </button>
          ))}
        </div>
        {mode === 'register' && (
          <label className="mt-4 block text-[13px] font-bold text-ink-soft">
            Full name
            <input required value={name} onChange={(event) => setName(event.target.value)} className="field mt-1.5" />
          </label>
        )}
        <label className="mt-4 block text-[13px] font-bold text-ink-soft">
          Email
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="field mt-1.5" />
        </label>
        <label className="mt-4 block text-[13px] font-bold text-ink-soft">
          Password
          <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="field mt-1.5" />
        </label>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <button type="submit" className="btn btn-accent btn-lg mt-6 w-full">
          {mode === 'login' ? 'Login' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
