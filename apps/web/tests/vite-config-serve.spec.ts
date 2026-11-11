// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ConfigEnv, UserConfig, UserConfigFnObject } from 'vite'
import { describe, expect, it } from 'vitest'
import viteConfig from '../vite.config'

// `nx serve web --configuration=<name>` runs `vite <args>` from apps/web. Before the Nx 24
// migration the @nx/vite:dev-server executor set `hmr: false` for the production configuration;
// with plain `vite` that has to come from the config itself, keyed on the target's --mode.
const project = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../project.json'), 'utf8'),
) as { targets: { serve: { configurations: Record<string, { args: string }> } } }

function serveMode(configuration: string): string {
  const args = project.targets.serve.configurations[configuration].args
  const mode = /--mode[ =](\S+)/.exec(args)?.[1]
  if (!mode) throw new Error(`serve:${configuration} passes no --mode (${args})`)
  return mode
}

function serveConfig(configuration: string): UserConfig {
  const env: ConfigEnv = { command: 'serve', mode: serveMode(configuration) }
  return (viteConfig as UserConfigFnObject)(env)
}

describe('nx serve web', () => {
  it('serves the production configuration without hot reload', () => {
    expect(serveConfig('production').server?.hmr).toBe(false)
  })

  it('keeps hot reload for the development configuration', () => {
    expect(serveConfig('development').server?.hmr).toBe(true)
  })
})
