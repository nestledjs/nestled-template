import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
// These paths identify package sources in the upstream nestled-dev-template promotion source.
// The public nestled-template checkout intentionally imports the packages and omits their source.
// package name -> the path IN THIS REPO where its source lives, or null when the package is
// published from a different repository. @nestledjs/doctor and @nestledjs/generators are of the
// latter kind: their source is the nestled monorepo, so there is no in-repo path a note could name,
// and demanding one would force every adopter to invent a lie.
const upstreamPublishedPackages = new Map<string, string | null>([
  ['@nestledjs/data-browser', 'libs/data-browser'],
  ['@nestledjs/shared-components', 'libs/shared-components'],
  ['@nestledjs/access-control', 'libs/access-control'],
  ['@nestledjs/doctor', null],
  ['@nestledjs/generators', null],
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
): string | null | undefined => {
  if (!isNonEmptyString(packageRelease.name)) {
    errors.push(`packageReleases[${index}].name is required`)
    return undefined
  }

  if (!upstreamPublishedPackages.has(packageRelease.name)) {
    errors.push(
      `packageReleases[${index}].name must be one of: ${Array.from(upstreamPublishedPackages.keys()).join(', ')}`,
    )
    // undefined, NOT null: null means "published from another repository, no sourcePath expected",
    // so returning it here would let an unrecognized package skip sourcePath validation entirely —
    // one bad name silently disabling a second check.
    return undefined
  }

  return upstreamPublishedPackages.get(packageRelease.name) ?? null
}

const validatePackageReleaseSourcePath = (
  packageRelease: PackageRelease,
  index: number,
  expectedSourcePath: string | null | undefined,
  errors: string[],
) => {
  // A package published from another repository has no in-repo source, so naming one is an error
  // rather than an omission.
  if (expectedSourcePath === null) {
    if (packageRelease.sourcePath !== undefined) {
      errors.push(
        `packageReleases[${index}].sourcePath must be omitted — that package is published from another repository`,
      )
    }
    return
  }

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

// The notes directory only exists while notes are pending — "nothing to apply" is the ordinary
// steady state, not an error, so a missing directory must validate as an empty set rather than
// throw ENOENT and fail CI precisely when there is nothing wrong (#136).
const getYamlFiles = (dir: string): string[] => {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map(file => join(dir, file))
    .filter(file => statSync(file).isFile() && file.endsWith('.yaml'))
    .sort((left, right) => left.localeCompare(right))
}

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

if (files.length === 0) {
  console.log('No upgrade notes to validate.')
} else {
  console.log(
    files.length === 1 ? 'Validated 1 upgrade note.' : `Validated ${files.length} upgrade notes.`,
  )
}
