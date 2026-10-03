import { ApiCoreDataAccessService } from './api-core-data-access.service'

function createServiceWithoutConstructor(): ApiCoreDataAccessService {
  return Object.create(ApiCoreDataAccessService.prototype) as ApiCoreDataAccessService
}

describe('ApiCoreDataAccessService.filter', () => {
  it('returns stable paging defaults when no input is provided', () => {
    const service = createServiceWithoutConstructor()

    expect(service.filter()).toEqual({
      skip: 0,
      take: 20,
      where: undefined,
      orderBy: { id: 'asc' },
    })
  })

  it('combines explicit filters with multi-term text search', () => {
    const service = createServiceWithoutConstructor()

    const result = service.filter({
      skip: 10,
      take: 5,
      orderBy: 'createdAt',
      orderDirection: 'desc',
      search: ' ada lovelace ',
      searchFields: ['name', 'email'],
      filters: { organizationId: 'org-1', status: 'ACTIVE' },
    })

    expect(result).toEqual({
      skip: 10,
      take: 5,
      orderBy: { createdAt: 'desc' },
      where: {
        AND: [
          { organizationId: 'org-1', status: 'ACTIVE' },
          {
            OR: [
              { name: { contains: 'ada', mode: 'insensitive' } },
              { email: { contains: 'ada', mode: 'insensitive' } },
            ],
          },
          {
            OR: [
              { name: { contains: 'lovelace', mode: 'insensitive' } },
              { email: { contains: 'lovelace', mode: 'insensitive' } },
            ],
          },
        ],
      },
    })
  })

  it('ignores blank search and search text without searchable fields', () => {
    const service = createServiceWithoutConstructor()

    expect(service.filter({ search: '   ', searchFields: ['name'] }).where).toBeUndefined()
    expect(service.filter({ search: 'Ada', searchFields: [] }).where).toBeUndefined()
  })

  it('uses a single search term without splitting when no spaces are present', () => {
    const service = createServiceWithoutConstructor()

    expect(
      service.filter({
        search: 'Ada',
        searchFields: ['name'],
      }).where,
    ).toEqual({
      AND: [
        {
          OR: [{ name: { contains: 'Ada', mode: 'insensitive' } }],
        },
      ],
    })
  })
})

describe('ApiCoreDataAccessService.filter paging and ordering limits', () => {
  it('caps take at the server maximum so a caller cannot request the whole table', () => {
    const service = createServiceWithoutConstructor()

    expect(service.filter({ take: 10_000_000 }).take).toBe(50_000)
    // The admin data browser's export asks for exactly this many rows and must still work.
    expect(service.filter({ take: 50_000 }).take).toBe(50_000)
    expect(service.filter({ take: 25 }).take).toBe(25)
  })

  it('rejects nonsensical take values instead of passing them to Prisma', () => {
    const service = createServiceWithoutConstructor()

    expect(service.filter({ take: -5 }).take).toBe(0)
    expect(service.filter({ take: Number.NaN }).take).toBe(0)
    expect(service.filter({ take: Number.POSITIVE_INFINITY }).take).toBe(0)
    expect(service.filter({ take: 12.9 }).take).toBe(12)
  })

  it('allows ordering by a field the GraphQL schema exposes', () => {
    const service = createServiceWithoutConstructor()

    expect(service.filter({ orderBy: 'createdAt' }).orderBy).toEqual({ createdAt: 'asc' })
  })

  it('refuses to order by a column that @graphqlOmit removed from the schema', () => {
    const service = createServiceWithoutConstructor()

    // Sorting is not selection, but ordering by a credential column still leaks its ordering.
    // These are absent from DATABASE_MODELS, so they must never reach Prisma.
    for (const column of ['password', 'passwordResetToken', 'twoFactorSecret', 'tokenHash']) {
      expect(service.filter({ orderBy: column }).orderBy).toEqual({ id: 'asc' })
    }
  })

  it('refuses to order by an unknown column', () => {
    const service = createServiceWithoutConstructor()

    expect(service.filter({ orderBy: 'definitelyNotAColumn' }).orderBy).toEqual({ id: 'asc' })
  })
})
