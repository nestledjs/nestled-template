import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parse } from 'yaml'

type UpgradeNote = {
  id?: unknown
  title?: unknown
  priority?: unknown
  area?: unknown
  type?: unknown
  delivery?: unknown
  intent?: unknown
  why?: unknown
  affectedPaths?: unknown
  packageReleases?: unknown
  skipIf?: unknown
  verification?: unknown
  agentHints?: unknown
}

type PackageRelease = {
  name?: unknown
  sourcePath?: unknown
  targetVersion?: unknown
  versionRange?: unknown
}

const notesDir = '.nestled-updates/upgrade-notes'
const idPattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/
const priorities = new Set(['critical', 'high', 'normal', 'low', 'ignore'])
const areas = new Set(['auth', 'billing', 'admin', 'ui', 'api', 'web', 'database', 'infra', 'docs'])
const types = new Set([
  'security',
  'correctness',
  'feature',
  'infra',
  'deps',
  'design',
  'docs',
  'cleanup',
])
const deliveries = new Set(['code-patch', 'package-release', 'hybrid'])
const publishedPackages = new Map([
  ['@nestledjs/data-browser', 'libs/data-browser'],
  ['@nestledjs/shared-components', 'libs/shared-components'],
  ['@nestledjs/access-control', 'libs/access-control'],
])

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isNonEmptyString)

const includesCodePatch = (delivery: unknown): boolean =>
  delivery === 'code-patch' || delivery === 'hybrid'

const includesPackageRelease = (delivery: unknown): boolean =>
  delivery === 'package-release' || delivery === 'hybrid'

const validateOptionalStringList = (
  note: UpgradeNote,
  key: 'skipIf' | 'verification' | 'agentHints',
  errors: string[],
) => {
  const value = note[key]

  if (value !== undefined && !isStringList(value)) {
    errors.push(`${key} must be a list of non-empty strings when present`)
  }
}

const validatePackageReleaseName = (
  packageRelease: PackageRelease,
  index: number,
  errors: string[],
): string | undefined => {
  if (!isNonEmptyString(packageRelease.name)) {
    errors.push(`packageReleases[${index}].name is required`)
    return undefined
  }

  const expectedSourcePath = publishedPackages.get(packageRelease.name)
  if (!expectedSourcePath) {
    errors.push(
      `packageReleases[${index}].name must be one of: ${Array.from(publishedPackages.keys()).join(', ')}`,
    )
  }

  return expectedSourcePath
}

const validatePackageReleaseSourcePath = (
  packageRelease: PackageRelease,
  index: number,
  expectedSourcePath: string | undefined,
  errors: string[],
) => {
  if (!isNonEmptyString(packageRelease.sourcePath)) {
    errors.push(`packageReleases[${index}].sourcePath is required`)
    return
  }

  if (expectedSourcePath && packageRelease.sourcePath !== expectedSourcePath) {
    const packageName = isNonEmptyString(packageRelease.name) ? packageRelease.name : 'package'
    errors.push(
      `packageReleases[${index}].sourcePath must be ${expectedSourcePath} for ${packageName}`,
    )
  }
}

const validateOptionalPackageReleaseVersion = (value: unknown, path: string, errors: string[]) => {
  if (value !== undefined && !isNonEmptyString(value)) {
    errors.push(`${path} must be a non-empty string when present`)
  }
}

const validatePackageReleaseEntry = (release: unknown, index: number, errors: string[]) => {
  if (!release || typeof release !== 'object' || Array.isArray(release)) {
    errors.push(`packageReleases[${index}] must be an object`)
    return
  }

  const packageRelease = release as PackageRelease
  const expectedSourcePath = validatePackageReleaseName(packageRelease, index, errors)
  validatePackageReleaseSourcePath(packageRelease, index, expectedSourcePath, errors)
  validateOptionalPackageReleaseVersion(
    packageRelease.targetVersion,
    `packageReleases[${index}].targetVersion`,
    errors,
  )
  validateOptionalPackageReleaseVersion(
    packageRelease.versionRange,
    `packageReleases[${index}].versionRange`,
    errors,
  )
}

const validatePackageReleases = (value: unknown, errors: string[]) => {
  if (!Array.isArray(value)) {
    errors.push('packageReleases must be a list when delivery includes package-release')
    return
  }

  if (value.length === 0) {
    errors.push(
      'packageReleases must contain at least one package when delivery includes package-release',
    )
    return
  }

  for (const [index, release] of value.entries()) {
    validatePackageReleaseEntry(release, index, errors)
  }
}

const getYamlFiles = (dir: string): string[] =>
  readdirSync(dir)
    .map(file => join(dir, file))
    .filter(file => statSync(file).isFile() && file.endsWith('.yaml'))
    .sort((left, right) => left.localeCompare(right))

