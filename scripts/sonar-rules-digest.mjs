// Writes docs/quality/sonar-rules.md, a digest of the SonarCloud rules this repository is analysed
// with, so an agent or a reviewer can avoid a finding before the scan reports it.
//
// The digest is generated from docs/quality/sonar-rules.json, a committed copy of the TypeScript
// quality profile's active rules, so generating it needs no network and no credentials.
//
//   node scripts/sonar-rules-digest.mjs            regenerate the digest from the committed list
//   node scripts/sonar-rules-digest.mjs --check    exit 1 if the digest is out of date (CI)
//   node scripts/sonar-rules-digest.mjs --refresh  re-fetch the list from SonarCloud, then regenerate
//
// --refresh reads sonar.organization and sonar.projectKey from sonar-project.properties and asks
// SonarCloud which TypeScript quality profile the project uses. A public organization answers
// anonymously; a private one needs SONAR_TOKEN in the environment (a user token with Browse on the
// project). SONAR_HOST_URL overrides https://sonarcloud.io for a self-hosted SonarQube.

import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const RULES_FILE = 'docs/quality/sonar-rules.json'
export const DIGEST_FILE = 'docs/quality/sonar-rules.md'
const LANGUAGE = 'ts'

// Rules for frameworks and platforms the template does not use. They stay in the JSON (it is the
// profile as fetched) and are left out of the digest, which says how many it left out. A project
// that adopts one of these removes its tag from `excludeTags` in the JSON and regenerates.
export const DEFAULT_EXCLUDE_TAGS = [
  'angular',
  'aws',
  'bun',
  'chai',
  'cypress',
  'gcp',
  'jasmine',
  'karma',
  'lodash',
  'mocha',
  'puppeteer',
  'sinon',
  'underscore.js',
  'vue',
]

// A rule tagged for an unused framework is still kept when it is also tagged for one this codebase
// does use: a test rule tagged `mocha` and `jest` applies to the Jest and Vitest specs here.
export const KEEP_TAGS = [
  'express.js',
  'jest',
  'jsx',
  'node',
  'nodejs',
  'playwright',
  'react',
  'supertest',
  'testing-library',
  'vitest',
]

const SEVERITY_ORDER = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']

// Each rule is listed once, in the first section whose test it passes.
export const SECTIONS = [
  {
    title: 'React, JSX and accessibility',
    matches: rule => rule.tags.some(tag => ['react', 'jsx', 'accessibility'].includes(tag)),
  },
  {
    title: 'Tests',
    matches: rule =>
      rule.tags.some(tag =>
        ['tests', 'jest', 'vitest', 'playwright', 'testing-library'].includes(tag),
      ),
  },
  { title: 'Bugs', matches: rule => rule.type === 'BUG' },
  { title: 'Vulnerabilities', matches: rule => rule.type === 'VULNERABILITY' },
  { title: 'Code smells', matches: () => true },
]

