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
