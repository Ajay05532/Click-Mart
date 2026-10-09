import { from } from './db.js'

/** Never throws: a failed audit entry must not fail the action it describes. */
export async function audit(actorId: string | undefined, action: string, entity: string, entityId?: string, diff?: unknown) {
  const { error } = await from('AuditLog').insert({ actorId: actorId ?? null, action, entity, entityId: entityId ?? null, diff: diff ?? null })
  if (error) console.error('audit failed', error.message)
}