/** The keys of a Java-style .properties file, with `\` line continuations joined. */
export function parseProperties(text) {
  const properties = {}
  const joined = text.replaceAll(/\\\r?\n[ \t]*/g, '')
  for (const rawLine of joined.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#') || line.startsWith('!')) continue
    const separator = line.search(/[=:]/)
    if (separator === -1) continue
    properties[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return properties
}

/** A rule as SonarCloud's api/rules/search returns it, reduced to what the digest reads. */
export function normalizeRule(rule) {
  return {
    key: rule.key,
    name: rule.name,
    type: rule.type,
    severity: rule.severity,
    tags: [...(rule.sysTags ?? []), ...(rule.tags ?? [])].filter(
      (tag, index, all) => all.indexOf(tag) === index,
    ),
  }
}

function ruleNumber(key) {
  const digits = /S(\d+)$/.exec(key)
  return digits ? Number(digits[1]) : Number.MAX_SAFE_INTEGER
}

export function compareRules(a, b) {
  const bySeverity = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  return bySeverity || ruleNumber(a.key) - ruleNumber(b.key) || a.key.localeCompare(b.key)
}

/**
 * Splits the rules into the digest's sections, leaving out rules only for excluded frameworks.
 *
 * A default-excluded tag the project took out of `excludeTags` is re-enabled, and keeps a rule
 * just as a KEEP_TAGS tag does: a rule tagged `aws` and `gcp` stays when the project turned `aws`
 * back on, even though `gcp` is still excluded.
 */
export function groupRules(rules, excludeTags = DEFAULT_EXCLUDE_TAGS) {
  const excluded = new Set(excludeTags)
  const keep = new Set([...KEEP_TAGS, ...DEFAULT_EXCLUDE_TAGS.filter(tag => !excluded.has(tag))])
  const isExcluded = rule =>
    rule.tags.some(tag => excluded.has(tag)) && !rule.tags.some(tag => keep.has(tag))
  const kept = rules.filter(rule => !isExcluded(rule))
  const sections = SECTIONS.map(section => ({ title: section.title, rules: [] }))
  for (const rule of kept) {
    const index = SECTIONS.findIndex(section => section.matches(rule))
    sections[index].rules.push(rule)
  }
  for (const section of sections) section.rules.sort(compareRules)
  return {
    sections: sections.filter(section => section.rules.length > 0),
    skipped: rules.length - kept.length,
  }
}

function escapeMarkdown(text) {
  return text.replaceAll(/([\\*_[\]<>|])/g, String.raw`\$1`)
}

// Only the TypeScript analyzer's own rules have a page on rules.sonarsource.com under that language;
// the others (architecture, for one) are listed by key alone.
function ruleLine(rule) {
  const separator = rule.key.indexOf(':')
  const repository = rule.key.slice(0, separator)
  const id = rule.key.slice(separator + 1)
  const label =
    repository === 'typescript'
      ? `[${id}](https://rules.sonarsource.com/typescript/RSPEC-${id.slice(1)}/)`
      : `${id} (${repository})`
  return `- ${label} (${rule.severity.toLowerCase()}): ${escapeMarkdown(rule.name)}`
}

function withoutTrailingSlashes(url) {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') end--
  return url.slice(0, end)
}

/** The digest's Markdown, before Prettier. */
export function renderDigest(list) {
  const { sections, skipped } = groupRules(list.rules, list.excludeTags ?? DEFAULT_EXCLUDE_TAGS)
  const listed = sections.reduce((total, section) => total + section.rules.length, 0)
  const source = list.source ?? {}
  const lines = [
    '# SonarCloud rules digest',
    '',
    '<!-- Generated by scripts/sonar-rules-digest.mjs from docs/quality/sonar-rules.json. Do not edit by hand. -->',
    '',
    `The ${listed} active rules of the \`${source.profile ?? 'unknown'}\` TypeScript quality profile`,
    `(fetched ${source.fetchedAt ?? 'unknown'}) that apply to this codebase, so you can avoid a`,
    'finding before the scan reports it. Each links to the rule description, with compliant and',
    'non-compliant examples.',
    '',
    `${skipped} more rules in the profile are for frameworks this codebase does not use (tags:`,
    `${(list.excludeTags ?? DEFAULT_EXCLUDE_TAGS).join(', ')}) and are left out.`,
    '',
    'Refresh the list with `pnpm sonar:rules-digest --refresh` (a private organization needs',
    '`SONAR_TOKEN`), or regenerate this file from the committed list with `pnpm sonar:rules-digest`.',
    'CI fails when this file and `docs/quality/sonar-rules.json` disagree.',
  ]
  for (const section of sections) {
    lines.push(
      '',
      `## ${section.title} (${section.rules.length})`,
      '',
      ...section.rules.map(ruleLine),
    )
  }
  return lines.join('\n') + '\n'
}

// Formatted with the repository's Prettier and its config, so the files pass `prettier --check .`.
async function formatForFile(text, filePath) {
  const prettier = await import('prettier')
  const options = (await prettier.resolveConfig(filePath)) ?? {}
  return prettier.format(text, { ...options, filepath: filePath })
}

export async function buildDigest(list, digestPath) {
  return formatForFile(renderDigest(list), digestPath)
}

async function getJson(fetchImpl, url, token) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetchImpl(url, { headers })
  if (!response.ok) {
    const hint = token ? '' : ' A private organization needs SONAR_TOKEN.'
    throw new Error(`${url.split('?')[0]} answered ${response.status}.${hint}`)
  }
  return response.json()
}

/** Fetches the project's TypeScript quality profile and its active rules. */
export async function fetchRules({ host, organization, projectKey, token, fetchImpl = fetch }) {
  const base = withoutTrailingSlashes(host)
  const profiles = await getJson(
    fetchImpl,
    `${base}/api/qualityprofiles/search?${new URLSearchParams({ organization, project: projectKey })}`,
    token,
  )
  const profile = (profiles.profiles ?? []).find(candidate => candidate.language === LANGUAGE)
  if (!profile) throw new Error(`No ${LANGUAGE} quality profile found for ${projectKey}.`)

  const rules = []
  const pageSize = 500
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({
      organization,
      qprofile: profile.key,
      activation: 'true',
      ps: String(pageSize),
      p: String(page),
      f: 'name,severity,sysTags,tags',
    })
    const result = await getJson(fetchImpl, `${base}/api/rules/search?${query}`, token)
    rules.push(...(result.rules ?? []).map(normalizeRule))
    if ((result.rules ?? []).length < pageSize || rules.length >= (result.total ?? 0)) break
  }
  rules.sort((a, b) => a.key.localeCompare(b.key))
  return { profile: profile.name, rules }
}

