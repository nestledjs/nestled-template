import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { getDMMF } from '@prisma/internals'

function extractQuotedStrings(input: string): string[] {
  const values: string[] = []
  const regex = /['"`]([^'"`]+)['"`]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(input)) !== null) {
    values.push(match[1])
  }
  return values
}

// Helper to extract the argument string of path.join(), handling nested parentheses
function extractPathJoinArgs(content: string): string | null {
  const needle = 'path.join('
  const pathJoinIndex = content.indexOf(needle)
  if (pathJoinIndex === -1) return null
  let start = content.indexOf('(', pathJoinIndex)
  if (start === -1) return null
  start++ // move past '('
  let depth = 1
  let end = start
  while (end < content.length && depth > 0) {
    const ch = content[end]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    end++
  }
  if (depth === 0) {
    return content.slice(start, end - 1)
  }
  return null
}

// Parse `schema` from prisma.config.ts content
function parseSchemaPathSettingFromConfigContent(content: string): string | null {
  const joinArgs = extractPathJoinArgs(content)
  if (joinArgs) {
    const parts = extractQuotedStrings(joinArgs)
    if (parts.length) return parts.join('/')
  }
  const schemaMatch = /schema\s*:\s*['"`]([^'"`]+)['"`]/.exec(content)
  return schemaMatch?.[1] ?? null
}

// Resolve schema setting from prisma.config.ts or package.json
function getSchemaPathSetting(projectRoot: string): string | null {
  const configPath = join(projectRoot, 'prisma.config.ts')
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, 'utf-8')
    const fromConfig = parseSchemaPathSettingFromConfigContent(content)
    if (fromConfig) return fromConfig
  }

  try {
    const packageJsonPath = join(projectRoot, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    return packageJson?.prisma?.schema ?? null
  } catch {
    return null
  }
}

function findRootViaDevkit(startDir: string): string | null {
  try {
    const { findRootSync } = require('@nx/devkit')
    return findRootSync(startDir)
  } catch {
    return null
  }
}

// Find project root and get schema path from package.json
function findProjectRoot(startDir: string): string {
  try {
    return findRootViaDevkit(startDir) ?? process.cwd()
  } catch (error) {
    console.error('Error finding project root:', error)
    return process.cwd()
  }
}

// Determine the correct prisma import path based on configuration
function getPrismaImportPath(): string {
  try {
    const projectRoot = findProjectRoot(__dirname)
    const schemaPathSetting = getSchemaPathSetting(projectRoot) ?? ''

    if (
      schemaPathSetting.includes('libs/api/prisma') ||
      schemaPathSetting.includes('prisma/src/lib')
    ) {
      return '@nestled-template/api/prisma'
    }
    return '@nestled-template/api/core/data-access'
  } catch (error) {
    console.error('Error determining Prisma import path:', error)
    // Default to the new path as a sensible fallback
    return '@nestled-template/api/prisma'
  }
}

// Get schema directory path from configuration
function getPrismaSchemaDir(): string {
  // Renamed
  try {
    const projectRoot = findProjectRoot(__dirname)
    const setting = getSchemaPathSetting(projectRoot)
    if (setting) return join(projectRoot, setting)
    throw new Error('Prisma schema path not found in config or package.json')
  } catch (error) {
    console.error('Error getting Prisma schema directory path:', error)
    // Fallback to the old directory path for backward compatibility
    return join(__dirname, '../../../data-access/src/prisma/schemas') // Assuming this was the directory
  }
}

// Paths
const schemaDir = getPrismaSchemaDir() // Renamed variable
const outputDir = join(__dirname, './models')
const prismaImportPath = getPrismaImportPath()

async function main() {
  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // Verify schema directory exists and is a directory
  if (!existsSync(schemaDir) || !lstatSync(schemaDir).isDirectory()) {
    console.error(`Error: Prisma schema directory not found or is not a directory at ${schemaDir}`)
    console.error('Please check your package.json prisma.schema configuration.')
    process.exit(1)
  }

  // Generate Prisma client first (Prisma CLI handles directory schemas well)
  console.log(`Generating Prisma client using schema files in ${schemaDir}...`)
  // Note: Prisma CLI will look for a schema.prisma file in this dir,
  // or process all .prisma files if it's configured for multi-file.
  // For `prisma generate`, it's often best if there's a primary schema.prisma that imports others,
  // or if all files are at the same level.
  // If `prisma generate` itself fails, you might need to adjust how Prisma is set up for multi-file schemas.
  // For now, we assume `prisma generate` works with the directory.
  execSync(`npx prisma generate --schema "${schemaDir}"`, { stdio: 'inherit' })
  // Alternatively, if your Prisma setup truly supports just passing the directory:
  // execSync(`npx prisma generate --schema "${schemaDir}"`, { stdio: 'inherit' });
  // Pick the one that works for your `prisma generate` setup. If you have a main `schema.prisma` that
  // is just configuration and other files hold models/enums, pointing `prisma generate` to that
  // `schema.prisma` specifically might be more robust, as it will then find the other files
  // based on its own internal logic (like `previewFeatures = ["multiFileSchema"]`).
  // For getDMMF, we will manually concatenate.

  // Read and parse all schema files for DMMF
  console.log('Reading Prisma schema files for DMMF generation...')
  const schemaFiles = readdirSync(schemaDir).filter(file => file.endsWith('.prisma'))

  if (schemaFiles.length === 0) {
    console.error(`Error: No .prisma files found in directory ${schemaDir}`)
    process.exit(1)
  }

  let combinedSchemaContent = ''
  console.log('Concatenating schema files:')
  for (const file of schemaFiles) {
    const filePath = join(schemaDir, file)
    console.log(`  - ${filePath}`)
    combinedSchemaContent += readFileSync(filePath, 'utf-8') + '\n\n' // Add newlines between files
  }

  const dmmf = await getDMMF({ datamodel: combinedSchemaContent })

  // Extract models and enums from parsed schema
  const models = dmmf.datamodel.models
  const enums = dmmf.datamodel.enums

  // Generate models
  console.log('Generating TypeScript models...')
  const modelsOutput = generateModels(models, enums)
  writeFileSync(join(outputDir, 'models.ts'), modelsOutput)

  // Generate enums
  console.log('Generating TypeScript enums...')
  const enumsOutput = generateEnums(enums)
  writeFileSync(join(outputDir, 'enums.ts'), enumsOutput)

  // Generate index file
  console.log('Generating index file...')
  const indexOutput = generateIndex()
  writeFileSync(join(outputDir, 'index.ts'), indexOutput)

  console.log('Models and enums generated successfully!')
}

const SCALAR_TS_TYPE: Record<string, string> = {
  Int: 'number',
  Float: 'number',
  Decimal: 'Decimal',
  String: 'string',
  ID: 'string',
  Boolean: 'boolean',
  DateTime: 'Date',
  Json: 'JsonValue',
  BigInt: 'bigint',
  Bytes: 'Buffer',
}

const SCALAR_GQL_TYPE: Record<string, string> = {
  Int: 'Int',
  Float: 'Float',
  Decimal: 'GraphQLDecimal',
  BigInt: 'GraphQLBigInt',
  Json: 'GraphQLJSONObject',
  DateTime: 'GraphQLISODateTime',
  Boolean: 'Boolean',
  String: 'String',
  ID: 'String',
}

function resolveGraphQLType(originalType: string, kind: string): string {
  if (kind === 'scalar') return SCALAR_GQL_TYPE[originalType] ?? originalType
  return originalType
}

function resolveTsType(originalType: string, kind: string): string {
  if (kind === 'scalar') return SCALAR_TS_TYPE[originalType] ?? originalType
  return originalType
}

function buildFieldDecorator(field: any): string {
  const isRelation = field.kind === 'object'
  const isFieldRequired = isRelation ? false : field.isRequired
  const gqlType = resolveGraphQLType(field.type, field.kind)
  const decoratorType = field.isList ? `() => [${gqlType}]` : `() => ${gqlType}`
  const options = isFieldRequired ? '' : ', { nullable: true }'
  return `@Field(${decoratorType}${options})`
}

function buildFieldDeclaration(field: any): string {
  const isRelation = field.kind === 'object'
  const isFieldRequired = isRelation ? false : field.isRequired
  let tsType = resolveTsType(field.type, field.kind)
  if (isRelation) tsType = `Partial<${tsType}>`
  const typeMarker = isFieldRequired ? '!' : '?'
  const nullUnion = isFieldRequired ? '' : ' | null'
  return `  ${field.name}${typeMarker}: ${tsType}${field.isList ? '[]' : ''}${nullUnion};`
}

function usesType(models: readonly any[], type: string): boolean {
  return models.some(m => m.fields.some((f: { type: string }) => f.type === type))
}

function generateModels(models: readonly any[], enums: readonly any[]): string {
  const gqlImports = ['Field', 'ObjectType', 'Int']
  if (usesType(models, 'Float')) gqlImports.push('Float')
  if (usesType(models, 'DateTime')) gqlImports.push('GraphQLISODateTime')

  let output = `import { ${gqlImports.join(', ')} } from '@nestjs/graphql';\n`
  output += `import { GraphQLJSONObject } from 'graphql-type-json';\n`

  if (usesType(models, 'Decimal')) {
    output += `import Decimal from 'decimal.js';\n`
    output += `import { GraphQLDecimal } from 'prisma-graphql-type-decimal';\n`
  }
  if (usesType(models, 'BigInt')) output += `import { GraphQLBigInt } from 'graphql-scalars';\n`
  if (usesType(models, 'Json'))
    output += `import type { JsonValue } from '@prisma/client/runtime/client';\n`

  const enumNames = enums.map((e: { name: string }) => e.name)
  if (enumNames.length > 0) output += `import { ${enumNames.join(', ')} } from './enums';\n`
  output += `\n`

  for (const model of models) {
    output += `@ObjectType({ description: undefined })\nexport class ${model.name} {\n`
    for (const field of model.fields) {
      output += `  ${buildFieldDecorator(field)}\n`
      output += `${buildFieldDeclaration(field)}\n\n`
    }
    output += `}\n\n`
  }
  return output
}

function generateEnums(enums: readonly any[]): string {
  let output = '// Generated from Prisma schema\n\n'
  output += "import { registerEnumType } from '@nestjs/graphql';\n"

  if (enums.length > 0) {
    const enumNames = enums.map(e => e.name).join(', ')
    // Import first to make enums available in scope, then export separately
    output += `import { ${enumNames} } from '${prismaImportPath}';\n`
    output += `export { ${enumNames} };\n\n`

    enums.forEach(enumType => {
      output += `registerEnumType(${enumType.name}, { name: '${enumType.name}' });\n\n`
    })
  } else {
    output += '// No enums found in schema to generate.\n'
  }

  return output
}

function generateIndex(): string {
  return `// Generated from Prisma schema
export * from './models'
export * from './enums'
`
}

main().catch(e => {
  console.error('Error during generation:', e)
  process.exit(1)
})
