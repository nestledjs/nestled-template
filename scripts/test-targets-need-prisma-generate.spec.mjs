import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PRISMA_PROJECT = 'api-prisma'

/** Every folder under libs/api holding a project.json, as repo-relative paths. */
function apiProjectRoots(folder = join(root, 'libs/api')) {
  const found = []
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.'))
      continue
    const path = join(folder, entry.name)
    if (existsSync(join(path, 'project.json'))) found.push(relative(root, path))
    found.push(...apiProjectRoots(path))
  }
  return found
}

/**
 * A libs/api project's Jest suite compiles against the generated Prisma client. Nothing orders the
 * inferred `test` target after `api-prisma:generate` unless the project says so, so on a clean
 * checkout (or whenever Nx schedules them together) the suite can compile against a missing or
 * half-written client and fail with TS7006/TS2339 in files the change never touched.
 */
describe('libs/api test targets', () => {
  const projects = apiProjectRoots().filter(projectRoot =>
    readdirSync(join(root, projectRoot)).some(name => /^jest\.config\.[cm]?[jt]s$/.test(name)),
  )

  it('finds the API projects with a Jest suite', () => {
    assert.ok(projects.length > 0, 'no libs/api project with a jest.config was found')
  })

  for (const projectRoot of projects) {
    it(`${projectRoot} runs api-prisma:generate before its tests`, () => {
      const project = JSON.parse(readFileSync(join(root, projectRoot, 'project.json'), 'utf8'))
      const needed = project.name === PRISMA_PROJECT ? 'generate' : `${PRISMA_PROJECT}:generate`
      const dependsOn = project.targets?.test?.dependsOn ?? []
      const declared = dependsOn.includes(needed)
      assert.ok(
        declared,
        `${projectRoot}/project.json: targets.test.dependsOn must include "${needed}"`,
      )
    })
  }
})
