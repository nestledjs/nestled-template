import { describe, expect, it } from 'vitest'
import {
  buildPrismaSelectFromFragments,
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
