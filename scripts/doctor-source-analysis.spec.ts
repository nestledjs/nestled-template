import { describe, expect, it } from 'vitest'
import { stripComments } from './doctor-source-analysis'

describe('stripComments', () => {
  it('preserves comment openers inside string literals', () => {
    const source = [
      "route('checkouts/cn/:token/*', './routes/checkout.tsx')",
      'const url = "https://example.com/path"',
      'const pattern = `expand/*`',
      "const escaped = 'it\\'s still /* text */'",
    ].join('\n')

    expect(stripComments(source)).toBe(source)
  })

  it('removes actual comments while preserving block-comment line positions', () => {
    const source = [
      'const before = true',
      '/* hidden',
      'across lines */',
      '  // hidden line',
      'const after = true',
    ].join('\n')

    const stripped = stripComments(source)

    expect(stripped).not.toContain('hidden')
    expect(stripped).toContain('const before = true')
    expect(stripped).toContain('const after = true')
    expect(stripped.split('\n')).toHaveLength(source.split('\n').length)
  })
})
