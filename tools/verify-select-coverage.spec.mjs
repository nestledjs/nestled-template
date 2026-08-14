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

  it('counts a non-nullable enum LIST column as required coverage (#129)', () => {
    // An enum array (`TrainerType[]`) is an ordinary selectable scalar column; the old `&& !list`
    // dropped it, so a select omitting it passed silently.
    const workspace = mkdtempSync(join(tmpdir(), 'verify-select-coverage-'))
    workspaces.push(workspace)
    writeFixture(
      workspace,
      'libs/api/prisma/src/lib/schemas/schema.prisma',
      'enum TrainerType {\n  A\n  B\n}\n\nmodel User {\n  id          String        @id\n  trainerType TrainerType[]\n}\n',
    )
    writeFixture(
      workspace,
      'api-schema.graphql',
      'type User {\n  id: String!\n  trainerType: [TrainerType!]!\n}\n',
    )
    writeFixture(
      workspace,
      'libs/api/custom/src/lib/user/user.select.ts',
      '\nexport const USER_SELECT = {\n  id: true,\n} as const\n',
    )

    const result = runTool(workspace)

    expect(result.stderr).toBe('')
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).problems).toEqual([
      {
        file: 'libs/api/custom/src/lib/user/user.select.ts',
        constant: 'USER_SELECT',
        model: 'User',
        missing: ['trainerType'],
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

  /**
   * A spread whose base constant cannot be located contributes nothing, so its fields are reported
   * missing even though they are selected. That is a false positive in a check that gates CI, and
   * a check that fails builds over fields which are in fact present gets switched off — costing
   * more than the check was ever worth. These cover the declaration shapes that previously did not
   * resolve.
   */
  it('resolves a spread of an exported base constant', () => {
    // The base carries every field and the spread carries all of them, so a passing run is only
    // possible if the spread resolved. An exported base is itself checked as a select for the
    // model its name resolves to, which is why it must be complete here rather than partial.
    const workspace = createWorkspace(`
export const USER_BASE = {
  id: true,
  email: true,
} as const

export const USER_SELECT = {
  ...USER_BASE,
} as const
`)

    const result = runTool(workspace)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ problems: [], unresolved: [] })
  })

  it('resolves a spread of a type-annotated base constant', () => {
    const workspace = createWorkspace(`
const USER_BASE: Record<string, boolean> = {
  email: true,
}

export const USER_SELECT = {
  ...USER_BASE,
  id: true,
} as const
`)

    const result = runTool(workspace)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ problems: [], unresolved: [] })
  })

  it('resolves a spread of a base constant declared without as const', () => {
    // The base is declared AFTER the select and carries no `as const`. That ordering matters: the
    // previous non-greedy scan searched forward for the next `\n} as const` in the file, so a base
    // followed by another constant would silently capture that neighbour's body instead and could
    // appear to work by accident. With nothing after it to span to, the old matcher found nothing.
    const workspace = createWorkspace(`
export const USER_SELECT = {
  ...USER_BASE,
  id: true,
} as const

const USER_BASE = {
  email: true,
}
`)

    const result = runTool(workspace)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ problems: [], unresolved: [] })
  })

  it('honours @select-omits on a type-annotated base constant', () => {
    // The annotation reader and the body reader used separate declaration patterns, so widening
    // the body reader to accept a type annotation left the annotation reader still blind to it.
    // A base whose omissions are declared but not seen reports those fields as missing — the same
    // false positive, one layer up.
    const workspace = createWorkspace(`
/** @select-omits email */
const USER_BASE: Record<string, boolean> = {
  id: true,
}

export const USER_SELECT = {
  ...USER_BASE,
} as const
`)

    const result = runTool(workspace)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ problems: [], unresolved: [] })
  })

  it('honours @prisma-model on a type-annotated constant', () => {
    // The same reader resolves the model override. Annotating Post inside user.select.ts is what
    // makes this discriminate: if the annotation is missed the constant falls back to the model
    // implied by the filename, so the run still reports a problem — just against the wrong model,
    // naming User's missing column rather than Post's. Asserting status alone would pass either way.
    const workspace = createWorkspace(`
/** @prisma-model Post */
export const ACCOUNT_SELECT: Record<string, boolean> = {
  id: true,
}
`)

    const result = runTool(workspace)

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).problems).toEqual([
      {
        file: 'libs/api/custom/src/lib/user/user.select.ts',
        constant: 'ACCOUNT_SELECT',
        model: 'Post',
        missing: ['authorId', 'title'],
      },
    ])
  })

  it('still reports a genuinely missing field when the spread resolves', () => {
    // The counterpart to the three above: resolution must not become a way to pass by accident.
    const workspace = createWorkspace(`
const USER_BASE = {
  id: true,
}

export const USER_SELECT = {
  ...USER_BASE,
} as const
`)

    const result = runTool(workspace)

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
})
