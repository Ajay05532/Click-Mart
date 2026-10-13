import { from } from '../database/db.js'
export async function audit(actorId, action, entity, entityId, diff) {
  const { error } = await from('AuditLog').insert({
    actorId: actorId ?? null,
    action,
    entity,
    entityId: entityId ?? null,
    diff: diff ?? null,
  })
  if (error) console.error('audit failed', error.message)
}
