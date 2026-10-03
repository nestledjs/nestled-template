import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Prisma, PrismaClient } from '@nestled-template/api/prisma'
import { DATABASE_MODELS } from '@nestled-template/shared/sdk'
import { CorePagingInput } from './dto/core-paging.input'
import { PrismaPg } from '@prisma/adapter-pg'

// `take` was previously passed to Prisma unbounded, so a caller could ask for the entire table in
// one request. The ceiling matches the admin data browser's export limit, which is the largest
// legitimate page this API serves. A tighter per-caller limit needs to know who is asking, which
// this layer cannot see today.
const MAX_TAKE = 50_000

// `orderBy` reaches Prisma as `{ [orderBy]: orderDirection }`. Sorting is not selection, but sorting
// by a column the caller cannot read still leaks its ordering — including columns removed from the
// GraphQL schema by `@graphqlOmit`. DATABASE_MODELS is generated with those fields already stripped,
// so the union of its field names is a ready-made allow-list that cannot drift from the schema.
let sortableFieldNames: Set<string> | undefined

const getSortableFieldNames = (): Set<string> => {
  sortableFieldNames ??= new Set(
    DATABASE_MODELS.flatMap(model => model.fields.map(field => field.name)),
  )
  return sortableFieldNames
}

const clampTake = (take: number): number => {
  if (!Number.isFinite(take) || take < 0) return 0
  return Math.min(Math.trunc(take), MAX_TAKE)
}

// Falls back to `id` rather than throwing: an unknown column is far more likely to be a stale
// client than an attack, and Prisma would reject it anyway. The point is that a name absent from
// every model never reaches Prisma, so it cannot be used to probe for columns outside the schema.
//
// Known gap: the allow-list is the union across all models, not the model being queried, because
// `filter()` is called from generated code that does not pass its model name. So a name that is
// real on some *other* model (`emailValidated` while listing ApiToken) still reaches Prisma and
// throws instead of falling back. That is a 500 on a stale client rather than a leak — GraphQL
// introspection already publishes which fields each type has, so it is no oracle — but it does not
// match the fallback this function otherwise promises. Closing it means threading the model name
// in from the generator; tracked in nestledjs/nestled.
const resolveOrderBy = (orderBy: string): string =>
  getSortableFieldNames().has(orderBy) ? orderBy : 'id'

type PrismaClientWithQueryEvents = PrismaClient & {
  $on(event: 'query', callback: (event: Prisma.QueryEvent) => void): void
}

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
    const queryEventClient = this as PrismaClientWithQueryEvents

    if (process.env['LOG_PRISMA_QUERIES'] == 'true') {
      queryEventClient.$on('query', async e => {
        console.log(`QUERY: ${e.query} \n\nPARAMS: ${e.params}\n\n\n`)
      })
    }

    if (process.env['COUNT_PRISMA_QUERIES'] == 'true') {
      queryEventClient.$on('query', async () => {
        this.queryCount++
      })
    }
  }

  filter<T extends Record<string, unknown>>(
    // Generated List inputs add their own typed `filters`; the base class deliberately does not.
    input: CorePagingInput & { filters?: Record<string, unknown> } = {},
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

    const whereInput: Record<string, unknown> | undefined =
      andConditions.length > 0 ? { AND: andConditions } : undefined

    return {
      skip,
      take: clampTake(take),
      where: whereInput as T | undefined,
      orderBy: { [resolveOrderBy(orderBy)]: orderDirection },
    }
  }
}
