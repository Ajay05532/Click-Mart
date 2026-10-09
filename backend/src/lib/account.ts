import { exec, from, maybe, one, rows } from './db.js'
import { notFound } from './errors.js'
import type { Role, User } from './types.js'

/** Which profile table holds the name and phone for a role. */
export function profileTable(role: Role): 'Customer' | 'Staff' | 'Admin' {
  if (role === 'ADMIN') return 'Admin'
  if (role === 'STAFF') return 'Staff'
  return 'Customer'
}

/** Login plus the matching profile. passwordHash is included; never send it to the client. */
export const findAccountById = (id: string) => maybe<User>(from('Person').select('*').eq('id', id).maybeSingle())

export const findAccountByEmail = (email: string) => maybe<User>(from('Person').select('*').eq('email', email).maybeSingle())

export async function peopleByIds(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; email: string }>()
  const people = await rows<{ id: string; name: string; email: string }>(from('Person').select('id, name, email').in('id', ids))
  return new Map(people.map((person) => [person.id, { name: person.name, email: person.email }]))
}

/** Creates the login and the profile that matches the role. The caller hashes the password. */
export async function createAccount(input: { name: string; email: string; phone?: string | null; passwordHash: string; role: Role }) {
  const login = await one<Omit<User, 'name' | 'phone' | 'avatarUrl'>>(
    from('Login').insert({ email: input.email, passwordHash: input.passwordHash, role: input.role }).select('id, email, passwordHash, role, isBlocked, lastLoginAt, createdAt').single(),
  )
  await exec(from(profileTable(input.role)).insert({ loginId: login.id, name: input.name, phone: input.phone ?? null }))
  return { ...login, name: input.name, phone: input.phone ?? null, avatarUrl: null }
}

export async function updateLogin(id: string, patch: { passwordHash?: string; lastLoginAt?: string; isBlocked?: boolean }) {
  await exec(from('Login').update(patch).eq('id', id))
}

/** Updates name or phone on the profile for this person's current role. */
export async function updateProfile(id: string, patch: { name?: string; phone?: string | null; avatarUrl?: string | null }) {
  const account = await findAccountById(id)
  if (!account) throw notFound('Account')
  await exec(from(profileTable(account.role)).update(patch).eq('loginId', id))
  return (await findAccountById(id))!
}

/**
 * Changes the role and moves the profile into the matching table.
 * Admin and staff are not the same row: promoting someone inserts Admin and removes Staff.
 */
export async function setRole(id: string, role: Role, nameFallback = 'Account') {
  const account = await findAccountById(id)
  if (!account) throw notFound('Account')
  const toTable = profileTable(role)
  const fromTable = profileTable(account.role)
  if (fromTable !== toTable) {
    await exec(from(toTable).upsert({ loginId: id, name: account.name || nameFallback, phone: account.phone }, { onConflict: 'loginId' }))
    await exec(from('Login').update({ role }).eq('id', id))
    await exec(from(fromTable).delete().eq('loginId', id))
  } else if (account.role !== role) {
    await exec(from('Login').update({ role }).eq('id', id))
  }
}

/** Seed helper. An existing login keeps its password; the role and profile are corrected. */
export async function ensureAccount(input: { email: string; name: string; role: Role; passwordHash?: string }) {
  const existing = await maybe<{ id: string }>(from('Login').select('id').eq('email', input.email).maybeSingle())
  if (!existing) {
    if (!input.passwordHash) throw new Error(`No password for new account ${input.email}`)
    const created = await createAccount({ name: input.name, email: input.email, passwordHash: input.passwordHash, role: input.role })
    return { id: created.id, created: true }
  }
  await setRole(existing.id, input.role, input.name)
  await exec(from('Login').update({ isBlocked: false }).eq('id', existing.id))
  const table = profileTable(input.role)
  const profile = await maybe(from(table).select('loginId').eq('loginId', existing.id).maybeSingle())
  if (!profile) await exec(from(table).insert({ loginId: existing.id, name: input.name }))
  return { id: existing.id, created: false }
}
