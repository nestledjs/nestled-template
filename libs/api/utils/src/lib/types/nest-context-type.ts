import { Request, Response } from 'express'
import { User } from '@nestled-template/api/core/models'

export interface OrganizationContext {
  organizationId: string
  userId: string
  roleId: string
  roleName: string
  permissions: Array<{ subject: string; action: string }>
}

export interface NestContextType {
  req: Request & {
    user?: User
    organizationContext?: OrganizationContext
  }
  res: Response
}
