import { describe, expect, it } from 'vitest'
import { getRegisteredModuleClasses, type NestModuleSource } from './doctor-module-analysis'

const moduleSource = (file: string, source: string): NestModuleSource => ({ file, source })

describe('getRegisteredModuleClasses', () => {
  it('follows module imports transitively from the application root', () => {
    const registered = getRegisteredModuleClasses(
      [
        moduleSource(
          'apps/api/src/app.module.ts',
          `
            const pluginModules = [ConsumerModule] as const
            const appModules = [...pluginModules] satisfies unknown[]
            @Module({ imports: [...appModules] })
            export class AppModule {}
          `,
        ),
        moduleSource(
          'libs/api/consumer.module.ts',
          `
            @Module({ imports: [SharedPluginModule] })
            export class ConsumerModule {}
          `,
        ),
        moduleSource(
          'libs/api/shared-plugin.module.ts',
          `
            @Module({})
            export class SharedPluginModule {}
          `,
        ),
      ],
      'apps/api/src/app.module.ts',
    )

    expect(registered).toEqual(new Set(['AppModule', 'ConsumerModule', 'SharedPluginModule']))
  })

  it('does not treat imports from a disconnected module as application registration', () => {
    const registered = getRegisteredModuleClasses(
      [
        moduleSource(
          'apps/api/src/app.module.ts',
          `
            @Module({ imports: [] })
            export class AppModule {}
          `,
        ),
        moduleSource(
          'libs/api/detached.module.ts',
          `
            @Module({ imports: [OrphanPluginModule] })
            export class DetachedModule {}
          `,
        ),
        moduleSource(
          'libs/api/orphan-plugin.module.ts',
          `
            @Module({})
            export class OrphanPluginModule {}
          `,
        ),
      ],
      'apps/api/src/app.module.ts',
    )

    expect(registered).toEqual(new Set(['AppModule']))
  })

  it('recognizes modules passed through dynamic-module and forwardRef calls', () => {
    const registered = getRegisteredModuleClasses(
      [
        moduleSource(
          'apps/api/src/app.module.ts',
          `
            @Module({ imports: [ConfigModule.forRoot(), forwardRef(() => PluginModule)] })
            export class RootApiModule {}
          `,
        ),
        moduleSource(
          'libs/api/config.module.ts',
          `
            @Module({})
            export class ConfigModule {}
          `,
        ),
        moduleSource(
          'libs/api/plugin.module.ts',
          `
            @Module({})
            export class PluginModule {}
          `,
        ),
      ],
      'apps/api/src/app.module.ts',
    )

    expect(registered).toEqual(new Set(['RootApiModule', 'ConfigModule', 'PluginModule']))
  })
})
