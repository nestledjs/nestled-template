import { Logger } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import type { InputJsonValue } from '@nestled-template/api/prisma'

export type BillingAuditLogInput = {
  actorUserId: string
  organizationId?: string
  entityId: string
  entityType: string
  action: string
  changes?: InputJsonValue
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

export async function recordBillingAuditLog(
  data: ApiCoreDataAccessService,
  input: BillingAuditLogInput,
): Promise<void> {
  try {
    await data.auditLog.create({
      data: {
        userId: input.actorUserId,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        entityId: input.entityId,
        entityType: input.entityType,
        action: input.action,
        changes: input.changes,
      },
    })
  } catch (error) {
    Logger.warn(
      `Failed to record audit log ${input.action} for ${input.entityType} ${
        input.entityId
      }: ${errorMessage(error)}`,
    )
  }
}