const validateIdentity = (note: UpgradeNote, filenameId: string, errors: string[]) => {
  if (!isNonEmptyString(note.id)) {
    errors.push('id is required')
    return
  }

  if (!idPattern.test(note.id)) {
    errors.push('id must match YYYY-MM-DD-short-description')
  }

  if (note.id !== filenameId) {
    errors.push(`id must match filename (${filenameId})`)
  }
}

const validateRequiredSetValue = (
  value: unknown,
  field: string,
  allowedValues: Set<string>,
  errors: string[],
) => {
  if (!isNonEmptyString(value)) {
    errors.push(`${field} is required`)
    return
  }

  if (!allowedValues.has(value)) {
    errors.push(`${field} must be one of: ${Array.from(allowedValues).join(', ')}`)
  }
}

const validateRequiredMetadata = (note: UpgradeNote, errors: string[]) => {
  if (!isNonEmptyString(note.title)) {
    errors.push('title is required')
  }

  validateRequiredSetValue(note.priority, 'priority', priorities, errors)
  validateRequiredSetValue(note.area, 'area', areas, errors)
  validateRequiredSetValue(note.type, 'type', types, errors)
}

const validateDelivery = (note: UpgradeNote, errors: string[]) => {
  if (!isNonEmptyString(note.delivery)) {
    errors.push('delivery is required unless priority is ignore')
    return
  }

  if (!deliveries.has(note.delivery)) {
    errors.push(`delivery must be one of: ${Array.from(deliveries).join(', ')}`)
  }
}

const validateIntentAndWhy = (note: UpgradeNote, errors: string[]) => {
  if (!isNonEmptyString(note.intent)) {
    errors.push('intent is required unless priority is ignore')
  }

  if (!isNonEmptyString(note.why)) {
    errors.push('why is required unless priority is ignore')
  }
}

const validateAffectedPaths = (note: UpgradeNote, errors: string[]) => {
  if (includesCodePatch(note.delivery)) {
    if (!isStringList(note.affectedPaths) || note.affectedPaths.length === 0) {
      errors.push('affectedPaths must contain at least one path when delivery includes code-patch')
    }
    return
  }

  if (note.affectedPaths !== undefined && !isStringList(note.affectedPaths)) {
    errors.push('affectedPaths must be a list of non-empty strings when present')
  }
}

const validatePackageReleaseField = (note: UpgradeNote, errors: string[]) => {
  if (includesPackageRelease(note.delivery)) {
    validatePackageReleases(note.packageReleases, errors)
    return
  }

  if (
    note.packageReleases !== undefined &&
    (!Array.isArray(note.packageReleases) || note.packageReleases.length > 0)
  ) {
    errors.push(
      'packageReleases must be omitted or an empty list unless delivery includes package-release',
    )
  }
}

const validatePropagatingNote = (note: UpgradeNote, errors: string[]) => {
  validateDelivery(note, errors)
  validateIntentAndWhy(note, errors)
  validateAffectedPaths(note, errors)
  validatePackageReleaseField(note, errors)
}

const validateIgnoredNote = (note: UpgradeNote, errors: string[]) => {
  if (
    note.delivery !== undefined &&
    (!isNonEmptyString(note.delivery) || !deliveries.has(note.delivery))
  ) {
    errors.push(`delivery must be one of: ${Array.from(deliveries).join(', ')} when present`)
  }

  if (note.affectedPaths !== undefined && !isStringList(note.affectedPaths)) {
    errors.push('affectedPaths must be a list of non-empty strings when present')
  }

  if (note.packageReleases !== undefined && !Array.isArray(note.packageReleases)) {
    errors.push('packageReleases must be a list when present')
  }
}

const validateNote = (filePath: string): string[] => {
  const errors: string[] = []
  const filenameId = basename(filePath, '.yaml')
  let note: UpgradeNote

  try {
    note = parse(readFileSync(filePath, 'utf8')) as UpgradeNote
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return [`YAML parse failed: ${message}`]
  }

  if (!note || typeof note !== 'object' || Array.isArray(note)) {
    return ['note must be a YAML object']
  }

  validateIdentity(note, filenameId, errors)
  validateRequiredMetadata(note, errors)

  if (note.priority === 'ignore') {
    validateIgnoredNote(note, errors)
  } else {
    validatePropagatingNote(note, errors)
  }

  validateOptionalStringList(note, 'skipIf', errors)
  validateOptionalStringList(note, 'verification', errors)
  validateOptionalStringList(note, 'agentHints', errors)

  return errors
}

const files = getYamlFiles(notesDir)
let errorCount = 0

for (const file of files) {
  const errors = validateNote(file)

  if (errors.length > 0) {
    errorCount += errors.length
    console.error(`\n${file}`)
    for (const error of errors) {
      console.error(`  - ${error}`)
    }
  }
}

if (errorCount > 0) {
  console.error(`\nUpgrade note validation failed with ${errorCount} error(s).`)
  process.exit(1)
}

console.log(
  files.length === 1 ? 'Validated 1 upgrade note.' : `Validated ${files.length} upgrade notes.`,
)
