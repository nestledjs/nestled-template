import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const notesDir = '.nestled-updates/upgrade-notes'
const idPattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/

const getArgValue = (name: string): string | undefined => {
  const prefixed = `${name}=`
  const inline = process.argv.find(arg => arg.startsWith(prefixed))

  if (inline) {
    return inline.slice(prefixed.length)
  }

  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const id = getArgValue('--id')

if (!id) {
  console.error('Usage: pnpm template:create-upgrade-note --id YYYY-MM-DD-short-description')
  process.exit(1)
}

if (!idPattern.test(id)) {
  console.error('Upgrade note id must match YYYY-MM-DD-short-description.')
  process.exit(1)
}

const path = join(notesDir, `${id}.yaml`)

if (existsSync(path)) {
  console.error(`${path} already exists.`)
  process.exit(1)
}

const title = id
  .replace(/^\d{4}-\d{2}-\d{2}-/, '')
  .split('-')
  .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
  .join(' ')

writeFileSync(
  path,
  `id: ${id}
title: ${title}
priority: normal
area: api
type: correctness
delivery: code-patch

intent: >
  Describe the downstream behavior or invariant this change should preserve.

why: >
  Explain why this change matters for downstream projects.

affectedPaths:
  - apps/api/**

packageReleases: []

skipIf: []

verification:
  - pnpm lint
  - pnpm test

agentHints:
  - Describe where agents should look and what project-specific behavior they should preserve.
`,
)

console.log(`Created ${path}`)
