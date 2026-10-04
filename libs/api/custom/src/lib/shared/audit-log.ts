import { Logger } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import type { InputJsonValue } from '@nestled-template/api/prisma'

export type AuditLogInput = {
  /** The user who performed the action. AuditLog.userId is a required FK to User. */
  actorUserId: string
  organizationId?: string | null
  entityId: string
  entityType: string
  action: string
  /** Never put secrets, tokens, codes or passwords in here. */
  changes?: InputJsonValue
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

/**
 * Best-effort audit write for actions that are not already inside a transaction.
 *
 * A failed audit write is logged and swallowed: the action it describes has already happened, and
 * failing the request afterwards would only tell the caller it did not. Where the state change runs
 * in a transaction, write the audit row in that transaction instead (`tx.auditLog.create`).
 */
export async function recordAuditLog(
  data: Pick<ApiCoreDataAccessService, 'auditLog'>,
  input: AuditLogInput,
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
