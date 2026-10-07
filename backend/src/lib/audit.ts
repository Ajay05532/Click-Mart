import { prisma } from './prisma.js'

export function audit(actorId: string | undefined, action: string, entity: string, entityId?: string, diff?: unknown) {
  return prisma.auditLog
    .create({ data: { actorId, action, entity, entityId, diff: diff as never } })
    .catch((error) => console.error('audit failed', error))
}
