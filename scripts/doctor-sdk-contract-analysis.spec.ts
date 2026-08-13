import { describe, expect, it } from 'vitest'
import {
  buildPrismaSelectFromFragments,
  buildPrismaSelectFromOperationPaths,
  getSdkContractReport,
  normalizeContractPath,
  type DatabaseModelMetadata,
} from './doctor-sdk-contract-analysis'

const models: DatabaseModelMetadata[] = [
  {
    modelName: 'Group',
    fields: [
      { name: 'id', type: 'String' },
      { name: 'members', type: 'GroupMember' },
    ],
  },
  {
    modelName: 'GroupMember',
    fields: [
      { name: 'id', type: 'String' },
      { name: 'user', type: 'User' },
    ],
  },
  {
    modelName: 'User',
    fields: [
      { name: 'id', type: 'String' },
      { name: 'displayName', type: 'String' },
    ],
  },
]

describe('fragment-to-select analysis', () => {
  it('follows global fragments and skips GraphQL-only resolved fields', () => {
    const groupSource = {
      file: 'graphql/group/group-fragments.graphql',
      source: `
        fragment GroupDetails on Group {
          id
          friendsCount
          members {
            isAdmin
            # This prose must never become Prisma select fields.
            user { ...UserBasicInfo }
          }
        }
      `,
    }
    const result = buildPrismaSelectFromFragments({
      allSources: [
        groupSource,
        {
          file: 'graphql/user/user-fragments.graphql',
          source: 'fragment UserBasicInfo on User { id displayName }',
        },
      ],
      models,
      rootSources: [groupSource],
      targetModelName: 'Group',
    })

    expect(result.select).toEqual({
      id: true,
      members: {
        select: {
          user: { select: { id: true, displayName: true } },
        },
      },
    })
    expect(result.skippedFields).toEqual(['Group.friendsCount', 'GroupMember.isAdmin'])
    expect(result.missingFragments).toEqual([])
  })

  it('reports a missing fragment instead of emitting an empty relation select', () => {
    const groupSource = {
      file: 'graphql/group/group-fragments.graphql',
      source: 'fragment GroupDetails on Group { members { user { ...MissingUser } } }',
    }
    const result = buildPrismaSelectFromFragments({
      allSources: [groupSource],
      models,
      rootSources: [groupSource],
      targetModelName: 'Group',
    })

    expect(result.select).toEqual({})
    expect(result.missingFragments).toEqual(['MissingUser'])
    expect(result.skippedFields).toEqual(['Group.members', 'GroupMember.user'])
  })
})

describe('SDK contract analysis', () => {
  it('normalizes Windows paths for portable baseline and exception keys', () => {
    expect(normalizeContractPath('libs\\shared\\sdk\\src\\graphql\\user.graphql')).toBe(
      'libs/shared/sdk/src/graphql/user.graphql',
    )
  })

  it('reports uncovered API fields, unused SDK operations, and inline client operations', () => {
    const report = getSdkContractReport({
      adminSources: [],
      applicationSources: [
        {
          file: 'graphql/user.graphql',
          source: `
            query UserProfile { profile { id } }
            mutation UpdateProfile { updateProfile { id } }
          `,
        },
      ],
      clientSources: [
        {
          file: 'apps/web/profile.tsx',
          source: `
            import { UserProfile, type UserProfileQuery } from '@example/shared/sdk'
            const inline = gql\`mutation InlineUpdate { hiddenUpdate }\`
            void UserProfile
          `,
        },
      ],
      schemaSource: `
        type User { id: ID! }
        type Query { profile: User, hidden: User }
        type Mutation { updateProfile: User, hiddenUpdate: Boolean }
      `,
    })

    expect(report.apiWithoutSdk).toEqual(['hidden', 'hiddenUpdate'])
    expect(report.sdkWithoutApi).toEqual([])
    expect(report.sdkWithoutConsumer).toEqual([
      expect.objectContaining({ name: 'UpdateProfile', rootFields: ['updateProfile'] }),
    ])
    expect(report.inlineClientOperations).toEqual([
      expect.objectContaining({ file: 'apps/web/profile.tsx', name: 'InlineUpdate' }),
    ])
  })

  it('reports SDK operations whose API root field no longer exists', () => {
    const report = getSdkContractReport({
      adminSources: [],
      applicationSources: [
        {
          file: 'graphql/user.graphql',
          source: 'query RemovedOperation { removedField }',
        },
      ],
      clientSources: [],
      schemaSource: 'type Query { activeField: String! }',
    })

    expect(report.sdkWithoutApi).toEqual([
      {
        file: 'graphql/user.graphql',
        operation: 'RemovedOperation',
        rootFields: ['removedField'],
      },
    ])
  })
})

