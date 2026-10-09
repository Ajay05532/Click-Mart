import { useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth.tsx'
import { Badge, Button, Card, Field, Input, PageHeader, errorMessage, useUi } from '../ui.tsx'
import { assetUrl } from '../api.ts'

export function AccountPage() {
  const { user, updateProfile, uploadAvatar, removeAvatar, changePassword, logout } = useAuth()
  const { toast } = useUi()
  const [name, setName] = useState(user?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [changing, setChanging] = useState(false)
  const photo = useRef<HTMLInputElement>(null)
  if (!user) return null

  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await updateProfile({ name: name.trim() })
      toast('Profile updated')
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const savePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (!pw.current) return setPwError('Enter your current password')
    if (pw.next.length < 8) return setPwError('Use at least 8 characters for the new password')
    if (pw.next !== pw.confirm) return setPwError('The two new passwords do not match')
    if (pw.next === pw.current) return setPwError('Choose a password you are not using already')
    setChanging(true)
    setPwError('')
    try {
      await changePassword(pw.current, pw.next)
      setPw({ current: '', next: '', confirm: '' })
      toast('Password changed. Other devices were signed out.')
    } catch (error) {
      setPwError(errorMessage(error))
    } finally {
      setChanging(false)
    }
  }

  return (
    <>
      <PageHeader title="My account" subtitle="Your sign-in details." actions={<Button variant="outline" onClick={() => void logout()}>Sign out</Button>} />
      <div className="grid max-w-3xl gap-6">
        <Card className="p-6">
          <h2 className="font-extrabold">Profile</h2>
          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft text-lg font-extrabold text-brand">
              {user.avatarUrl ? <img src={assetUrl(user.avatarUrl)} alt="" className="size-full object-cover" /> : user.name.slice(0, 1).toUpperCase()}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => photo.current?.click()}>Upload photo</Button>
            {user.avatarUrl && <Button type="button" variant="ghost" size="sm" onClick={() => void removeAvatar().then(() => toast('Photo removed')).catch((error) => toast(errorMessage(error), 'error'))}>Remove</Button>}
            <input ref={photo} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file).then(() => toast('Photo updated')).catch((error) => toast(errorMessage(error), 'error')); event.target.value = '' }} />
          </div>
          <form onSubmit={saveName} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>
            <Field label="Email" hint="Your email is your login and cannot be changed here."><Input value={user.email} disabled /></Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" variant="accent" loading={saving} disabled={name.trim() === user.name || name.trim().length < 2}>Save</Button>
              <span className="text-xs text-muted">Role: <Badge tone={user.role === 'ADMIN' ? 'dark' : 'blue'}>{user.role === 'ADMIN' ? 'Administrator' : 'Staff'}</Badge></span>
            </div>
          </form>
        </Card>
        <Card className="p-6">
          <h2 className="font-extrabold">Change password</h2>
          <p className="mt-1 text-sm text-muted">You will need your current password. Your other devices are signed out afterwards.</p>
          <form onSubmit={savePassword} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Current password" className="sm:col-span-2"><Input type="password" value={pw.current} onChange={(e) => { setPw({ ...pw, current: e.target.value }); setPwError('') }} autoComplete="current-password" /></Field>
            <Field label="New password"><Input type="password" value={pw.next} onChange={(e) => { setPw({ ...pw, next: e.target.value }); setPwError('') }} autoComplete="new-password" /></Field>
            <Field label="Confirm new password"><Input type="password" value={pw.confirm} onChange={(e) => { setPw({ ...pw, confirm: e.target.value }); setPwError('') }} autoComplete="new-password" /></Field>
            {pwError && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 sm:col-span-2">{pwError}</p>}
            <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={changing}>Update password</Button></div>
          </form>
        </Card>
      </div>
    </>
  )
}
