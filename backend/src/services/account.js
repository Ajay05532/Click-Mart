import { exec, from, maybe, one, rows } from '../database/db.js'
import { notFound } from '../utils/errors.js'
export function profileTable(role) {
  if (role === 'ADMIN') return 'Admin'
  if (role === 'STAFF') return 'Staff'
  return 'Customer'
}
export const findAccountById = (id) => maybe(from('Person').select('*').eq('id', id).maybeSingle())
export const findAccountByEmail = (email) => maybe(from('Person').select('*').eq('email', email).maybeSingle())
export async function peopleByIds(ids) {
  if (!ids.length) return new Map()
  const people = await rows(from('Person').select('id, name, email').in('id', ids))
  return new Map(
    people.map((person) => [
      person.id,
      {
        name: person.name,
        email: person.email,
      },
    ]),
  )
}
export async function createAccount(input) {
  const login = await one(
    from('Login')
      .insert({
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        // Self-registered customers start unverified; every other caller (admin invite, staff creation) keeps
        // the column default (verified now), since the admin already trusts that email.
        ...(input.emailVerifiedAt === undefined ? {} : { emailVerifiedAt: input.emailVerifiedAt }),
      })
      .select('id, email, passwordHash, role, isBlocked, lastLoginAt, emailVerifiedAt, createdAt')
      .single(),
  )
  await exec(
    from(profileTable(input.role)).insert({
      loginId: login.id,
      name: input.name,
      phone: input.phone ?? null,
    }),
  )
  return {
    ...login,
    name: input.name,
    phone: input.phone ?? null,
    avatarUrl: null,
  }
}
export async function updateLogin(id, patch) {
  await exec(from('Login').update(patch).eq('id', id))
}
export async function updateProfile(id, patch) {
  const account = await findAccountById(id)
  if (!account) throw notFound('Account')
  await exec(from(profileTable(account.role)).update(patch).eq('loginId', id))
  return await findAccountById(id)
}
export async function setRole(id, role, nameFallback = 'Account') {
  const account = await findAccountById(id)
  if (!account) throw notFound('Account')
  const toTable = profileTable(role)
  const fromTable = profileTable(account.role)
  if (fromTable !== toTable) {
    await exec(
      from(toTable).upsert(
        {
          loginId: id,
          name: account.name || nameFallback,
          phone: account.phone,
        },
        {
          onConflict: 'loginId',
        },
      ),
    )
    await exec(
      from('Login')
        .update({
          role,
        })
        .eq('id', id),
    )
    await exec(from(fromTable).delete().eq('loginId', id))
  } else if (account.role !== role) {
    await exec(
      from('Login')
        .update({
          role,
        })
        .eq('id', id),
    )
  }
}
export async function ensureAccount(input) {
  const existing = await maybe(from('Login').select('id').eq('email', input.email).maybeSingle())
  if (!existing) {
    if (!input.passwordHash) throw new Error(`No password for new account ${input.email}`)
    const created = await createAccount({
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
    })
    return {
      id: created.id,
      created: true,
    }
  }
  await setRole(existing.id, input.role, input.name)
  await exec(
    from('Login')
      .update({
        isBlocked: false,
      })
      .eq('id', existing.id),
  )
  const table = profileTable(input.role)
  const profile = await maybe(from(table).select('loginId').eq('loginId', existing.id).maybeSingle())
  if (!profile)
    await exec(
      from(table).insert({
        loginId: existing.id,
        name: input.name,
      }),
    )
  return {
    id: existing.id,
    created: false,
  }
}