describe('operation-path select analysis', () => {
  const sources = [
    {
      file: 'graphql/user/user-queries.graphql',
      source: `
        query Me { me { ...SelfUser } }
        query MyFavorites { me { favorites { id } } }
        fragment SelfUser on User { id displayName }
      `,
    },
    {
      file: 'graphql/auth/auth-mutations.graphql',
      source: `
        mutation Login($input: LoginInput!) { login(input: $input) { ...TokenDetails } }
        mutation Register($input: RegisterInput!) { register(input: $input) { ...TokenDetails } }
      `,
    },
    {
      file: 'graphql/auth/auth-fragments.graphql',
      source: 'fragment TokenDetails on UserToken { token user { id displayName } }',
    },
  ]
  const pathModels: DatabaseModelMetadata[] = [
    {
      modelName: 'User',
      fields: [
        { name: 'id', type: 'String' },
        { name: 'displayName', type: 'String' },
        { name: 'favorites', type: 'Experience' },
      ],
    },
    { modelName: 'Experience', fields: [{ name: 'id', type: 'String' }] },
  ]

  it('unions every document selecting an operation root field', () => {
    // Me contributes the scalar pair, MyFavorites the relation — one resolver
    // serves both documents, so the select owes the union.
    const result = buildPrismaSelectFromOperationPaths({
      allSources: sources,
      models: pathModels,
      paths: ['me'],
      targetModelName: 'User',
    })

    expect(result.select).toEqual({
      displayName: true,
      favorites: { select: { id: true } },
      id: true,
    })
    expect(result.matched.get('me')).toBe(2)
  })

  it('walks a dotted path through a fragment spread', () => {
    // login { ...TokenDetails } carries `user` only inside the fragment; the
    // walker must resolve the spread between segments or the path matches nothing.
    const result = buildPrismaSelectFromOperationPaths({
      allSources: sources,
      models: pathModels,
      paths: ['login.user'],
      targetModelName: 'User',
    })

    expect(result.select).toEqual({ displayName: true, id: true })
    expect(result.matched.get('login.user')).toBe(1)
  })

  it('matches a type-scoped path in every fragment on that type', () => {
    // One field resolver serves user for every operation returning UserToken, so
    // the annotation names the type once instead of chasing each mutation.
    const result = buildPrismaSelectFromOperationPaths({
      allSources: sources,
      models: pathModels,
      paths: ['UserToken.user'],
      targetModelName: 'User',
    })

    expect(result.select).toEqual({ displayName: true, id: true })
    expect(result.matched.get('UserToken.user')).toBe(1)
  })

  it('follows a fragment spread to an inline fragment on the scoped type', () => {
    // The inline `... on UserToken` lives inside AuthResult (a fragment on AuthPayload, so the
    // fragment-on-type filter misses it) — the walker must descend through the spread to find it.
    const spreadSources = [
      {
        file: 'graphql/auth/social.graphql',
        source: `
          mutation SocialLogin { socialLogin { ...AuthResult } }
          fragment AuthResult on AuthPayload { ... on UserToken { user { id displayName } } }
        `,
      },
    ]
    const result = buildPrismaSelectFromOperationPaths({
      allSources: spreadSources,
      models: pathModels,
      paths: ['UserToken.user'],
      targetModelName: 'User',
    })

    expect(result.select).toEqual({ displayName: true, id: true })
    expect(result.matched.get('UserToken.user')).toBe(1)
  })

  it('counts zero matches for a stale path so the caller can fail on it', () => {
    const result = buildPrismaSelectFromOperationPaths({
      allSources: sources,
      models: pathModels,
      paths: ['renamedAway.user'],
      targetModelName: 'User',
    })

    expect(result.matched.get('renamedAway.user')).toBe(0)
    expect(result.select).toEqual({})
  })
})

describe('sdkWithoutConsumer name matching', () => {
  it('credits a consumer importing the PascalCased document const of a camelCase operation', () => {
    // `mutation createThing` generates `export const CreateThing = {...}` — the import
    // never carries the declared name, and matching it alone deletes live operations.
    const report = getSdkContractReport({
      adminSources: [],
      applicationSources: [
        {
          file: 'graphql/thing.graphql',
          source: 'mutation createThing { createThing } query OrphanThing { thing }',
        },
      ],
      clientSources: [
        {
          file: 'apps/web/thing.tsx',
          source: "import { CreateThing } from '@example/shared/sdk'\nexport const x = CreateThing",
        },
      ],
      schemaSource: 'type Query { thing: String } type Mutation { createThing: String }',
    })

    expect(report.sdkWithoutConsumer.map(operation => operation.name)).toEqual(['OrphanThing'])
  })

  it('normalizes acronym runs the way codegen does', () => {
    // `query FAQS` exports `Faqs`, `mutation deleteCourseFAQ` exports `DeleteCourseFaq`.
    // The first-letter-only fix missed these and still marked live operations unconsumed.
    const report = getSdkContractReport({
      adminSources: [],
      applicationSources: [
        {
          file: 'graphql/faq.graphql',
          source: 'query FAQS { faqs } mutation deleteCourseFAQ { deleteCourseFAQ }',
        },
      ],
      clientSources: [
        {
          file: 'apps/web/faqs.tsx',
          source:
            "import { Faqs, DeleteCourseFaq } from '@example/shared/sdk'\nexport const x = [Faqs, DeleteCourseFaq]",
        },
      ],
      schemaSource: 'type Query { faqs: String } type Mutation { deleteCourseFAQ: String }',
    })

    expect(report.sdkWithoutConsumer).toEqual([])
  })
})