export async function main(
  argv = process.argv.slice(2),
  { root = workspaceRoot, fetchImpl = fetch, env = process.env, log = console.log } = {},
) {
  const unknown = argv.filter(arg => !['--check', '--refresh'].includes(arg))
  if (unknown.length > 0 || (argv.includes('--check') && argv.includes('--refresh'))) {
    console.error('Usage: node scripts/sonar-rules-digest.mjs [--check | --refresh]')
    return 2
  }
  const rulesPath = join(root, RULES_FILE)
  const digestPath = join(root, DIGEST_FILE)
  let list = JSON.parse(readFileSync(rulesPath, 'utf8'))

  if (argv.includes('--refresh')) {
    const properties = parseProperties(readFileSync(join(root, 'sonar-project.properties'), 'utf8'))
    const fetched = await fetchRules({
      host: env.SONAR_HOST_URL || 'https://sonarcloud.io',
      organization: properties['sonar.organization'],
      projectKey: properties['sonar.projectKey'],
      token: env.SONAR_TOKEN,
      fetchImpl,
    })
    list = {
      source: {
        profile: fetched.profile,
        language: LANGUAGE,
        fetchedAt: new Date().toISOString().slice(0, 10),
      },
      excludeTags: list.excludeTags ?? DEFAULT_EXCLUDE_TAGS,
      rules: fetched.rules,
    }
    writeFileSync(rulesPath, await formatForFile(JSON.stringify(list, null, 2), rulesPath))
    log(`Fetched ${list.rules.length} active rules into ${RULES_FILE}.`)
  }

  const digest = await buildDigest(list, digestPath)
  if (argv.includes('--check')) {
    let current = ''
    try {
      current = readFileSync(digestPath, 'utf8')
    } catch {
      // A missing digest is out of date like any other.
    }
    if (current !== digest) {
      console.error(
        `${DIGEST_FILE} is out of date. Run \`pnpm sonar:rules-digest\` and commit the result.`,
      )
      return 1
    }
    log(`${DIGEST_FILE} is up to date.`)
    return 0
  }
  writeFileSync(digestPath, digest)
  log(`Wrote ${DIGEST_FILE}.`)
  return 0
}

// Compared as real filesystem paths: a URL built from argv would misread `#` or `%` in the checkout
// path, and Node resolves a symlinked script to its target.
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]))
if (isMain) process.exitCode = await main()
