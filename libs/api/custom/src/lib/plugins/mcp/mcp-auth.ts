export interface McpAuthContext {
  userId: string
  organizationId: string | null
  isSuperAdmin: boolean
}
