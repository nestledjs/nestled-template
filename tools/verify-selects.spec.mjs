import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadModels, verifySelects } from './verify-selects.mjs'

const toolPath = fileURLToPath(new URL('./verify-selects.mjs', import.meta.url))
const workspaces = []

const writeFixture = (workspace, path, source) => {
  const file = join(workspace, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, source)
}

const createWorkspace = () => {
  const workspace = mkdtempSync(join(tmpdir(), 'verify-selects-'))
  workspaces.push(workspace)
  writeFixture(
    workspace,
    'libs/api/prisma/src/lib/schemas/schema.prisma',
    `
      datasource db {
        provider = "postgresql"
      }

      generator client {
        provider = "prisma-client"
        output = "../generated"
      }

      model User {
        id    String @id
        posts Post[]
      }

      model Post {
        id       String @id
        authorId String?
        author   User? @relation(fields: [authorId], references: [id])
      }
    `,
  )
  return workspace
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true })
})

describe('verify-selects', () => {
  it('loads authoritative DMMF and reports invalid fields and empty nested selects', async () => {
    const workspace = createWorkspace()
    writeFixture(
      workspace,
      'custom-selects/user.select.ts',
      `
        export const USER_SELECT = {
          id: true,
          posts: { select: { id: true } },
        }

        export const USER_BAD_SELECT = {
          likesCount: true,
          posts: { select: {} },
        }
      `,
    )

    const result = await verifySelects({ cwd: workspace, roots: ['custom-selects'] })

    expect(result.source).toBe('@prisma/internals')
    expect(result.problems).toEqual([
      {
        file: 'custom-selects/user.select.ts',
        kind: 'not-a-column',
        model: 'User',
        path: 'USER_BAD_SELECT.likesCount',
      },
      {
        file: 'custom-selects/user.select.ts',
        kind: 'empty-select',
        model: 'User',
        path: 'USER_BAD_SELECT.posts',
      },
    ])
    expect(result.unresolved).toEqual([])
  })

  it('walks relations and scopes model overrides to the constant they precede', async () => {
    const workspace = createWorkspace()
    writeFixture(
      workspace,
      'custom-selects/settings.select.ts',
      `
        const AUTHOR_SELECT = {
          id: true,
          anotherMissingUserField: true,
        }

        const MEMBER_USER_SELECT = { id: true }

        /** @prisma-model Post */
        export const SETTINGS_SELECT = {
          id: true,
          author: { select: { missingUserField: true } },
        }

        export const MYSTERY_SELECT = { id: true }
      `,
    )

    const result = await verifySelects({ cwd: workspace, roots: ['custom-selects'] })

    expect(result.problems).toEqual([
      {
        file: 'custom-selects/settings.select.ts',
        kind: 'not-a-column',
        model: 'User',
        path: 'AUTHOR_SELECT.anotherMissingUserField',
      },
      {
        file: 'custom-selects/settings.select.ts',
        kind: 'not-a-column',
        model: 'User',
        path: 'SETTINGS_SELECT.author.missingUserField',
      },
    ])
    expect(result.unresolved).toEqual([
      { file: 'custom-selects/settings.select.ts', const: 'MYSTERY_SELECT' },
    ])
  })

  it('uses the regex schema fallback when Prisma internals are unavailable', async () => {
    const workspace = createWorkspace()
    const result = await loadModels({
      cwd: workspace,
      internalsLoader: async () => {
        throw new Error('not installed')
      },
    })

    expect(result.source).toBe('regex fallback')
    expect(result.models.User).toEqual({ id: null, posts: 'Post' })
  })

  it('supports configurable roots, JSON output, and a non-zero finding exit', () => {
    const workspace = createWorkspace()
    writeFixture(
      workspace,
      'chosen/user.select.ts',
      'export const USER_SELECT = { friendsCount: true }',
    )
    writeFixture(workspace, 'ignored/user.select.ts', 'export const USER_SELECT = { id: true }')

    const result = spawnSync(process.execPath, [toolPath, '--json', 'chosen'], {
      cwd: workspace,
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    const report = JSON.parse(result.stdout)
    expect(report.files).toBe(1)
    expect(report.problems).toHaveLength(1)
    expect(report.problems[0].path).toBe('USER_SELECT.friendsCount')
    expect(result.stderr).toBe('')
  })

  it('exits successfully when every discovered select is valid', () => {
    const workspace = createWorkspace()
    writeFixture(workspace, 'chosen/user.select.ts', 'export const USER_SELECT = { id: true }')

    expect(() =>
      execFileSync(process.execPath, [toolPath, 'chosen'], {
        cwd: workspace,
        encoding: 'utf8',
      }),
    ).not.toThrow()
  })
})
