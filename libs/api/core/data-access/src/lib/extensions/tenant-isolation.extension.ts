import { Prisma } from '@nestled-template/api/prisma'

/**
 * Models that belong to an organization and should be automatically filtered
 */
const ORGANIZATION_SCOPED_MODELS = [
  'organization',
  'organizationMember',
  'invite',
  'team',
  'teamMember',
  'auditLog',
  'subscription',
] as const

type OrganizationScopedModel = (typeof ORGANIZATION_SCOPED_MODELS)[number]

/**
 * Prisma Client Extension for Multi-Tenant Data Isolation
 *
 * This extension automatically injects organizationId filters to all queries
 * on organization-scoped models, ensuring complete data isolation between tenants.
 *
 * CRITICAL SECURITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */
export function createTenantIsolationExtension(organizationId?: string) {
  return Prisma.defineExtension((client: any) => {
    return client.$extends({
      name: 'TenantIsolation',
      query: {
        // Apply to all models
        $allModels: {
          async $allOperations({
            model,
            operation,
            args,
            query,
          }: {
            model: string
            operation: string
            args: any
            query: (args: any) => Promise<any>
          }) {
            // Skip if no organizationId provided
            if (!organizationId) return query(args)

            // Skip if model is not organization-scoped
            const modelName = model.toLowerCase() as OrganizationScopedModel
            if (!ORGANIZATION_SCOPED_MODELS.includes(modelName)) {
              return query(args)
            }

            // Operations that use 'where' clause
            const whereOperations = [
              'findUnique',
              'findUniqueOrThrow',
              'findFirst',
              'findFirstOrThrow',
              'findMany',
              'update',
              'updateMany',
              'delete',
              'deleteMany',
              'count',
              'aggregate',
              'groupBy',
            ]

            // Operations that use 'data' clause
            const dataOperations = ['create', 'createMany']

            // Upsert uses both
            const upsertOperations = ['upsert']

            if (whereOperations.includes(operation)) {
              return query({
                ...args,
                where: {
                  ...args.where,
                  organizationId,
                },
              })
            }

            if (dataOperations.includes(operation)) {
              if (operation === 'createMany') {
                const argsData = args.data
                const data = Array.isArray(argsData) ? argsData : [argsData]
                return query({
                  ...args,
                  data: data.map((record: any) => ({
                    ...record,
                    organizationId,
                  })),
                })
              } else {
                return query({
                  ...args,
                  data: {
                    ...args.data,
                    organizationId,
                  },
                })
              }
            }

            if (upsertOperations.includes(operation)) {
              return query({
                ...args,
                where: {
                  ...args.where,
                  organizationId,
                },
                create: {
                  ...args.create,
                  organizationId,
                },
              })
            }

            // Default: just pass through
            return query(args)
          },
        },
      },
    })
  })
}

/**
 * Helper to create a tenant-isolated Prisma client
 */
export function createTenantClient<T extends object>(client: T, organizationId?: string): T {
  if (!organizationId) {
    return client
  }

  // Check if client has $extends method (Prisma client)
  if ('$extends' in client && typeof client.$extends === 'function') {
    return (client as any).$extends(createTenantIsolationExtension(organizationId))
  }

  return client
}
