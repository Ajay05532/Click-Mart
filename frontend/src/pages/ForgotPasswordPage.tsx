import { useState, type FormEvent } from 'react'
import { AuthLink, AuthShell, FormError, FormField } from '../components/auth/AuthShell.tsx'
import { api, errorMessage } from '../lib/api.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function ForgotPasswordPage() {
  useDocumentTitle('Forgot password')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email you signed up with')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api('/auth/forgot-password', { body: { email: email.trim() } })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we will send you a link to choose a new one." footer={<AuthLink to="/login">← Back to log in</AuthLink>}>
      {sent ? (
        <div className="motion-panel rounded-2xl bg-emerald-50 p-6 text-center">
          <p className="text-3xl">📬</p>
          <p className="mt-2 font-extrabold text-success">Check your inbox</p>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            If <span className="font-bold">{email}</span> has an account, a reset link is on its way. It works once and expires in 30 minutes.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <FormField label="Email">
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} autoComplete="email" className="field" aria-invalid={!!error} placeholder="you@example.com" autoFocus />
          </FormField>
          <FormError message={error} />
          <button type="submit" disabled={busy} className="btn btn-accent btn-lg w-full">
            Send reset link
          </button>
        </form>
      )}
    </AuthShell>
  )
}
