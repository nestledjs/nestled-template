import { describe, expect, it } from 'vitest'
import { InMemoryCache } from '@apollo/client'
import { cache, createCache } from './cache-config'

describe('Apollo cache configuration', () => {
  it('creates a fresh cache instance for each client', () => {
    const first = createCache()
    const second = createCache()

    expect(first).toBeInstanceOf(InMemoryCache)
    expect(second).toBeInstanceOf(InMemoryCache)
    expect(first).not.toBe(second)
    expect(cache).toBeInstanceOf(InMemoryCache)
  })

  it('merges paginated fields and deduplicates active entities by id', () => {
    const policies = (createCache() as any).policies
    const queryFields = policies.getTypePolicy('Query').fields

    expect(
      queryFields.userTransactions.merge(['a'], ['b'], { args: { input: { skip: 1 } } }),
    ).toEqual(['a', 'b'])
    expect(queryFields.userTransactions.merge(['a'], ['b'], { args: { input: {} } })).toEqual(['b'])
    expect(
      queryFields.userMyReferrals.merge(undefined, ['ref'], { args: { input: { skip: 1 } } }),
    ).toEqual(['ref'])
    expect(
      queryFields.userReferralsTo.merge(['old'], ['new'], { args: { input: { skip: 1 } } }),
    ).toEqual(['old', 'new'])
    expect(queryFields.userUsers.merge(['old'], ['new'], { args: { input: { skip: 1 } } })).toEqual(
      ['old', 'new'],
    )
    expect(
      queryFields.userNotifications.merge(['old'], ['new'], { args: { input: { skip: 1 } } }),
    ).toEqual(['old', 'new'])
    expect(
      queryFields.userChapterMembers.merge(['old'], ['new'], { args: { input: { skip: 1 } } }),
    ).toEqual(['old', 'new'])
    expect(
      queryFields.activeUsers.merge(
        [{ id: '1', name: 'Old' }],
        [{ id: '1', name: 'New' }, { id: '2', name: 'Second' }, { name: 'No id' }],
        { args: { input: { skip: 1 } } },
      ),
    ).toEqual([{ id: '1', name: 'Old' }, { id: '2', name: 'Second' }, { name: 'No id' }])
    expect(
      queryFields.activeChapters.merge(
        [{ id: 'chapter-1', name: 'Old' }],
        [
          { id: 'chapter-1', name: 'New' },
          { id: 'chapter-2', name: 'Second' },
        ],
        { args: { input: { skip: 1 } } },
      ),
    ).toEqual([
      { id: 'chapter-1', name: 'Old' },
      { id: 'chapter-2', name: 'Second' },
    ])
    expect(queryFields.chapters.merge(['old'], ['new'], { args: { input: { skip: 1 } } })).toEqual([
      'old',
      'new',
    ])
    expect(
      queryFields.userMeetingPresences.merge(['old'], ['new'], { args: { input: {} } }),
    ).toEqual(['new'])
    expect(
      queryFields.leaderMeetings.merge(['old'], ['new'], { args: { input: { skip: 1 } } }),
    ).toEqual(['old', 'new'])
  })
})
