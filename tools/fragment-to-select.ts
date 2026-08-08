#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildPrismaSelectFromFragments,
  type DatabaseModelMetadata,
  type GraphqlSource,
  type PrismaSelect,
} from '../scripts/doctor-sdk-contract-analysis'

const usage = `Usage:
  pnpm exec tsx tools/fragment-to-select.ts <repo> <model-folder> [SELECT_NAME]

Derives a reviewed starting point for an explicit Prisma select from application SDK fragments.
The GraphQL AST ignores # comments, follows fragments across libs/shared/sdk/src/graphql, and
filters every field through generated DATABASE_MODELS metadata. Without that filter, GraphQL-only
@ResolveField values would be emitted as nonexistent Prisma columns. Review authorization
separately, then run pnpm verify:selects after adding or changing the select.`

const walkGraphqlFiles = (directory: string): string[] => {
  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) files.push(...walkGraphqlFiles(path))
    else if (stat.isFile() && path.endsWith('.graphql')) files.push(path)
  }
  return files.sort()
}

const toGraphqlSource = (file: string): GraphqlSource => ({
  file,
  source: readFileSync(file, 'utf8'),
})

const kebabCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

const defaultSelectName = (modelFolder: string): string =>
  `${modelFolder.toUpperCase().replaceAll('-', '_')}_FIELDS`

const renderSelect = (select: PrismaSelect, indent = 2): string => {
  const padding = ' '.repeat(indent)
  const lines: string[] = []
  for (const [fieldName, value] of Object.entries(select)) {
    if (value === true) {
      lines.push(`${padding}${fieldName}: true,`)
    } else {
      lines.push(`${padding}${fieldName}: {`)
      lines.push(`${padding}  select: {`)
      lines.push(renderSelect(value.select, indent + 4))
      lines.push(`${padding}  },`)
      lines.push(`${padding}},`)
    }
  }
  return lines.join('\n')
}

const requireDirectory = (path: string, label: string): void => {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${path}`)
  }
}

const requireFile = (path: string, label: string): void => {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`${label} does not exist or is not a file: ${path}`)
  }
}

const main = async (): Promise<void> => {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage)
    return
  }
  if (args.length < 2 || args.length > 3) {
    console.error(usage)
    process.exitCode = 1
    return
  }

  const [repoArgument, modelFolder, selectNameArgument] = args
  const repo = resolve(repoArgument)
  const graphqlRoot = join(repo, 'libs/shared/sdk/src/graphql')
  const modelDirectory = join(graphqlRoot, modelFolder)
  const metadataPath = join(repo, 'libs/shared/sdk/src/lib/database-models.ts')
  requireDirectory(repo, 'Repository root')
  requireDirectory(graphqlRoot, 'Application SDK GraphQL directory')
  requireDirectory(modelDirectory, `SDK model folder ${modelFolder}`)
  requireFile(metadataPath, 'Generated database metadata')
  const metadataModule = (await import(pathToFileURL(metadataPath).href)) as {
    DATABASE_MODELS: DatabaseModelMetadata[]
  }
  const { DATABASE_MODELS } = metadataModule
  const allSources = walkGraphqlFiles(graphqlRoot).map(toGraphqlSource)
  const rootSources = walkGraphqlFiles(modelDirectory).map(toGraphqlSource)
  const targetModel = DATABASE_MODELS.find(model => kebabCase(model.modelName) === modelFolder)
  if (!targetModel) {
    throw new Error(`No DATABASE_MODELS entry matches SDK folder ${modelFolder}`)
  }

  const result = buildPrismaSelectFromFragments({
    allSources,
    models: DATABASE_MODELS,
    rootSources,
    targetModelName: targetModel.modelName,
  })
  if (result.missingFragments.length > 0) {
    throw new Error(`Missing fragment definitions: ${result.missingFragments.join(', ')}`)
  }

  const selectName = selectNameArgument ?? defaultSelectName(basename(modelFolder))
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(selectName)) {
    throw new Error(`Invalid TypeScript identifier: ${selectName}`)
  }

  console.log(`// Derived from the union of: ${result.fragmentNames.join(', ')}`)
  if (result.skippedFields.length > 0) {
    console.log(`// Skipped GraphQL-only fields: ${result.skippedFields.join(', ')}`)
  }
  console.log('// Review every field and relation before use; requested does not mean authorized.')
  console.log('// Regenerate with tools/fragment-to-select.py after any fragment change.')
  console.log(`const ${selectName} = {`)
  console.log(renderSelect(result.select))
  console.log('} as const')
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
