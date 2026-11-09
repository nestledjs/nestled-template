import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  DIGEST_FILE,
  RULES_FILE,
  compareRules,
  fetchRules,
  groupRules,
  main,
  normalizeRule,
  parseProperties,
  renderDigest,
} from './sonar-rules-digest.mjs'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function rule(key, overrides = {}) {
  return { key, name: `Rule ${key}`, type: 'CODE_SMELL', severity: 'MAJOR', tags: [], ...overrides }
}

function workspace(list) {
  const root = mkdtempSync(join(tmpdir(), 'sonar-rules-digest-'))
  roots.push(root)
  mkdirSync(join(root, 'docs', 'quality'), { recursive: true })
  writeFileSync(join(root, RULES_FILE), JSON.stringify(list))
  writeFileSync(
    join(root, 'sonar-project.properties'),
    'sonar.projectKey=example_app\nsonar.organization=example-org\n',
  )
  return root
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const quiet = { log: () => {} }

describe('parseProperties', () => {
  it('reads keys, joins continued lines and skips comments', () => {
    const properties = parseProperties(
      '# comment\n! also a comment\nsonar.projectKey=example_app\nsonar.sources=\\\n  apps,\\\n  libs\nsonar.organization: example-org\n',
    )
    assert.deepEqual(properties, {
      'sonar.projectKey': 'example_app',
      'sonar.sources': 'apps,libs',
      'sonar.organization': 'example-org',
    })
  })
})

describe('normalizeRule', () => {
  it('keeps what the digest reads and merges system and custom tags once', () => {
    assert.deepEqual(
      normalizeRule({
        key: 'typescript:S1',
        name: 'One',
        type: 'BUG',
        severity: 'MINOR',
        sysTags: ['react', 'tests'],
        tags: ['react', 'team'],
        impacts: [],
      }),
      {
        key: 'typescript:S1',
        name: 'One',
        type: 'BUG',
        severity: 'MINOR',
        tags: ['react', 'tests', 'team'],
      },
    )
  })
})

describe('groupRules', () => {
  it('lists each rule once, in the first section it matches, and leaves out excluded tags', () => {
    const { sections, skipped } = groupRules(
      [
        rule('typescript:S10', { type: 'BUG', tags: ['react'] }),
        rule('typescript:S11', { type: 'BUG', tags: ['jest'] }),
        rule('typescript:S12', { type: 'BUG' }),
        rule('typescript:S13', { type: 'VULNERABILITY' }),
        rule('typescript:S14'),
        rule('typescript:S15', { tags: ['vue'] }),
      ],
      ['vue'],
    )
    assert.equal(skipped, 1)
    assert.deepEqual(
      sections.map(section => [section.title, section.rules.map(r => r.key)]),
      [
        ['React, JSX and accessibility', ['typescript:S10']],
        ['Tests', ['typescript:S11']],
        ['Bugs', ['typescript:S12']],
        ['Vulnerabilities', ['typescript:S13']],
        ['Code smells', ['typescript:S14']],
      ],
    )
  })

  it('keeps a rule tagged for an excluded framework when it is also tagged for a used one', () => {
    const { sections, skipped } = groupRules(
      [
        rule('typescript:S6426', { tags: ['tests', 'mocha', 'jest', 'vitest'] }),
        rule('typescript:S2', { tags: ['mocha'] }),
      ],
      ['mocha'],
    )
    assert.equal(skipped, 1)
    assert.deepEqual(
      sections.flatMap(section => section.rules.map(r => r.key)),
      ['typescript:S6426'],
    )
  })

  it('drops empty sections', () => {
    const { sections } = groupRules([rule('typescript:S1')], [])
    assert.deepEqual(
      sections.map(section => section.title),
      ['Code smells'],
    )
  })
})

describe('compareRules', () => {
  it('orders by severity, then by rule number rather than by text', () => {
    const sorted = [
      rule('typescript:S100', { severity: 'MINOR' }),
      rule('typescript:S20'),
      rule('typescript:S3', { severity: 'BLOCKER' }),
      rule('typescript:S100'),
    ].sort(compareRules)
    assert.deepEqual(
      sorted.map(r => `${r.severity} ${r.key}`),
      [
        'BLOCKER typescript:S3',
        'MAJOR typescript:S20',
        'MAJOR typescript:S100',
        'MINOR typescript:S100',
      ],
    )
  })
})

describe('renderDigest', () => {
  it('links TypeScript rules, names other repositories and escapes Markdown in rule names', () => {
    const markdown = renderDigest({
      source: { profile: 'Example way', fetchedAt: '2026-01-02' },
      excludeTags: ['vue'],
      rules: [
        rule('typescript:S5257', { name: 'HTML "<table>" should not be used for *layout*' }),
        rule('tssecurity:S2076', { type: 'VULNERABILITY', severity: 'BLOCKER' }),
        rule('typescript:S1', { tags: ['vue'] }),
      ],
    })
    assert.match(markdown, /The 2 active rules of the `Example way` TypeScript quality profile/)
    assert.match(markdown, /\(fetched 2026-01-02\)/)
    assert.match(markdown, /^1 more rules in the profile/m)
    assert.match(
      markdown,
      /^- \[S5257\]\(https:\/\/rules\.sonarsource\.com\/typescript\/RSPEC-5257\/\) \(major\): HTML "\\<table\\>" should not be used for \\\*layout\\\*$/m,
    )
    assert.match(markdown, /^- S2076 \(tssecurity\) \(blocker\): Rule tssecurity:S2076$/m)
    assert.match(markdown, /^## Vulnerabilities \(1\)$/m)
    assert.doesNotMatch(markdown, /typescript:S1\b/)
  })
})

describe('fetchRules', () => {
  it('finds the TypeScript profile and pages through its active rules with the token', async () => {
    const requests = []
    const fetchImpl = async (url, options) => {
      requests.push({ url, authorization: options.headers.Authorization })
      if (url.includes('/api/qualityprofiles/search')) {
        return jsonResponse({
          profiles: [
            { key: 'js-profile', name: 'JS way', language: 'js' },
            { key: 'ts-profile', name: 'TS way', language: 'ts' },
          ],
        })
      }
      const page = Number(new URL(url).searchParams.get('p'))
      const rules = Array.from({ length: page === 1 ? 500 : 2 }, (_, i) => ({
        key: `typescript:S${page * 1000 + i}`,
        name: 'n',
        type: 'BUG',
        severity: 'MAJOR',
        sysTags: [],
      }))
      return jsonResponse({ total: 502, rules })
    }
    const result = await fetchRules({
      host: 'https://sonar.example.test//',
      organization: 'example-org',
      projectKey: 'example_app',
      token: 'token-value',
      fetchImpl,
    })
    assert.equal(result.profile, 'TS way')
    assert.equal(result.rules.length, 502)
    assert.equal(requests.length, 3)
    assert.ok(requests.every(request => request.authorization === 'Bearer token-value'))
    assert.ok(requests[0].url.startsWith('https://sonar.example.test/api/qualityprofiles/search?'))
    assert.equal(new URL(requests[1].url).searchParams.get('qprofile'), 'ts-profile')
    assert.equal(new URL(requests[1].url).searchParams.get('activation'), 'true')
  })

  it('says a private organization needs SONAR_TOKEN when an anonymous request is refused', async () => {
    await assert.rejects(
      fetchRules({
        host: 'https://sonar.example.test',
        organization: 'example-org',
        projectKey: 'example_app',
        fetchImpl: async () => jsonResponse({}, 403),
      }),
      /answered 403\. A private organization needs SONAR_TOKEN\./,
    )
  })

  it('fails when the project has no TypeScript profile', async () => {
    await assert.rejects(
      fetchRules({
        host: 'https://sonar.example.test',
        organization: 'example-org',
        projectKey: 'example_app',
        fetchImpl: async () =>
          jsonResponse({ profiles: [{ key: 'k', name: 'JS', language: 'js' }] }),
      }),
      /No ts quality profile found for example_app\./,
    )
  })
})

describe('main', () => {
  const list = {
    source: { profile: 'Example way', fetchedAt: '2026-01-02' },
    excludeTags: [],
    rules: [rule('typescript:S1')],
  }

  it('writes the digest, then --check passes until the list changes', async () => {
    const root = workspace(list)
    assert.equal(await main([], { root, ...quiet }), 0)
    assert.match(readFileSync(join(root, DIGEST_FILE), 'utf8'), /^# SonarCloud rules digest/)
    assert.equal(await main(['--check'], { root, ...quiet }), 0)

    writeFileSync(
      join(root, RULES_FILE),
      JSON.stringify({ ...list, rules: [...list.rules, rule('typescript:S2')] }),
    )
    assert.equal(await main(['--check'], { root, ...quiet }), 1)
  })

  it('--check fails when the digest is missing', async () => {
    assert.equal(await main(['--check'], { root: workspace(list), ...quiet }), 1)
  })

  it('--refresh replaces the rules, keeps the excluded tags and regenerates', async () => {
    const root = workspace({ ...list, excludeTags: ['vue'] })
    const fetchImpl = async url =>
      url.includes('qualityprofiles')
        ? jsonResponse({ profiles: [{ key: 'ts-profile', name: 'Fetched way', language: 'ts' }] })
        : jsonResponse({
            total: 1,
            rules: [{ key: 'typescript:S9', name: 'Nine', type: 'BUG', severity: 'MAJOR' }],
          })
    assert.equal(await main(['--refresh'], { root, fetchImpl, env: {}, ...quiet }), 0)
    const refreshed = JSON.parse(readFileSync(join(root, RULES_FILE), 'utf8'))
    assert.equal(refreshed.source.profile, 'Fetched way')
    assert.deepEqual(refreshed.excludeTags, ['vue'])
    assert.deepEqual(
      refreshed.rules.map(r => r.key),
      ['typescript:S9'],
    )
    assert.match(readFileSync(join(root, DIGEST_FILE), 'utf8'), /Nine/)
  })

  it('rejects unknown arguments and --check with --refresh', async () => {
    const root = workspace(list)
    assert.equal(await main(['--wat'], { root, ...quiet }), 2)
    assert.equal(await main(['--check', '--refresh'], { root, ...quiet }), 2)
  })
})
