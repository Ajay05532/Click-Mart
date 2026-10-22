import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLink, AuthShell, FormError, FormField, IconField, PasswordInput, PasswordStrength } from '../components/auth/AuthShell.tsx'
import { CodeInput } from '../components/auth/CodeInput.tsx'
import { CheckIcon, LockIcon } from '../components/icons.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { useNotice } from '../context/NoticeContext.tsx'
import { errorMessage } from '../lib/api.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

const RESEND_SECONDS = 30
/** Only follow in-app paths, never an address someone put in the URL. */
const safeNext = (value: unknown) => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/')

/** Sign-up, after the details form: confirm the emailed code, then choose the password. */
export function VerifyEmailPage() {
  const { user, loading, verifyEmail, completeSignup, resendVerification } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const email = (params.get('email') ?? '').trim()
  const next = safeNext(params.get('next'))
  const notify = useNotice()
  const [setupToken, setSetupToken] = useState('')
  useDocumentTitle(setupToken ? 'Create your password' : 'Confirm your email', { noindex: true })
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [minutes, setMinutes] = useState(10)
  const [wait, setWait] = useState(RESEND_SECONDS)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  if (!loading && user) return <Navigate to={next} replace />
  if (!email) return <Navigate to="/login" replace />

  const verify = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return setError('Enter all 6 digits')
    setBusy(true)
    setError('')
    try {
      const result = await verifyEmail(email, value)
      setSetupToken(result.setupToken)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await resendVerification(email)
      setMinutes(result.expiresInMinutes)
      setCode('')
      setWait(RESEND_SECONDS)
      setResent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (setupToken) {
    return (
      <AuthShell title="Create your password" subtitle={`Email confirmed: ${email}. Choose a password to finish setting up your account.`}>
        <Steps current={2} />
        <PasswordStep
          onSubmit={async (password) => {
            const created = await completeSignup(setupToken, password)
            const first = created.name.trim().split(/\s+/)[0]
            notify({ title: first ? `Welcome to ClickMart, ${first}!` : 'Welcome to ClickMart!', text: 'Your account is ready and you are logged in.' })
            navigate(next, { replace: true })
          }}
        />
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Confirm your email" subtitle={`We sent a 6-digit code to ${email}. It expires in ${minutes} minutes.`} footer={<AuthLink to="/login">← Back to log in</AuthLink>}>
      <Steps current={1} />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void verify()
        }}
        noValidate
        className="space-y-5"
      >
        <CodeInput
          value={code}
          disabled={busy}
          invalid={!!error}
          onChange={(value) => {
            setCode(value)
            setError('')
            setResent(false)
            if (value.length === 6) void verify(value)
          }}
        />
        <FormError message={error} />
        {resent && !error && <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-success">New code sent. Check your email.</p>}
        <button type="submit" disabled={busy || code.length !== 6} className="btn btn-accent btn-lg w-full">
          {busy ? 'Checking…' : 'Confirm email'}
        </button>
        <div className="flex items-center justify-center gap-2 text-sm">
          {wait > 0 ? (
            <span className="text-muted tabular-nums">Resend code in {wait}s</span>
          ) : (
            <button type="button" disabled={busy} onClick={() => void resend()} className="font-bold text-brand hover:underline">
              Resend code
            </button>
          )}
        </div>
        <p className="rounded-xl bg-canvas px-3 py-2.5 text-xs leading-5 text-muted">Not in your inbox? Check spam or promotions. Next you will create your password.</p>
      </form>
    </AuthShell>
  )
}

function Steps({ current }: { current: 1 | 2 }) {
  return (
    <ol className="mb-6 flex items-center gap-3 text-xs font-bold" aria-label={`Step ${current} of 2`}>
      {['Confirm email', 'Create password'].map((label, index) => {
        const step = index + 1
        const done = step < current
        const active = step === current
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] ${done ? 'bg-success text-white' : active ? 'bg-brand text-white' : 'bg-canvas text-muted ring-1 ring-line'}`}>
              {done ? <CheckIcon className="size-3.5" /> : step}
            </span>
            <span className={`truncate ${active ? 'text-ink' : 'text-muted'}`}>{label}</span>
            {step === 1 && <span aria-hidden="true" className={`h-0.5 min-w-4 flex-1 rounded-full ${done ? 'bg-success' : 'bg-line'}`} />}
          </li>
        )
      })}
    </ol>
  )
}

function PasswordStep({ onSubmit }: { onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const longEnough = password.length >= 8
  const matches = confirm.length > 0 && confirm === password

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found: typeof errors = {}
    if (!longEnough) found.password = 'Use at least 8 characters'
    if (!confirm) found.confirm = 'Type the password again'
    else if (confirm !== password) found.confirm = 'The passwords do not match'
    setErrors(found)
    if (found.password || found.confirm) return
    setBusy(true)
    setFormError('')
    try {
      await onSubmit(password)
    } catch (error) {
      setFormError(errorMessage(error))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <FormField label="Create password" error={errors.password}>
        <IconField icon={<LockIcon className="size-[18px]" />}>
          <PasswordInput
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setErrors({})
              setFormError('')
            }}
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            placeholder="At least 8 characters"
            autoFocus
          />
        </IconField>
        <PasswordStrength password={password} />
      </FormField>
      <FormField label="Confirm password" error={errors.confirm}>
        <IconField icon={<LockIcon className="size-[18px]" />}>
          <PasswordInput
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              setErrors({})
              setFormError('')
            }}
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            placeholder="Type it again"
          />
        </IconField>
      </FormField>
      <ul className="space-y-1.5 text-xs font-semibold">
        <Rule ok={longEnough}>At least 8 characters</Rule>
        <Rule ok={matches}>Both passwords match</Rule>
      </ul>
      <FormError message={formError} />
      <button type="submit" disabled={busy} className="btn btn-accent btn-lg w-full">
        {busy ? <span className="motion-spin size-4 rounded-full border-2 border-white border-t-transparent" /> : null}
        {busy ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  )
}

function Rule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? 'text-success' : 'text-muted'}`}>
      <span className={`grid size-4 place-items-center rounded-full ${ok ? 'bg-success text-white' : 'ring-1 ring-line'}`}>{ok && <CheckIcon className="size-3" />}</span>
      {children}
    </li>
  )
}
