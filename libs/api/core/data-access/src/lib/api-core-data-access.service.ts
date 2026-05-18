import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Prisma, PrismaClient } from '@nestled-template/api/prisma'
import { CorePagingInput } from './dto/core-paging.input'
import { PrismaPg } from '@prisma/adapter-pg'

function createAdapter() {
  const connectionString = process.env['DATABASE_URL'] || ''

  // Auto-detect SSL for cloud databases (Heroku, Railway, AWS RDS)
  const requireSsl =
    connectionString.includes('amazonaws.com') ||
    connectionString.includes('.railway.app') ||
    connectionString.includes('heroku') ||
    process.env['DATABASE_SSL'] === 'true'

  const usePgBouncer = process.env['PGBOUNCER_ENABLED'] === 'true'

  // Pass PoolConfig to PrismaPg - it manages its own Pool internally
  // This avoids connection management conflicts that can cause ECONNREFUSED errors
  return new PrismaPg({
    connectionString,
    ssl: requireSsl ? { rejectUnauthorized: false } : undefined,
    max: usePgBouncer ? 5 : 30,
    idleTimeoutMillis: usePgBouncer ? 10000 : 30000,
  })
}

@Injectable()
export class ApiCoreDataAccessService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = createAdapter()

    const config: Prisma.PrismaClientOptions = {
      adapter,
      log:
        process.env['LOG_PRISMA_QUERIES'] === 'true' ||
        process.env['COUNT_PRISMA_QUERIES'] === 'true'
          ? [{ emit: 'event', level: 'query' }]
          : [{ emit: 'event', level: 'warn' }],
    }

    super(config)
    this.queryCount = 0
  }

  public queryCount: number

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }

  public async onModuleInit(): Promise<void> {
    await this.$connect()

    if (process.env['LOG_PRISMA_QUERIES'] == 'true') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this as any).$on('query', async (e: Prisma.QueryEvent) => {
        console.log(`QUERY: ${e.query} \n\nPARAMS: ${e.params}\n\n\n`)
      })
    }

    if (process.env['COUNT_PRISMA_QUERIES'] == 'true') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this as any).$on('query', async () => {
        this.queryCount++
      })
    }
  }

  filter<T extends Record<string, unknown>>(
    input: CorePagingInput = {},
  ): {
    skip: number
    take: number
    where?: T
    orderBy: { [key: string]: 'asc' | 'desc' }
  } {
    const {
      search = '',
      searchFields = [],
      take = 20,
      skip = 0,
      orderBy = 'id',
      orderDirection = 'asc',
      filters = {},
    } = input

    const trimmedSearch = search.trim()
    const andConditions: unknown[] = []

    if (Object.keys(filters).length > 0) {
      andConditions.push(filters)
    }

    if (trimmedSearch && searchFields.length > 0) {
      const terms = trimmedSearch.includes(' ')
        ? trimmedSearch.split(' ')
        : [trimmedSearch].filter(Boolean)
      const searchFilters = terms.map(term => ({
        OR: searchFields.map(field => ({
          [field]: { contains: term, mode: Prisma.QueryMode.insensitive },
        })),
      }))
      andConditions.push(...searchFilters)
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : undefined

    return {
      skip,
      take,
      where: where as unknown as T, // assert type safety for the generic
      orderBy: { [orderBy]: orderDirection },
    }
  }
}
