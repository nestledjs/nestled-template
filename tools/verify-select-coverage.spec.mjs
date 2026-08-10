import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const toolPath = fileURLToPath(new URL('./verify-select-coverage.mjs', import.meta.url))
const workspaces = []

const writeFixture = (workspace, path, contents) => {
  const absolute = join(workspace, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, contents)
}

const createWorkspace = selectSource => {
  const workspace = mkdtempSync(join(tmpdir(), 'verify-select-coverage-'))
  workspaces.push(workspace)

  writeFixture(
    workspace,
    'libs/api/prisma/src/lib/schemas/schema.prisma',
    `
      model User {
        id    String   @id
        email String
        dob   DateTime?
        posts Post[]
      }

      model Post {
        id       String @id
        title    String
        authorId String
        author   User   @relation(fields: [authorId], references: [id])
      }
    `.replace(/^ {6}/gm, ''),
  )
  writeFixture(
    workspace,
    'api-schema.graphql',
    `
      type User {
        id: String!
        email: String!
        dob: DateTime
        posts: [Post!]!
      }

      type Post {
        id: String!
        title: String!
        authorId: String!
        author: User!
      }
    `.replace(/^ {6}/gm, ''),
  )
  writeFixture(workspace, 'libs/api/custom/src/lib/user/user.select.ts', selectSource)
  return workspace
}

const runTool = (workspace, ...args) =>
  spawnSync(process.execPath, [toolPath, '--json', ...args], {
    cwd: workspace,
    encoding: 'utf8',
  })

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true })
  }
})

describe('verify-select-coverage', () => {
  it('fails when a top-level select omits a non-nullable GraphQL scalar', () => {
    const workspace = createWorkspace(`
export const USER_SELECT = {
  id: true,
} as const
`)

    const result = runTool(workspace)

    expect(result.stderr).toBe('')
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).problems).toEqual([
      {
        file: 'libs/api/custom/src/lib/user/user.select.ts',
        constant: 'USER_SELECT',
        model: 'User',
        missing: ['email'],
      },
    ])
  })

  it('accepts a deliberate omission and reports nullable gaps only when requested', () => {
    const workspace = createWorkspace(`
/** @select-omits email */
export const USER_SELECT = {
  id: true,
} as const
`)

    const normal = runTool(workspace)
    const withNullable = runTool(workspace, '--warn-nullable')

    expect(normal.status).toBe(0)
    expect(JSON.parse(normal.stdout).nullableGaps).toBeUndefined()
    expect(JSON.parse(withNullable.stdout).nullableGaps).toEqual([
      {
        file: 'libs/api/custom/src/lib/user/user.select.ts',
        constant: 'USER_SELECT',
        model: 'User',
        missing: ['dob'],
      },
    ])
  })

  it('reports nested non-nullable gaps without gating unless strict nested mode is enabled', () => {
    const workspace = createWorkspace(`
export const USER_SELECT = {
  id: true,
  email: true,
  posts: {
    select: {
      id: true,
    },
  },
} as const
`)

    const advisory = runTool(workspace)
    const strict = runTool(workspace, '--strict-nested')

    expect(advisory.status).toBe(0)
    expect(strict.status).toBe(1)
    expect(JSON.parse(strict.stdout).nestedProblems).toEqual([
      {
        file: 'libs/api/custom/src/lib/user/user.select.ts',
        constant: 'USER_SELECT.posts',
        model: 'Post',
        missing: ['authorId', 'title'],
      },
    ])
  })

  it('infers a helper model from the constant name before falling back to the filename', () => {
    const workspace = createWorkspace(`
export const POST_SUMMARY_SELECT = {
  id: true,
  title: true,
  authorId: true,
} as const
`)

    const result = runTool(workspace)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ problems: [], unresolved: [] })
  })

  it('does not leak a deliberate omission annotation to the following constant', () => {
    const workspace = createWorkspace(`
/** @select-omits email */
export const USER_SELF_SELECT = {
  id: true,
} as const

export const USER_OTHER_SELECT = {
  id: true,
} as const
`)

    const result = runTool(workspace)

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).problems).toEqual([
      {
        file: 'libs/api/custom/src/lib/user/user.select.ts',
        constant: 'USER_OTHER_SELECT',
        model: 'User',
        missing: ['email'],
      },
    ])
  })

  it('does not span two JSDocs when resolving the nearest model annotation', () => {
    const workspace = createWorkspace(`
/** @prisma-model Post */
const POST_BASE = {
  id: true,
}

/** The complete user select. */
export const USER_SELECT = {
  id: true,
  email: true,
} as const
`)

    const result = runTool(workspace)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ problems: [], unresolved: [] })
  })
})
