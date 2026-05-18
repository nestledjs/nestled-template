import { InMemoryCache } from '@apollo/client'

/**
 * Apollo cache configuration
 * This configuration can be customized based on your needs
 */

const cacheOptions = {
  typePolicies: {
    Query: {
      fields: {
        userTransactions: {
          keyArgs: false,
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            return args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
          },
        },
        userMyReferrals: {
          keyArgs: false,
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            return args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
          },
        },
        userReferralsTo: {
          keyArgs: false,
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            return args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
          },
        },
        userUsers: {
          keyArgs: ['input', ['search']],
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            return args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
          },
        },
        userNotifications: {
          keyArgs: ['input', ['search', 'read']],
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            return args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
          },
        },
        userChapterMembers: {
          keyArgs: ['input', ['chapterId']],
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            return args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
          },
        },
        activeUsers: {
          keyArgs: ['input', ['search', 'filters', 'orderBy', 'orderDirection']],
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            const merged = args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
            const seen = new Set<string>()
            return merged.filter((item: any) => {
              const id = item?.id
              if (!id) return true
              if (seen.has(id)) return false
              seen.add(id)
              return true
            })
          },
        },
        chapters: {
          keyArgs: ['input', ['search', 'filters']],
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            return args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
          },
        },
        activeChapters: {
          keyArgs: ['input', ['search', 'filters']],
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            const merged = args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
            const seen = new Set<string>()
            return merged.filter((item: any) => {
              const id = item?.id
              if (!id) return true
              if (seen.has(id)) return false
              seen.add(id)
              return true
            })
          },
        },
        userMeetingPresences: {
          // keyArgs: ['input', ['chapterId']],
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            return args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
          },
        },
        leaderMeetings: {
          // keyArgs: ['input', ['chapterId']],
          merge(existing: any[] | undefined, incoming: any, { args }: any) {
            return args?.input?.skip ? [...(existing ?? []), ...incoming] : [...incoming]
          },
        },
        testimonials: {
          keyArgs: ['input'],
        },
      },
    },
  },
}

/**
 * Creates a new cache instance
 * Use this function instead of the singleton to ensure fresh cache for each client
 */
export function createCache() {
  return new InMemoryCache(cacheOptions as any)
}

/**
 * @deprecated Use createCache() instead to avoid cache sharing across SSR requests
 * This is kept for backwards compatibility but should not be used on the server
 */
export const cache = new InMemoryCache(cacheOptions as any)
