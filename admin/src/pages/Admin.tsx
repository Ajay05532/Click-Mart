import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { AdminOnly } from '../Layout.tsx'
import { label } from '../format.ts'
import { useAction } from '../hooks.ts'
import { Badge, Button, Card, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Select, Table, Td, useUi } from '../ui.tsx'

/* ---------------- Team ---------------- */
type Member = { id: string; name: string; email: string; role: 'ADMIN' | 'STAFF'; isBlocked: boolean; createdAt: string; permissions: string[] }
type Team = { items: Member[]; permissions: Record<string, string>; presets: Record<string, { label: string; permissions: string[] }> }
const permissionName: Record<string, string> = { orders: 'Orders', catalog: 'Products', inventory: 'Stock', marketing: 'Marketing', support: 'Support', customers: 'Customers', reports: 'Reports' }

export function StaffPage() {
  const { user } = useAuth()
  const { confirm } = useUi()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const query = useQuery({ queryKey: ['staff'], queryFn: () => api<Team>('/admin/staff') })
  const update = useAction((args: { id: string; role?: string; isBlocked?: boolean }) => api(`/admin/staff/${args.id}`, { method: 'PATCH', body: { role: args.role, isBlocked: args.isBlocked } }), { success: 'Team updated', invalidate: ['staff'] })
  return (
    <AdminOnly>
      <PageHeader title="Team" subtitle="Choose what each person can open. Administrators always see everything, including money, settings and the team." actions={<Button variant="accent" onClick={() => setAdding(true)}>+ Add team member</Button>} />
      <Card>
        {query.isLoading ? <PageLoader /> : query.error || !query.data ? <ErrorState error={query.error} /> : (
          <Table head={['Name', 'Role', 'Can open', 'Status', '']}>
            {query.data.items.map((m) => (
              <tr key={m.id}>
                <Td><p className="font-bold">{m.name} {m.id === user?.id && <Badge tone="blue">You</Badge>}</p><p className="text-xs text-muted">{m.email}</p></Td>
                <Td>{m.id === user?.id ? <Badge tone="dark">{label(m.role)}</Badge> : <Select value={m.role} onChange={(e) => update.mutate({ id: m.id, role: e.target.value })} className="!h-8 !w-32 !text-xs" aria-label={`Role for ${m.name}`}><option value="STAFF">Staff</option><option value="ADMIN">Admin</option><option value="CUSTOMER">Remove access</option></Select>}</Td>
                <Td className="max-w-xs">
                  {m.role === 'ADMIN' ? <span className="text-xs font-semibold text-muted">Everything</span> : m.permissions.length === 0 ? <span className="text-xs text-rose-600">Nothing yet</span> : (
                    <div className="flex flex-wrap gap-1">{m.permissions.map((key) => <Badge key={key} tone={key === 'reports' ? 'orange' : 'blue'}>{permissionName[key] ?? key}</Badge>)}</div>
                  )}
                </Td>
                <Td>{m.isBlocked ? <Badge tone="red">Blocked</Badge> : <Badge tone="green">Active</Badge>}</Td>
                <Td className="text-right whitespace-nowrap">
                  {m.role === 'STAFF' && m.id !== user?.id && <Button size="sm" variant="soft" onClick={() => setEditing(m)}>Edit access</Button>}
                  {m.id !== user?.id && <Button size="sm" variant="ghost" onClick={async () => { if (m.isBlocked || await confirm({ title: `Block ${m.name}?`, text: 'They will be signed out immediately.', confirmLabel: 'Block', danger: true })) update.mutate({ id: m.id, isBlocked: !m.isBlocked }) }}>{m.isBlocked ? 'Unblock' : 'Block'}</Button>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {adding && query.data && <AddMember team={query.data} onClose={() => setAdding(false)} />}
      {editing && query.data && <AccessModal member={editing} team={query.data} onClose={() => setEditing(null)} />}
    </AdminOnly>
  )
}

/** Checkboxes plus quick presets (Packer, Support agent...) for what a staff member can open. */
function AccessPicker({ team, value, onChange }: { team: Team; value: string[]; onChange: (value: string[]) => void }) {
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((key) => b.includes(key))
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-bold text-ink-soft">Quick set-up</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(team.presets).map(([id, preset]) => (
            <button key={id} type="button" aria-pressed={same(value, preset.permissions)} onClick={() => onChange(preset.permissions)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${same(value, preset.permissions) ? 'bg-ink text-white' : 'bg-canvas text-ink-soft hover:bg-brand-soft hover:text-brand'}`}>{preset.label}</button>
          ))}
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 text-xs font-bold text-ink-soft">They can open</legend>
        <div className="space-y-1.5">
          {Object.entries(team.permissions).map(([key, text]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2 ring-1 ring-line hover:bg-canvas/60">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" checked={value.includes(key)} onChange={(event) => onChange(event.target.checked ? [...value, key] : value.filter((item) => item !== key))} />
              <span><span className="block text-sm font-bold">{permissionName[key] ?? key}</span><span className="block text-xs text-muted">{text}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted">Coupons, refunds, analytics, settings, the team and the activity log stay with administrators.</p>
    </div>
  )
}

function AccessModal({ member, team, onClose }: { member: Member; team: Team; onClose: () => void }) {
  const [value, setValue] = useState(member.permissions)
  const save = useAction(() => api(`/admin/staff/${member.id}`, { method: 'PATCH', body: { permissions: value } }), { success: 'Access updated', invalidate: ['staff'], onDone: onClose })
  return (
    <Modal title={`What can ${member.name.split(' ')[0]} open?`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save access</Button></>}>
      <AccessPicker team={team} value={value} onChange={setValue} />
    </Modal>
  )
}

function AddMember({ team, onClose }: { team: Team; onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'STAFF' })
  const [permissions, setPermissions] = useState<string[]>(['orders', 'catalog', 'inventory', 'marketing', 'support', 'customers'])
  const save = useAction(() => api('/admin/staff', { body: { ...f, ...(f.role === 'STAFF' ? { permissions } : {}) } }), { success: 'Team member added', invalidate: ['staff'], onDone: onClose })
  const invalid = f.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(f.email) || f.password.length < 8
  return (
    <Modal title="Add team member" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(undefined)}>Add member</Button></>}>
      <div className="space-y-4">
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary password" hint="At least 8 characters. Ask them to change it after signing in."><Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="STAFF">Staff: only what you allow below</option><option value="ADMIN">Admin: everything</option></Select></Field>
        {f.role === 'STAFF' && <AccessPicker team={team} value={permissions} onChange={setPermissions} />}
      </div>
    </Modal>
  )
}
