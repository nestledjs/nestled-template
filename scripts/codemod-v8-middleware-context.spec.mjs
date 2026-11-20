import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  findContextReads,
  run,
  transformConfig,
  transformEntryServer,
  transformLoadContext,
  transformSpecContext,
} from './codemod-v8-middleware-context.mjs'

describe('codemod-v8-middleware-context', () => {
  describe('react-router.config', () => {
    it('adds the flag to a config with no future', () => {
      const text = "export default {\n  ssr: true,\n  appDirectory: 'app',\n} satisfies Config\n"
      const result = transformConfig('react-router.config.ts', text)
      assert.match(result.text, /future: \{ v8_middleware: true \},/)
      assert.match(result.text, /appDirectory: 'app',\n {2}\/\/ Route middleware/)
      assert.equal(transformConfig('react-router.config.ts', result.text).text, result.text)
    })

    it('adds the flag to an existing future, and leaves a set flag alone', () => {
      const text = 'export default { future: { unstable_optimizeDeps: true } }\n'
      const once = transformConfig('react-router.config.ts', text).text
      assert.match(once, /future: \{ unstable_optimizeDeps: true, v8_middleware: true \}/)
      assert.deepEqual(transformConfig('react-router.config.ts', once).changes, [])
    })

    it('turns a false flag on', () => {
      const text = 'const config = { future: { v8_middleware: false } }\nexport default config\n'
      assert.match(transformConfig('c.ts', text).text, /v8_middleware: true/)
    })
  })

  describe('getLoadContext', () => {
    it('returns a RouterContextProvider for an empty context, importing it', () => {
      const text = [
        "import express from 'express'",
        'createRequestHandler({',
        '  getLoadContext() {',
        '    return {',
        '      // Add any context you need',
        '    }',
        '  },',
        '})',
        '',
      ].join('\n')
      const result = transformLoadContext('server.js', text)
      assert.match(result.text, /import \{ RouterContextProvider \} from 'react-router'/)
      assert.match(result.text, /return new RouterContextProvider\(\)/)
      assert.equal(result.todos.length, 0)
      assert.equal(transformLoadContext('server.js', result.text).text, result.text)
    })

    it('handles an arrow function and an existing react-router import', () => {
      const text =
        "import { createRequestHandler } from 'react-router'\nh({ getLoadContext: () => ({}) })\n"
      const result = transformLoadContext('server.js', text).text
      assert.match(
        result,
        /import \{ createRequestHandler, RouterContextProvider \} from 'react-router'/,
      )
      assert.match(result, /getLoadContext: \(\) => new RouterContextProvider\(\)/)
    })

    it('reports a context with keys and changes nothing', () => {
      const text = 'h({ getLoadContext(req) { return { userId: req.user, tenant } } })\n'
      const result = transformLoadContext('server.js', text)
      assert.equal(result.text, text)
      assert.equal(result.todos.length, 1)
      assert.match(result.todos[0].todo, /keys \(userId, tenant\)/)
    })
  })

  describe('entry.server', () => {
    it('types the load-context parameter RouterContextProvider and drops the unused import', () => {
      const text = [
        "import type { AppLoadContext, EntryContext } from 'react-router'",
        "import { ServerRouter } from 'react-router'",
        'export default function handleRequest(request: Request, context: EntryContext, _loadContext: AppLoadContext) {}',
        '',
      ].join('\n')
      const result = transformEntryServer('entry.server.tsx', text).text
      assert.match(result, /import type \{ EntryContext \} from 'react-router'/)
      assert.match(result, /import \{ ServerRouter, RouterContextProvider \} from 'react-router'/)
      assert.match(result, /_loadContext: RouterContextProvider\)/)
      assert.equal(transformEntryServer('entry.server.tsx', result).text, result)
    })
  })

  describe('context reads', () => {
    it('reports context.<key> and destructured keys in loaders and actions only', () => {
      const text = [
        'export async function loader({ request, context }) {',
        '  return context.userId',
        '}',
        'export const action = async ({ context: { tenant } }) => tenant',
        'export async function loaderOk({ context }) {',
        '  return context.get(sessionContext)',
        '}',
        'function helper(context) { return context.other }',
        '',
      ].join('\n')
      const todos = findContextReads('route.tsx', text)
      assert.deepEqual(
        todos.map(({ line }) => line),
        [2, 4],
      )
      assert.match(todos[0].todo, /context\.userId/)
      assert.match(todos[1].todo, /context\.tenant/)
    })

    it('ignores context.get and context.set', () => {
      const text =
        'export function loader({ context }) {\n  context.set(a, 1)\n  return context.get(a)\n}\n'
      assert.deepEqual(findContextReads('route.tsx', text), [])
    })
  })

  describe('specs', () => {
    it('gives a loader called with context: {} a RouterContextProvider', () => {
      const text =
        "import { loader } from './x'\nloader({ request, params: {}, context: {} } as any)\n"
      const result = transformSpecContext('x.spec.ts', text)
      assert.match(result.text, /context: new RouterContextProvider\(\)/)
      assert.match(result.text, /import \{ RouterContextProvider \} from 'react-router'/)
      assert.equal(transformSpecContext('x.spec.ts', result.text).text, result.text)
    })
  })

  describe('a whole app', () => {
    let root
    const write = (path, text) => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    const read = path => readFileSync(join(root, path), 'utf8')

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'codemod-v8-'))
      write('apps/web/react-router.config.ts', 'export default {\n  ssr: true,\n}\n')
      write('apps/web/server.js', 'h({\n  getLoadContext() {\n    return {}\n  },\n})\n')
      write(
        'apps/web/app-load-context.d.ts',
        "import 'react-router'\n\ndeclare module 'react-router' {\n  interface AppLoadContext {\n    userId?: string\n  }\n}\n",
      )
      write(
        'apps/web/tsconfig.app.json',
        '{\n  "include": [\n    "app/**/*.ts",\n    "app-load-context.d.ts"\n  ]\n}\n',
      )
      write('apps/web/app/routes/page.tsx', 'export function loader() {\n  return null\n}\n')
      write('apps/web/tests/page.spec.ts', 'loader({ request, context: {} })\n')
    })

    afterEach(() => rmSync(root, { recursive: true, force: true }))

    it('migrates the template shape fully, and a second run changes nothing', () => {
      const first = run({ root })
      assert.deepEqual(first.todos, [])
      // config, server.js, the augmentation, its tsconfig include, the spec.
      assert.equal(first.changes.length, 5)
      assert.equal(existsSync(join(root, 'apps/web/app-load-context.d.ts')), false)
      assert.deepEqual(JSON.parse(read('apps/web/tsconfig.app.json')).include, ['app/**/*.ts'])
      assert.match(read('apps/web/react-router.config.ts'), /v8_middleware: true/)
      assert.match(read('apps/web/tests/page.spec.ts'), /new RouterContextProvider\(\)/)

      const second = run({ root })
      assert.deepEqual(second.changes, [])
      assert.deepEqual(second.todos, [])
    })

    it('keeps an augmentation still read, and reports both the read and the augmentation', () => {
      write(
        'apps/web/app/routes/page.tsx',
        'export function loader({ context }) {\n  return context.userId\n}\n',
      )
      const result = run({ root })
      assert.equal(existsSync(join(root, 'apps/web/app-load-context.d.ts')), true)
      assert.equal(result.todos.length, 2)
    })

    it('writes nothing on a dry run', () => {
      const before = read('apps/web/server.js')
      const result = run({ root, write: false })
      assert.ok(result.changes.length > 0)
      assert.equal(read('apps/web/server.js'), before)
      assert.equal(existsSync(join(root, 'apps/web/app-load-context.d.ts')), true)
    })
  })
})
