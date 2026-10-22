import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLink, AuthShell, FormError, FormField, IconField, PasswordInput, PasswordStrength } from '../components/auth/AuthShell.tsx'
import { LockIcon } from '../components/icons.tsx'
import { api, errorMessage } from '../lib/api.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password', { noindex: true })
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters')
    if (password !== confirm) return setError('The two passwords do not match')
    setBusy(true)
    setError('')
    try {
      await api('/auth/reset-password', { body: { token, password } })
      setDone(true)
      window.setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthShell title="Link not valid" subtitle="This password reset link is missing its code." footer={<AuthLink to="/forgot-password">Request a new link</AuthLink>}>
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">Open the link from your email again, or ask for a new one.</p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Pick something you have not used before." footer={<AuthLink to="/login">← Back to log in</AuthLink>}>
      {done ? (
        <div className="motion-panel rounded-2xl bg-emerald-50 p-6 text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 font-extrabold text-success">Password updated</p>
          <p className="mt-1 text-sm text-ink-soft">Taking you to log in…</p>
          <Link to="/login" className="btn btn-brand btn-sm mt-4">
            Log in now
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <FormField label="New password">
            <IconField icon={<LockIcon className="size-[18px]" />}>
              <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} autoComplete="new-password" placeholder="At least 8 characters" autoFocus />
            </IconField>
            <PasswordStrength password={password} />
          </FormField>
          <FormField label="Confirm new password">
            <IconField icon={<LockIcon className="size-[18px]" />}>
              <PasswordInput value={confirm} onChange={(e) => { setConfirm(e.target.value); setError('') }} autoComplete="new-password" />
            </IconField>
          </FormField>
          <FormError message={error} />
          <button type="submit" disabled={busy} className="btn btn-accent btn-lg w-full">
            Update password
          </button>
          <p className="text-center text-xs text-muted">You will be signed out on all devices.</p>
        </form>
      )}
    </AuthShell>
  )
}
